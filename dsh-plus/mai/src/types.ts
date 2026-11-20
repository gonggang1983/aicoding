import type { FsTarget } from '@deepseek-ai/dsh-fs';
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox';
import type { Task, CheckConfig } from './config.js';

export type Status = 'passed' | 'failed' | 'not_run' | 'unknown';
export interface TaskResult {
  id: string; name: string; selected: boolean; status: Status; reason: string;
  startedAt: string | null; endedAt: string | null; durationMs: number | null;
  exitCode: number | null; stdout: string; stderr: string; truncated: boolean;
  outputIncomplete: boolean; mode: string; enforcement: string;
}
export interface GitSummary {
  status: 'available' | 'unavailable' | 'incomplete'; reason: string; capturedAt: string;
  paths: { path: string; originalPath: string | null; status: string }[];
  totalCount: number | null; omittedCount: number | null;
}
export interface PublicPlan {
  planId: string; digest: string; projectPath: string; expiresAt: string;
  nodeExecutable: string; npmCliPath: string; mode: string;
  tasks: { id: string; name: string; script: string; args: string[]; argv: string[]; timeoutSeconds: number; selected: boolean }[];
  risk: string;
}
export interface ProjectSnapshot {
  target: FsTarget; path: string; projectName: string; candidates: string[]; config: CheckConfig; fingerprint: string;
  nodeExecutable: string; npmCliPath: string; policy: SandboxExecutionPolicy;
}
export interface FrozenPlan {
  public: PublicPlan; snapshot: ProjectSnapshot; tasks: readonly Task[];
  selectedIds: ReadonlySet<string>; expires: number;
}
export interface RunReport {
  reportVersion: 1; kind: 'run'; runId: string; planId: string; projectPath: string;
  startedAt: string; endedAt: string; overall: 'passed' | 'failed' | 'inconclusive';
  approval: string; reason: string; tasks: TaskResult[]; git: GitSummary; gitBefore: GitSummary;
  projectName: string; candidates: string[]; plan: PublicPlan; evidenceGaps: string[]; notices: string[];
  environment: { node: string; npm: string; dsh: string };
  disclaimer: string; privacyNotice: string;
}
export interface ExecutionEvidence {
  started: 'no' | 'possible' | 'yes'; rangeEmpty: boolean; outcomeKnown: boolean;
  exitCode: number | null; cause: 'normal' | 'timeout' | 'cancel' | 'channel_lost';
}
