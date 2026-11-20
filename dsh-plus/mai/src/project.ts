import { randomUUID } from 'node:crypto';
import { ConfigError, packageScripts, parseConfig, toolchainBlockers, type CheckConfig } from './config.js';
import { MetadataProjection, markdownText, withheld } from './redact.js';
import { unavailableGit } from './git.js';
import { gitMarkdown } from './report.js';

/** Display bound only, not a task-selection or execution limit. */
export const discoveryCandidateLimit = 200;

export function discoveryResult(pkg: unknown, rawConfig: unknown, canonicalPath: string, conflictingLockfile: boolean) {
  const scripts = packageScripts(pkg);
  const names = Object.keys(scripts).sort();
  let parsed: CheckConfig | undefined;
  let configStatus: 'missing' | 'valid' | 'invalid' = 'missing';
  const configIssues: string[] = [];
  if (rawConfig !== undefined) {
    try {
      parsed = parseConfig(rawConfig, scripts);
      configStatus = 'valid';
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      configStatus = 'invalid';
      configIssues.push(`${error.code}:${error.field}${error.taskIndex === null ? '' : `[${error.taskIndex}]`}`);
    }
  }
  // An invalid config may contain intended literals we cannot validate.
  // Hide all dynamic metadata, rather than silently ignoring those literals.
  const projection = new MetadataProjection(parsed?.redactLiterals ?? []);
  let hiddenFieldCount = 0;
  const field = (raw: string): string => {
    const result = configStatus === 'invalid' ? { text: withheld, hidden: true } : projection.field(raw);
    if (result.hidden) hiddenFieldCount++;
    return result.text;
  };
  const projectPath = field(canonicalPath);
  const rawName = Object.getOwnPropertyDescriptor(pkg, 'name')?.value as unknown;
  const projectName = typeof rawName === 'string' ? field(rawName) : '(unnamed)';
  // Project and configured tasks take budget priority over candidate names.
  const configuredTasks = (parsed?.tasks ?? []).map(task => {
    const before = hiddenFieldCount;
    const id = field(task.id);
    const name = field(task.name);
    const script = field(task.script);
    return {
      id, name, script, argumentCount: task.args.length,
      timeoutSeconds: task.timeoutSeconds, redacted: hiddenFieldCount !== before,
    };
  });
  const candidates = configStatus === 'invalid' ? [] : names.slice(0, discoveryCandidateLimit).map(field);
  const runId: string = randomUUID();
  return {
    reportVersion: 1 as const, runId, discoveredAt: new Date().toISOString(),
    kind: 'discovery' as const, projectType: 'node' as const, projectPath, projectName,
    candidates, candidateCount: names.length, omittedCandidateCount: names.length - candidates.length,
    configPresent: rawConfig !== undefined, configStatus,
    configuredTaskCount: configuredTasks.length, configuredTasks,
    configIssues, toolchainBlockers: [...toolchainBlockers(pkg, conflictingLockfile)],
    hiddenFieldCount, dynamicMetadataWithheld: configStatus === 'invalid',
    overall: 'inconclusive' as const,
    git: unavailableGit('RUNTIME_SERVICES_UNAVAILABLE'),
    evidenceGaps: ['CHECKS_NOT_RUN', 'GIT_EVIDENCE_UNAVAILABLE', 'TOOLCHAIN_IDENTITY_NOT_VERIFIED'],
    note: 'Read-only discovery is not approval or proof of execution readiness. Script bodies and task argument values are never returned. Use a frozen preview and real one-time host approval to execute.',
    disclaimer: '本报告仅反映所列检查与证据，不代表业务验收通过或安全认证；未选任务不在本次覆盖范围。',
    privacyNotice: '输出已按规则脱敏，但无法保证识别所有敏感信息；会话内容可能发送至宿主配置的模型服务。',
  };
}

export type DiscoveryResult = ReturnType<typeof discoveryResult>;

/** Pure rendering from the safe JSON object; no access to private metadata. */
export function discoveryMarkdown(value: DiscoveryResult): string {
  const text = markdownText;
  return [
    '# Project discovery',
    `Run: ${text(value.runId)}; at: ${text(value.discoveredAt)}`,
    `Project: ${text(value.projectPath)} (${text(value.projectName)}; ${text(value.projectType)})`,
    `Candidates (${value.candidateCount}; omitted ${value.omittedCandidateCount}): ${value.candidates.map(text).join(', ') || '(none)'}`,
    `Configuration: ${text(value.configStatus)}; validated tasks: ${value.configuredTaskCount}`,
    ...value.configuredTasks.map(task => `- ${text(task.id)}: ${text(task.name)}; script ${text(task.script)}; arguments ${task.argumentCount}; timeout ${task.timeoutSeconds}s; redacted ${task.redacted}`),
    `Configuration issues: ${value.configIssues.map(text).join(', ') || '(none)'}`,
    `Toolchain declaration blockers: ${value.toolchainBlockers.map(text).join(', ') || '(none)'}`,
    `Hidden fields: ${value.hiddenFieldCount}; dynamic metadata withheld: ${value.dynamicMetadataWithheld}`,
    `Overall: ${text(value.overall)}. Evidence gaps: ${value.evidenceGaps.map(text).join(', ')}`,
    gitMarkdown(value.git),
    text(value.note), text(value.disclaimer), text(value.privacyNotice),
  ].join('\n\n');
}
