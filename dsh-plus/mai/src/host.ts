import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs';
import { limits } from './limits.js';
import { createHash } from 'node:crypto';

/** Stable public codes only: never expose provider exceptions or raw file contents. */
export class MetadataError extends Error {
  constructor(readonly code: 'READ_BOUNDARY' | 'NOT_DIRECTORY' | 'NOT_FILE' | 'INVALID_JSON' | 'UNSTABLE_METADATA' | 'READ_FAILED') {
    super(code);
    this.name = 'MetadataError';
  }
}

/** Read-only host seam. The caller supplies a trusted deployment read root. */
export class MetadataReader {
  constructor(private readonly fs: FileSystem, private readonly allowedRoot: FsTarget) {}

  async project(path: string, signal: AbortSignal): Promise<FsTarget> {
    return this.protect(signal, async () => {
      const target = await this.fs.resolve(path, { signal });
      if (!this.fs.contains(this.allowedRoot, target)) throw new MetadataError('READ_BOUNDARY');
      if ((await this.fs.stat(target, signal))?.type !== 'directory') throw new MetadataError('NOT_DIRECTORY');
      return target;
    });
  }

  async json(project: FsTarget, filename: 'package.json' | '.dsh-project-check.json', signal: AbortSignal): Promise<unknown | undefined> {
    return (await this.metadata(project, filename, signal)).value;
  }

  async metadata(project: FsTarget, filename: 'package.json' | '.dsh-project-check.json', signal: AbortSignal): Promise<{ value: unknown; hash: string | null }> {
    return this.protect(signal, async () => {
      if (!this.fs.contains(this.allowedRoot, project)) throw new MetadataError('READ_BOUNDARY');
      for (let attempt = 0; attempt < 2; attempt++) {
        signal.throwIfAborted();
        const cwd = this.fs.processPath(project);
        const entry = await this.fs.lstat(filename, { cwd }, signal);
        if (!entry) return { value: undefined, hash: null };
        if (entry.type !== 'file') throw new MetadataError('NOT_FILE');
        const target = await this.fs.resolve(filename, { cwd, signal });
        if (!this.fs.contains(project, target)) throw new MetadataError('READ_BOUNDARY');
        const before = await this.fs.stat(target, signal);
        if (before?.type !== 'file') throw new MetadataError('NOT_FILE');
        const bytes = await this.fs.readBytes(target, signal, limits.metadataBytes);
        const after = await this.fs.stat(target, signal);
        if (after?.type !== 'file' || before.version !== after.version) continue;
        try {
          return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown, hash: createHash('sha256').update(bytes).digest('hex') };
        } catch {
          throw new MetadataError('INVALID_JSON');
        }
      }
      throw new MetadataError('UNSTABLE_METADATA');
    });
  }

  /** Check fixed conflicting lock names without reading contents or following links. */
  async conflictingLockfile(project: FsTarget, signal: AbortSignal): Promise<boolean> {
    return this.protect(signal, async () => {
      if (!this.fs.contains(this.allowedRoot, project)) throw new MetadataError('READ_BOUNDARY');
      const cwd = this.fs.processPath(project);
      let present = false;
      for (const filename of ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
        signal.throwIfAborted();
        // Any entry, including a link or directory, is a conflict; never read its target.
        if (await this.fs.lstat(filename, { cwd }, signal)) present = true;
      }
      return present;
    });
  }

  private async protect<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof MetadataError) throw error;
      throw new MetadataError('READ_FAILED');
    }
  }
}
