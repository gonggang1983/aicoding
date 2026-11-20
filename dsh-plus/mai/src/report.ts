import type { RunReport, TaskResult, PublicPlan, GitSummary } from './types.js';
import { markdownText } from './redact.js';

export const disclaimer = '本报告仅反映所列检查与证据，不代表业务验收通过或安全认证；未选任务不在本次覆盖范围。';
export const privacyNotice = '输出已按规则脱敏，但无法保证识别所有敏感信息；会话内容可能发送至宿主配置的模型服务。';
export const executionRisk = '即将运行所选项目脚本及其生命周期脚本，可能修改文件或访问网络。请核对项目、任务和参数后批准。不保证原子锁定全部源码；并发修改可能发生。';
/** Fixed recovery text only: never interpolate raw arguments or provider diagnostics. */
export function recoveryAdvice(code: string): string {
  switch (code) {
    case 'APPROVAL_NOT_GRANTED': return '未执行：未获得本次计划的批准。确认计划后可重新发起。';
    case 'NO_TASKS_SELECTED': return '证据不足：本次未执行任何检查。请配置并选择任务。';
    case 'TIMEOUT': return '检查失败：任务超过执行时限并已停止。请检查任务或调整超时后重新运行。';
    case 'TERMINATION_OR_OUTCOME_UNKNOWN': return '无法判断：终态证据不足。请检查残留进程，勿据此认定检查通过。';
    case 'BUSY': return '当前项目已有检查正在执行。请等待完成或先取消，再重新发起。';
    case 'PLAN_CHANGED': case 'PLAN_UNAVAILABLE': case 'PLAN_EXPIRED': case 'PLAN_MISMATCH':
      return '计划已变化、失效或已消费，请重新预览并取得本次计划的批准。';
    case 'REPORT_UNAVAILABLE': return '报告已过期、被淘汰或不属于当前会话；请在原会话查看。需要重新执行时须重新预览和批准。';
    case 'TRUSTED_TOOLCHAIN_REQUIRED': case 'NODE_VERSION_OR_WORLD_MISMATCH': case 'NPM_VERSION_MISMATCH':
      return '请由部署者检查受信任的 Node/npm 绝对路径及固定版本；插件不会自动安装或切换工具链。';
    case 'FULL_ENFORCEMENT_REQUIRED': return '当前宿主未提供所要求的完整隔离，任务未启动。请联系部署者核查能力，不要关闭沙箱绕过限制。';
    case 'CONFIG_REQUIRED': case 'TOOLCHAIN_BLOCKED': return '请检查项目手工配置、包管理器声明及冲突锁文件，然后重新发现和预览；插件不会自动修复或安装。';
    case 'SESSION_REQUIRED': return '请在具有项目工作目录的宿主会话中调用；计划和报告不能跨会话共享。';
    case 'PLAN_CONTAINS_UNDISPLAYABLE_DATA': return '计划含无法安全展示的字段。请移除参数秘密或不安全标签后重新预览，不要把秘密作为工具参数。';
    default: return '请核查项目配置与宿主能力后重试；若需执行任务，请重新预览并批准。插件不会绕过拒绝或自动安装依赖。';
  }
}
export function reportNotices(report: RunReport): string[] {
  const notices: string[] = [];
  if (report.reason !== 'FINISHED') notices.push(recoveryAdvice(report.reason));
  for (const task of report.tasks.filter(task => task.selected)) {
    if (task.enforcement === 'partial') notices.push('SANDBOX_ENFORCEMENT_PARTIAL');
    if (task.enforcement === 'none') notices.push('SANDBOX_NOT_ENFORCED');
    if (task.reason === 'TIMEOUT') notices.push(recoveryAdvice('TIMEOUT'));
    if (task.status === 'unknown') notices.push(recoveryAdvice('TERMINATION_OR_OUTCOME_UNKNOWN'));
    if (task.status === 'not_run' && !['NOT_STARTED', 'APPROVAL_NOT_GRANTED'].includes(task.reason)) notices.push(recoveryAdvice(task.reason));
  }
  return [...new Set(notices)];
}
export function overall(tasks: readonly TaskResult[]): RunReport['overall'] {
  const selected = tasks.filter(task => task.selected);
  if (selected.some(task => task.status === 'failed')) return 'failed';
  return selected.length && selected.every(task => task.status === 'passed') ? 'passed' : 'inconclusive';
}
export function planMarkdown(plan: PublicPlan): string {
  const text = markdownText;
  return [ '# Frozen project-check plan',
    `Plan: ${text(plan.planId)}; digest: ${text(plan.digest)}; expires: ${text(plan.expiresAt)}`,
    `Project: ${text(plan.projectPath)}; mode: ${text(plan.mode)}`,
    ...plan.tasks.map(task => `- ${text(task.id)} (${text(task.name)}): selected=${task.selected}; timeout=${task.timeoutSeconds}s; argv=${text(JSON.stringify(task.argv))}`),
    text(plan.risk), text(privacyNotice),
  ].join('\n\n');
}
export function gitMarkdown(git: GitSummary): string {
  const text = markdownText;
  return [`Git: ${text(git.status)} / ${text(git.reason)}; at=${text(git.capturedAt)}; total=${git.totalCount ?? 'unknown'}; omitted=${git.omittedCount ?? 'unknown'}`,
    ...git.paths.map(entry => `- ${text(entry.status)} ${text(entry.path)}${entry.originalPath === null ? '' : ` from ${text(entry.originalPath)}`}`),
    'Git differences may include concurrent changes and are not all attributable to checks.'].join('\n\n');
}
export function reportMarkdown(report: RunReport): string {
  const text = markdownText;
  return [ '# Project check report',
    `Run: ${text(report.runId)}; plan: ${text(report.planId)}; project: ${text(report.projectPath)}`,
    `Overall: ${text(report.overall)}; reason: ${text(report.reason)}; approval: ${text(report.approval)}`,
    `Started: ${text(report.startedAt)}; ended: ${text(report.endedAt)}`,
    `Environment: ${text(JSON.stringify(report.environment))}; project name: ${text(report.projectName)}`,
    `Candidates: ${report.candidates.map(text).join(', ')}`,
    planMarkdown(report.plan),
    `Evidence gaps: ${report.evidenceGaps.map(text).join(', ') || '(none)'}`,
    `Notices: ${report.notices.map(text).join(', ') || '(none)'}`,
    ...report.tasks.map(task => `- ${text(task.id)} (${text(task.name)}): selected=${task.selected}; ${text(task.status)} / ${text(task.reason)}; exit=${task.exitCode ?? 'unknown'}; durationMs=${task.durationMs ?? 'unknown'}; start=${text(task.startedAt ?? 'unknown')}; end=${text(task.endedAt ?? 'unknown')}; mode=${text(task.mode)}; enforcement=${text(task.enforcement)}; truncated=${task.truncated}; outputIncomplete=${task.outputIncomplete}\n\nstdout: ${text(task.stdout)}\n\nstderr: ${text(task.stderr)}`),
    'Git before:', gitMarkdown(report.gitBefore), 'Git after:', gitMarkdown(report.git),
    text(report.disclaimer), text(report.privacyNotice),
  ].join('\n\n');
}
