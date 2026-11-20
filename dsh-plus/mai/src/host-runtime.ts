import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-user-approval';
import type {} from '@deepseek-ai/dsh-subprocess';
import type {} from '@deepseek-ai/dsh-sandbox-policy';
import type { RunnerFailureRule } from '@deepseek-ai/dsh-sandbox';
import { dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { MetadataReader } from './host.js';
import { packageScripts, parseConfig, toolchainBlockers } from './config.js';
import { CheckError, digest } from './plan.js';
import { GitParser, unavailableGit } from './git.js';
import { limits } from './limits.js';
import type { ProjectSnapshot, GitSummary } from './types.js';
import type { Launch } from './runner.js';
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess';

export interface RuntimeConfig { nodeExecutable?: string; npmCliPath?: string; requireFullEnforcement?: boolean }

/** All process/approval/toolchain I/O stays on the existing host capability seams. */
export class RuntimeHost {
  private handles = new Set<SubprocessHandle>();
  constructor(private readonly ctx: Context, private readonly reader: MetadataReader, private readonly config: RuntimeConfig) {}

  async snapshot(path: string, exec: ToolRunContext): Promise<ProjectSnapshot> {
    const signal = exec.signal;
    const target = await this.reader.project(path, signal);
    const pkg = await this.reader.metadata(target, 'package.json', signal);
    const raw = await this.reader.metadata(target, '.dsh-project-check.json', signal);
    const conflict = await this.reader.conflictingLockfile(target, signal);
    if (toolchainBlockers(pkg.value, conflict).length) throw new CheckError('TOOLCHAIN_BLOCKED');
    if (raw.value === undefined) throw new CheckError('CONFIG_REQUIRED');
    const parsed = parseConfig(raw.value, packageScripts(pkg.value));
    const mappedNode = this.ctx.fs.processPathFromHostPath(process.execPath);
    const configuredNode = this.config.nodeExecutable ?? mappedNode;
    if (!configuredNode || !isAbsolute(configuredNode) || !this.config.npmCliPath || !isAbsolute(this.config.npmCliPath)) throw new CheckError('TRUSTED_TOOLCHAIN_REQUIRED');
    const node = await this.ctx.fs.resolve(configuredNode, { signal });
    const ownNode = mappedNode ? await this.ctx.fs.resolve(mappedNode, { signal }) : undefined;
    // Only the running, fixed Node binary has a known version without executing a preview probe.
    if (!ownNode || node.targetKey !== ownNode.targetKey || process.version !== 'v24.18.0') throw new CheckError('NODE_VERSION_OR_WORLD_MISMATCH');
    const nodeInfo = await this.ctx.fs.stat(node, signal);
    if (nodeInfo?.type !== 'file') throw new CheckError('NODE_NOT_FILE');
    const cli = await this.ctx.fs.resolve(this.config.npmCliPath, { signal });
    const cliPath = this.ctx.fs.processPath(cli);
    const npmPackage = join(dirname(cliPath), '..', 'package.json');
    const readTrusted = async (path: string) => {
      const entry = await this.ctx.fs.lstat(path, {}, signal);
      if (entry?.type !== 'file') throw new CheckError('TOOLCHAIN_NOT_REGULAR_FILE');
      const file = await this.ctx.fs.resolve(path, { signal });
      const before = await this.ctx.fs.stat(file, signal);
      const bytes = await this.ctx.fs.readBytes(file, signal, limits.metadataBytes);
      const after = await this.ctx.fs.stat(file, signal);
      if (!before || before.version !== after?.version) throw new CheckError('TOOLCHAIN_UNSTABLE');
      return bytes;
    };
    const cliBytes = await readTrusted(cliPath);
    const npmBytes = await readTrusted(npmPackage);
    let npm: unknown;
    try { npm = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(npmBytes)); }
    catch { throw new CheckError('INVALID_NPM_METADATA'); }
    if (!npm || typeof npm !== 'object' || (npm as Record<string, unknown>).name !== 'npm' || (npm as Record<string, unknown>).version !== '11.16.0') throw new CheckError('NPM_VERSION_MISMATCH');
    const policy = this.ctx.sandboxPolicy.resolve(exec.agent ? { session: exec.agent.session } : {});
    const pathName = this.ctx.fs.processPath(target);
    const nodeExecutable = this.ctx.fs.processPath(node);
    const fingerprint = digest({ package: pkg.hash, config: raw.hash, conflict, nodeExecutable, nodeVersion: process.version,
      nodeFileVersion: nodeInfo.version, npmCliPath: cliPath,
      npmPackage: createHash('sha256').update(npmBytes).digest('hex'), npmCli: createHash('sha256').update(cliBytes).digest('hex'), policy });
    const packageName = Object.getOwnPropertyDescriptor(pkg.value, 'name')?.value as unknown;
    return { target, path: pathName, projectName: typeof packageName === 'string' ? packageName : '(unnamed)',
      candidates: Object.keys(packageScripts(pkg.value)).sort(), config: parsed, fingerprint, nodeExecutable, npmCliPath: cliPath, policy };
  }

  async launch(argv: readonly string[], cwd: string, exec: ToolRunContext, signal: AbortSignal, expectedPolicy?: ProjectSnapshot['policy']): Promise<Launch> {
    signal.throwIfAborted();
    const resolvePolicy = () => this.ctx.sandboxPolicy.resolve(exec.agent ? { session: exec.agent.session } : {});
    const policy = resolvePolicy();
    if (expectedPolicy && digest(policy) !== digest(expectedPolicy)) throw new CheckError('PLAN_CHANGED');
    let actual = [...argv];
    let enforcement = 'none';
    let runnerFailureRules: readonly RunnerFailureRule[] = [];
    if (policy.mode !== 'danger-full-access') {
      const confined = await this.ctx.sandbox.confine(argv, { ...policy, mode: policy.mode }, signal);
      actual = confined.argv; enforcement = confined.enforcement; runnerFailureRules = confined.runnerFailureRules;
    }
    if (this.config.requireFullEnforcement && enforcement !== 'full') throw new CheckError('FULL_ENFORCEMENT_REQUIRED');
    if (digest(resolvePolicy()) !== digest(policy)) throw new CheckError('PLAN_CHANGED');
    signal.throwIfAborted();
    const handle = this.ctx.subprocess.spawn({ argv: actual, cwd, stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, graceMs: 200, signal });
    this.handles.add(handle);
    return { handle, mode: policy.mode, enforcement, runnerFailureRules, release: () => this.release(handle) };
  }
  release(handle: SubprocessHandle): void { this.handles.delete(handle); }

  async approval(reason: string, exec: ToolRunContext): Promise<string> {
    if (!exec.agent) return 'unavailable';
    try { return await this.ctx.approval.request({ agent: exec.agent, toolName: 'project_check_run', callId: exec.callId, reason, signal: exec.signal }); }
    catch { exec.signal.throwIfAborted(); return 'unavailable'; }
  }

  async git(path: string, literals: readonly string[], exec: ToolRunContext): Promise<GitSummary> {
    const deadline = AbortSignal.any([exec.signal, AbortSignal.timeout(10000)]);
    try {
      const executable = await this.ctx.subprocess.resolveExecutable('git', undefined, deadline);
      const base = [executable, '--no-optional-locks', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false'];
      const command = async (args: string[], consume: (bytes: Uint8Array) => void) => {
        const { handle } = await this.launch([...base, ...args], path, exec, deadline);
        let pipeFailed = !handle.stdout || !handle.stderr;
        let rejectAbort!: () => void;
        const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(new CheckError('GIT_DEADLINE')); });
        deadline.addEventListener('abort', rejectAbort, { once: true });
        if (deadline.aborted) rejectAbort();
        try {
          const drains = [handle.stdout, handle.stderr].flatMap((pipe, index) => {
            if (!pipe) return [];
            return [new Promise<void>(resolve => {
              pipe.on('data', (data: Buffer) => {
                if (index === 0) { try { consume(data); } catch { pipeFailed = true; } }
                // stderr is drained without retaining raw diagnostics.
              });
              pipe.once('end', resolve);
              pipe.once('close', () => { if (!pipe.readableEnded) pipeFailed = true; resolve(); });
              pipe.once('error', () => { pipeFailed = true; resolve(); });
              if (pipe.readableEnded) resolve();
              else if (pipe.destroyed) { pipeFailed = true; resolve(); }
            })];
          });
          const outcome = await Promise.race([handle.done, aborted]);
          // Process completion does not prove that the last pipe bytes arrived.
          await Promise.race([Promise.all(drains), aborted]);
          const empty = await handle.waitForExit(deadline);
          if (outcome.exitCode !== 0 || !empty || pipeFailed) throw new CheckError('GIT_FAILED');
        } finally {
          deadline.removeEventListener('abort', rejectAbort);
          handle.terminate();
          let empty = false;
          try { empty = await handle.waitForExit(AbortSignal.timeout(limits.terminationConfirmationMs)); } catch { /* unavailable */ }
          for (const pipe of [handle.stdout, handle.stderr]) if (pipe && !pipe.readableEnded) pipe.destroy();
          // Keep unconfirmed handles tracked so unload can try termination again.
          if (empty) this.release(handle);
        }
      };
      const prefix: Buffer[] = []; let size = 0;
      await command(['rev-parse', '--show-prefix'], bytes => {
        size += bytes.byteLength;
        if (size <= 4096) prefix.push(Buffer.from(bytes));
      });
      if (size > 4096) return unavailableGit('GIT_PREFIX_TOO_LARGE');
      const relativePrefix = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(prefix)).replace(/\r?\n$/, '');
      const parser = new GitParser(relativePrefix);
      await command(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'], bytes => parser.append(bytes));
      return parser.finish(literals);
    } catch { exec.signal.throwIfAborted(); return unavailableGit(); }
  }

  async dispose(): Promise<void> {
    for (const handle of this.handles) handle.terminate();
    await Promise.all([...this.handles].map(async handle => {
      try { await handle.waitForExit(AbortSignal.timeout(limits.terminationConfirmationMs)); } catch { /* no fabricated exit evidence */ }
    }));
    this.handles.clear();
  }
}
