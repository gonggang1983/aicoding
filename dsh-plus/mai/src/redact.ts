import { limits } from './limits.js';
import { classifyRunnerFailure, type RunnerFailureRule } from '@deepseek-ai/dsh-sandbox';

export const withheld = '[withheld]';
const maxFieldBytes = 4096;

/** Conservative metadata rules, not a complete arbitrary task-log sanitizer. */
function credentialShaped(value: string): boolean {
  return /\b(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key)\s*["']?\s*[:=]/i.test(value)
    || /\bauthorization\b\s*["']?\s*[:=]/i.test(value)
    || /\b(?:bearer|basic)\s+\S+/i.test(value)
    || /:\/\/[^\s/]*@/.test(value)
    || /\b(?:sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9_]{12,}|AKIA[A-Z0-9]{16})\b/i.test(value);
}

/**
 * Whole-field metadata projection. Match literals on the ORIGINAL complete
 * field, before any normalization, truncation or Markdown escaping. Hiding the
 * whole field handles overlapping/CRLF/control-character literals without
 * joining text around removed spans. No raw value is retained by this object.
 * This does not implement streaming task-output redaction.
 */
export class MetadataProjection {
  private remaining = limits.outputBytes;
  private readonly literals: readonly string[];
  constructor(literals: readonly string[]) {
    if (literals.some(value => typeof value !== 'string' || value.length === 0)) throw new Error('INVALID_REDACTION_LITERALS');
    this.literals = Object.freeze([...literals]);
  }

  field(raw: string): { text: string; hidden: boolean } {
    const bytes = Buffer.byteLength(raw, 'utf8');
    // Never return a prefix of a field: that could expose a partial secret.
    if (bytes > maxFieldBytes || bytes > this.remaining
      || this.literals.some(literal => raw.includes(literal))
      || credentialShaped(raw)
      || /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(raw)
      || /[\ud800-\udfff]/u.test(raw)) {
      return { text: withheld, hidden: true };
    }
    this.remaining -= bytes;
    return { text: raw, hidden: false };
  }
}

/** Bounded raw prefix, shared by both pipes. Overflow is drained, never spilled. */
export class OutputCapture {
  private retained = 0;
  private ordered: Buffer[] = [];
  private chunks: Record<'stdout' | 'stderr', Buffer[]> = { stdout: [], stderr: [] };
  truncated = false;
  incomplete = false;
  append(stream: 'stdout' | 'stderr', chunk: Uint8Array): void {
    const count = Math.min(chunk.byteLength, Math.max(0, limits.outputBytes - this.retained));
    if (count) {
      const bytes = Buffer.from(chunk.subarray(0, count));
      this.chunks[stream].push(bytes); this.ordered.push(bytes);
    }
    this.retained += count;
    if (count < chunk.byteLength) this.truncated = true;
  }
  runnerFailed(exitCode: number | null, rules: readonly RunnerFailureRule[]): boolean {
    try {
      return !!classifyRunnerFailure(exitCode, new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(this.chunks.stderr)), rules);
    } catch { return false; }
  }
  finish(literals: readonly string[]): { stdout: string; stderr: string; truncated: boolean; outputIncomplete: boolean } {
    let crossStreamSecret = false;
    try {
      const decode = (bytes: Buffer[]) => new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(bytes));
      const joined = [decode(this.ordered), decode([...this.chunks.stdout, ...this.chunks.stderr]), decode([...this.chunks.stderr, ...this.chunks.stdout])];
      crossStreamSecret = joined.some(raw => literals.some(secret => raw.includes(secret)) || credentialShaped(raw));
    } catch { crossStreamSecret = true; }
    const safe = (stream: 'stdout' | 'stderr'): string => {
      try {
        const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(this.chunks[stream]));
        // Whole-field hiding is deliberately more conservative than interval replacement.
        // Any truncated/incomplete field is withheld, including partial secret prefixes.
        if (this.truncated || this.incomplete || crossStreamSecret) return raw.length ? withheld : '';
        if (literals.some(secret => raw.includes(secret)) || credentialShaped(raw)
          || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(raw)) return withheld;
        return raw.replace(/\r\n?/g, '\n');
      } catch { return withheld; }
    };
    const result = { stdout: safe('stdout'), stderr: safe('stderr'), truncated: this.truncated, outputIncomplete: this.incomplete };
    this.chunks = { stdout: [], stderr: [] }; this.ordered = [];
    return result;
  }
}

/** Render dynamic data as literal Markdown text, never a link/HTML/fence. */
export function markdownText(value: string): string {
  return value.replace(/[&<>"'\\`*_{}\[\]()#+.!|~:\-\r\n\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    char => `&#${char.charCodeAt(0)};`);
}
