import type { GitSummary } from './types.js';
import { limits } from './limits.js';
import { MetadataProjection, withheld } from './redact.js';

export const unavailableGit = (reason = 'GIT_UNAVAILABLE'): GitSummary => ({ status: 'unavailable', reason, capturedAt: new Date().toISOString(), paths: [], totalCount: null, omittedCount: null });

/** Streaming porcelain-v1 -z parser. Retains only one record and sorted top N. */
export class GitParser {
  private bytes: number[] = [];
  private dropping = false;
  private pending: { path: string; status: string } | undefined;
  private entries: { path: string; originalPath: string | null; status: string }[] = [];
  private count = 0;
  private incomplete = false;
  constructor(private readonly prefix: string) {}
  append(chunk: Uint8Array): void {
    for (const byte of chunk) {
      if (byte === 0) {
        if (this.dropping) { this.dropping = false; this.pending = undefined; this.incomplete = true; }
        else this.record(Uint8Array.from(this.bytes));
        this.bytes = [];
      } else if (!this.dropping) {
        if (this.bytes.length >= 4096) { this.bytes = []; this.dropping = true; this.incomplete = true; }
        else this.bytes.push(byte);
      }
    }
  }
  private record(bytes: Uint8Array): void {
    let raw: string;
    try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { this.pending = undefined; this.incomplete = true; return; }
    if (this.pending) {
      const entry = this.pending; this.pending = undefined;
      this.add(entry.path, raw, entry.status); return;
    }
    if (!/^[ MTADRCU?!]{2} /.test(raw)) { this.incomplete = true; return; }
    const status = raw.slice(0, 2);
    const path = raw.slice(3);
    if (/[RC]/.test(status)) this.pending = { path, status };
    else this.add(path, null, status);
  }
  private add(path: string, original: string | null, status: string): void {
    const inside = (value: string) => value.startsWith(this.prefix) && value.length > this.prefix.length;
    if (!inside(path) && !(original !== null && inside(original))) return;
    const relative = inside(path) ? path.slice(this.prefix.length) : '[outside project]';
    const originalPath = original === null ? null : inside(original) ? original.slice(this.prefix.length) : '[outside project]';
    this.count++;
    this.entries.push({ path: relative, originalPath, status });
    this.entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : (a.originalPath ?? '').localeCompare(b.originalPath ?? ''));
    if (this.entries.length > limits.gitPaths) this.entries.pop();
  }
  finish(literals: readonly string[]): GitSummary {
    if (this.bytes.length || this.pending || this.dropping) this.incomplete = true;
    const projection = new MetadataProjection(literals);
    return {
      status: this.incomplete ? 'incomplete' : 'available', reason: this.incomplete ? 'GIT_RECORD_INCOMPLETE' : this.count === 0 ? 'GIT_CLEAN' : 'GIT_STATUS',
      capturedAt: new Date().toISOString(),
      paths: this.entries.map(entry => ({ path: projection.field(entry.path).text || withheld,
        originalPath: entry.originalPath === null ? null : projection.field(entry.originalPath).text, status: entry.status })),
      totalCount: this.incomplete ? null : this.count,
      omittedCount: this.incomplete ? null : Math.max(0, this.count - this.entries.length),
    };
  }
}
