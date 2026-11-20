import { performance } from 'node:perf_hooks';
import type { SubprocessHandle, SubprocessOutcome } from '@deepseek-ai/dsh-subprocess';
import type { RunnerFailureRule } from '@deepseek-ai/dsh-sandbox';
import type { Task } from './config.js';
import type { ExecutionEvidence, Status, TaskResult } from './types.js';
import { OutputCapture } from './redact.js';
import { limits } from './limits.js';
import { CheckError } from './plan.js';

export function classify(e: ExecutionEvidence): Status {
  if (e.started === 'no') return 'not_run';
  if (!e.rangeEmpty || e.cause === 'channel_lost') return 'unknown';
  if (e.started === 'yes' && (e.cause === 'timeout' || e.cause === 'cancel')) return 'failed';
  if (e.started !== 'yes' || !e.outcomeKnown) return 'unknown';
  return e.exitCode === 0 ? 'passed' : 'failed';
}
export interface Launch {
  handle: SubprocessHandle; mode: string; enforcement: string;
  runnerFailureRules?: readonly RunnerFailureRule[]; release?: () => void;
}
export function initialTask(task: Task, selected: boolean): TaskResult {
  return { id: task.id, name: task.name, selected, status: 'not_run', reason: selected ? 'NOT_STARTED' : 'NOT_SELECTED',
    startedAt: null, endedAt: null, durationMs: null, exitCode: null,
    stdout: '', stderr: '', truncated: false, outputIncomplete: false, mode: 'not_resolved', enforcement: 'not_resolved' };
}

async function within(work: Promise<unknown>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work.then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}

/** No collect/spill/inherit. A private deadline never aborts the outer run. */
export async function runTask(task: Task, literals: readonly string[], signal: AbortSignal,
  launch: (signal: AbortSignal) => Promise<Launch>): Promise<TaskResult> {
  const result = initialTask(task, true);
  if (signal.aborted) { result.reason = 'CANCELLED_QUEUED'; return result; }
  const capture = new OutputCapture();
  let handle: SubprocessHandle | undefined;
  let outcome: SubprocessOutcome | undefined;
  let release: (() => void) | undefined;
  let runnerRules: readonly RunnerFailureRule[] = [];
  let channelLost = false;
  let rangeEmpty = false;
  let settled = false;
  const state: { cause: ExecutionEvidence['cause'] } = { cause: 'normal' };
  let interrupt!: () => void;
  const interrupted = new Promise<void>(resolve => { interrupt = resolve; });
  const local = new AbortController();
  const abort = () => { if (!settled && state.cause === 'normal') { state.cause = 'cancel'; local.abort(); interrupt(); } };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const startedAt = new Date().toISOString();
  const start = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drains: Promise<void>[] = [];
  try {
    const launched = await launch(local.signal);
    handle = launched.handle; release = launched.release; runnerRules = launched.runnerFailureRules ?? [];
    result.mode = launched.mode; result.enforcement = launched.enforcement;
    timer = setTimeout(() => {
      if (!settled && state.cause === 'normal') { state.cause = 'timeout'; local.abort(); interrupt(); }
    }, task.timeoutSeconds * 1000);
    for (const stream of ['stdout', 'stderr'] as const) {
      const pipe = handle[stream];
      if (!pipe) { capture.incomplete = true; continue; }
      // Flowing listeners keep draining after the retained prefix is full.
      drains.push(new Promise(resolve => {
        pipe.on('data', (data: Buffer | string) => capture.append(stream, typeof data === 'string' ? Buffer.from(data) : data));
        pipe.once('end', resolve);
        pipe.once('close', () => { if (!pipe.readableEnded) capture.incomplete = true; resolve(); });
        pipe.once('error', () => { capture.incomplete = true; resolve(); });
        if (pipe.readableEnded) resolve();
        else if (pipe.destroyed) { capture.incomplete = true; resolve(); }
      }));
    }
    const confirmSettlement = () => { if (outcome && rangeEmpty && !channelLost) settled = true; };
    const done = handle.done.then(value => { outcome = value; confirmSettlement(); }, () => { channelLost = true; interrupt(); });
    let observing = true;
    const empty = handle.waitForExit(local.signal).then(value => {
      if (observing) { rangeEmpty = value; confirmSettlement(); }
    }, () => { if (!local.signal.aborted) channelLost = true; interrupt(); });
    await Promise.race([Promise.all([done, empty]), interrupted]);
    observing = false;
    if (!rangeEmpty || channelLost || state.cause !== 'normal') {
      handle.terminate();
      try { rangeEmpty = await handle.waitForExit(AbortSignal.timeout(limits.terminationConfirmationMs)); }
      catch { rangeEmpty = false; }
    }
    // done may lag range observation; independently bounded, never wait forever.
    await within(done, 50);
    settled = true;
    if (!rangeEmpty) capture.incomplete = true;
    if (!await within(Promise.all(drains), 100)) capture.incomplete = true;
    const evidence: ExecutionEvidence = {
      started: outcome && !channelLost ? 'yes' : 'possible', rangeEmpty,
      outcomeKnown: outcome !== undefined, exitCode: outcome?.exitCode ?? null,
      cause: channelLost ? 'channel_lost' : state.cause,
    };
    // stderr is task-controlled: a matching wrapper signature cannot prove
    // that the task never started. Without an independent startup receipt,
    // preserve the ambiguity and stop scheduling rather than claim not_run.
    if (outcome && capture.runnerFailed(outcome.exitCode, runnerRules)) evidence.started = 'possible';
    result.status = classify(evidence);
    result.reason = result.status === 'unknown' ? 'TERMINATION_OR_OUTCOME_UNKNOWN'
      : state.cause === 'cancel' ? 'CANCELLED' : state.cause === 'timeout' ? 'TIMEOUT'
      : result.status === 'passed' ? 'EXIT_ZERO' : 'EXIT_NONZERO_OR_SIGNAL';
    if (evidence.started === 'yes') {
      result.startedAt = startedAt;
      if (rangeEmpty) { result.endedAt = new Date().toISOString(); result.durationMs = Math.max(0, performance.now() - start); }
      result.exitCode = outcome?.exitCode ?? null;
    }
  } catch (error) {
    if (handle) {
      capture.incomplete = true;
      handle.terminate();
      try { await handle.waitForExit(AbortSignal.timeout(limits.terminationConfirmationMs)); } catch { /* unknown is retained */ }
      result.status = 'unknown'; result.reason = 'PROCESS_CHANNEL_FAILED';
    } else result.reason = signal.aborted ? 'CANCELLED_QUEUED' : error instanceof CheckError ? error.code : 'PREPARATION_FAILED';
  } finally {
    settled = true;
    if (timer) clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    for (const stream of [handle?.stdout, handle?.stderr]) if (stream && !stream.readableEnded) stream.destroy();
    Object.assign(result, capture.finish(literals));
    if (rangeEmpty) release?.();
  }
  return result;
}
