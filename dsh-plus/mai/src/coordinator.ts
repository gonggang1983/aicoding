import { isAbsolute } from 'node:path';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { RuntimeHost } from './host-runtime.js';
import type { PublicPlan, RunReport } from './types.js';
import { SessionStore, CheckError } from './plan.js';
import { MetadataProjection } from './redact.js';
import { runTask, initialTask } from './runner.js';
import { disclaimer, privacyNotice, executionRisk, overall, planMarkdown, reportNotices } from './report.js';
import { unavailableGit } from './git.js';

type Host = Pick<RuntimeHost, 'snapshot' | 'launch' | 'approval' | 'git' | 'dispose'>;
export class Coordinator {
  readonly store = new SessionStore();
  private disposed = new AbortController();
  private running = new Set<Promise<RunReport>>();
  constructor(private readonly host: Host) {}
  private owner(exec: ToolRunContext): object {
    if (!exec.agent?.session) throw new CheckError('SESSION_REQUIRED');
    return exec.agent.session;
  }
  async preview(path: string, taskIds: string[], exec: ToolRunContext): Promise<PublicPlan> {
    exec.signal.throwIfAborted();
    if (this.disposed.signal.aborted) throw new CheckError('PLUGIN_DISPOSED');
    if (!isAbsolute(path)) throw new CheckError('ABSOLUTE_PROJECT_PATH_REQUIRED');
    const owner = this.owner(exec);
    const signal = AbortSignal.any([exec.signal, this.disposed.signal]);
    const snapshot = await this.host.snapshot(path, { ...exec, signal });
    // A provider may finish successfully after cancellation or unload. Never
    // repopulate the cleared store with a late preview in either case.
    if (this.disposed.signal.aborted) throw new CheckError('PLUGIN_DISPOSED');
    signal.throwIfAborted();
    const projection = new MetadataProjection(snapshot.config.redactLiterals);
    const exact = (value: string) => {
      const safe = projection.field(value);
      // A redacted plan cannot be meaningfully approved. Never output a partial plan.
      if (safe.hidden) throw new CheckError('PLAN_CONTAINS_UNDISPLAYABLE_DATA');
      return safe.text;
    };
    const projectPath = exact(snapshot.path);
    const nodeExecutable = exact(snapshot.nodeExecutable);
    const npmCliPath = exact(snapshot.npmCliPath);
    const tasks = snapshot.config.tasks.map(task => {
      const selected = taskIds.includes(task.id);
      const args = task.args.map(exact);
      return { id: exact(task.id), name: exact(task.name), script: exact(task.script), args,
        argv: [nodeExecutable, npmCliPath, 'run-script', task.script, '--', ...args],
        timeoutSeconds: task.timeoutSeconds, selected };
    });
    return this.store.create(owner, snapshot, taskIds, { projectPath, nodeExecutable, npmCliPath, tasks, mode: snapshot.policy.mode, risk: executionRisk });
  }
  run(input: PublicPlan, exec: ToolRunContext): Promise<RunReport> {
    const work = this.execute(input, exec);
    this.running.add(work);
    void work.finally(() => this.running.delete(work)).catch(() => {});
    return work;
  }
  private async execute(input: PublicPlan, originalExec: ToolRunContext): Promise<RunReport> {
    const owner = this.owner(originalExec);
    originalExec.signal.throwIfAborted();
    if (this.disposed.signal.aborted) throw new CheckError('PLUGIN_DISPOSED');
    const plan = this.store.consume(owner, input);
    const signal = AbortSignal.any([originalExec.signal, this.disposed.signal]);
    const exec = { ...originalExec, signal };
    const projection = new MetadataProjection(plan.snapshot.config.redactLiterals);
    const report: RunReport = {
      reportVersion: 1, kind: 'run', runId: plan.public.planId, planId: plan.public.planId, projectPath: plan.public.projectPath,
      projectName: projection.field(plan.snapshot.projectName).text,
      candidates: plan.snapshot.candidates.slice(0, 200).map(value => projection.field(value).text),
      plan: plan.public, evidenceGaps: [], notices: [], gitBefore: unavailableGit('NOT_COLLECTED'),
      startedAt: new Date().toISOString(), endedAt: '', overall: 'inconclusive', approval: 'not_requested', reason: 'NO_TASKS_SELECTED',
      tasks: plan.tasks.map(task => initialTask(task, plan.selectedIds.has(task.id))), git: unavailableGit('NOT_COLLECTED'),
      environment: { node: process.version, npm: '11.16.0', dsh: 'unverified (required: 0.2.2-rc.3)' }, disclaimer, privacyNotice,
    };
    // These labels were all checked for exact, secret-free projection at preview.
    const release = this.store.acquire(String(plan.snapshot.target.targetKey));
    try {
      if (!release) { report.reason = 'BUSY'; return report; }
      if (plan.selectedIds.size === 0) return report;
      report.reason = 'AWAITING_APPROVAL';
      report.approval = await this.host.approval(planMarkdown(plan.public), exec);
      if (report.approval !== 'allowed-once') {
        report.reason = 'APPROVAL_NOT_GRANTED';
        for (const task of report.tasks) if (task.selected) task.reason = 'APPROVAL_NOT_GRANTED';
        return report;
      }
      report.gitBefore = await this.host.git(plan.snapshot.path, plan.snapshot.config.redactLiterals, exec);
      for (let index = 0; index < plan.tasks.length; index++) {
        const task = plan.tasks[index]!;
        if (!plan.selectedIds.has(task.id)) continue;
        if (signal.aborted) break;
        let changed = true;
        try { changed = (await this.host.snapshot(plan.snapshot.path, exec)).fingerprint !== plan.snapshot.fingerprint; }
        catch { signal.throwIfAborted(); }
        if (changed) { report.reason = 'PLAN_CHANGED'; break; }
        report.tasks[index] = await runTask(task, plan.snapshot.config.redactLiterals, signal,
          taskSignal => this.host.launch([plan.snapshot.nodeExecutable, plan.snapshot.npmCliPath, 'run-script', task.script, '--', ...task.args], plan.snapshot.path, exec, taskSignal, plan.snapshot.policy));
        if (report.tasks[index]!.reason === 'PLAN_CHANGED') { report.reason = 'PLAN_CHANGED'; break; }
        if (report.tasks[index]!.status === 'unknown') { report.reason = 'TERMINATION_OR_OUTCOME_UNKNOWN'; break; }
        report.reason = 'FINISHED';
      }
      if (!signal.aborted) report.git = await this.host.git(plan.snapshot.path, plan.snapshot.config.redactLiterals, exec);
      return report;
    } catch {
      report.reason = signal.aborted ? 'CANCELLED' : 'HOST_OPERATION_FAILED';
      return report;
    } finally {
      if (signal.aborted) report.reason = this.disposed.signal.aborted ? 'PLUGIN_DISPOSED' : 'CANCELLED';
      for (const task of report.tasks) if (task.selected && task.status === 'not_run' && task.reason === 'NOT_STARTED') task.reason = report.reason;
      report.endedAt = new Date().toISOString(); report.overall = overall(report.tasks);
      report.evidenceGaps = [
        'HOST_VERSION_IDENTITY_UNVERIFIED',
        ...(plan.snapshot.candidates.length > report.candidates.length ? ['CANDIDATES_OMITTED'] : []),
        ...(report.gitBefore.status !== 'available' || report.git.status !== 'available' ? ['GIT_EVIDENCE_INCOMPLETE'] : []),
        ...(report.tasks.some(task => task.selected && (task.status === 'not_run' || task.status === 'unknown')) ? ['EXECUTION_EVIDENCE_INCOMPLETE'] : []),
        ...(report.tasks.some(task => task.truncated) ? ['OUTPUT_TRUNCATED'] : []),
        ...(report.tasks.some(task => task.outputIncomplete) ? ['OUTPUT_INCOMPLETE'] : []),
      ];
      report.notices = reportNotices(report);
      this.store.save(owner, report);
      release?.();
      // Partial safe evidence is cached before cancellation propagates.
      signal.throwIfAborted();
    }
  }
  report(runId: string, exec: ToolRunContext): RunReport | undefined { exec.signal.throwIfAborted(); return this.store.report(this.owner(exec), runId); }
  async dispose(): Promise<void> {
    this.disposed.abort();
    try {
      await this.host.dispose();
    } finally {
      // Provider cleanup failures must not leave session data in memory.
      await Promise.allSettled([...this.running]);
      this.store.clear();
    }
  }
}
