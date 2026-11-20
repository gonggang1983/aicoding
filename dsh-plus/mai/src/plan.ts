import { createHash, randomUUID } from 'node:crypto';
import type { FrozenPlan, ProjectSnapshot, PublicPlan, RunReport } from './types.js';

export class CheckError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ProjectCheckError'; }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
export function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const ttl = 10 * 60 * 1000;
export class SessionStore {
  private plans = new WeakMap<object, Map<string, FrozenPlan>>();
  private reports = new WeakMap<object, Map<string, { at: number; value: RunReport }>>();
  private locks = new Set<string>();
  constructor(private readonly clock: () => number = Date.now) {}
  create(owner: object, snapshot: ProjectSnapshot, taskIds: string[], publicView: Omit<PublicPlan, 'planId' | 'digest' | 'expiresAt'>): PublicPlan {
    if (new Set(taskIds).size !== taskIds.length || taskIds.some(id => !snapshot.config.tasks.some(task => task.id === id))) throw new CheckError('INVALID_TASK_SELECTION');
    let items = this.plans.get(owner);
    if (!items) this.plans.set(owner, items = new Map());
    for (const [id, plan] of items) if (plan.expires <= this.clock()) items.delete(id);
    while (items.size >= 10) items.delete(items.keys().next().value!);
    const expires = this.clock() + ttl;
    const planId = randomUUID();
    const publicPlan = freeze({ ...publicView, planId, expiresAt: new Date(expires).toISOString(), digest: digest({ publicView, fingerprint: snapshot.fingerprint, planId, expires }) });
    // Own copied data; do not recursively freeze provider-owned FsTarget objects.
    const savedSnapshot: ProjectSnapshot = Object.freeze({ ...snapshot,
      config: freeze(structuredClone(snapshot.config)), policy: freeze(structuredClone(snapshot.policy)),
      candidates: freeze([...snapshot.candidates]),
    });
    items.set(planId, { public: publicPlan, snapshot: savedSnapshot, tasks: savedSnapshot.config.tasks, selectedIds: new Set(taskIds), expires });
    return publicPlan;
  }
  consume(owner: object, input: PublicPlan): FrozenPlan {
    const items = this.plans.get(owner);
    const plan = items?.get(input.planId);
    if (!plan) throw new CheckError('PLAN_UNAVAILABLE');
    // Consumption precedes all waits, including busy/approval denial.
    items!.delete(input.planId);
    if (plan.expires <= this.clock()) throw new CheckError('PLAN_EXPIRED');
    if (canonical(input) !== canonical(plan.public)) throw new CheckError('PLAN_MISMATCH');
    return plan;
  }
  acquire(key: string): (() => void) | undefined {
    if (this.locks.has(key)) return undefined;
    this.locks.add(key);
    return () => { this.locks.delete(key); };
  }
  save(owner: object, report: RunReport): void {
    let items = this.reports.get(owner);
    if (!items) this.reports.set(owner, items = new Map());
    items.set(report.runId, { at: this.clock(), value: freeze(structuredClone(report)) });
    while (items.size > 5) items.delete(items.keys().next().value!);
  }
  report(owner: object, runId: string): RunReport | undefined {
    const items = this.reports.get(owner);
    for (const [id, item] of items ?? []) if (item.at + ttl <= this.clock()) items!.delete(id);
    const value = items?.get(runId)?.value;
    return value ? structuredClone(value) : undefined;
  }
  clear(): void { this.plans = new WeakMap(); this.reports = new WeakMap(); this.locks.clear(); }
}
