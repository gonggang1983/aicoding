import { limits } from './limits.js';

export interface Task {
  readonly id: string;
  readonly name: string;
  readonly script: string;
  readonly args: readonly string[];
  readonly timeoutSeconds: number;
}
export interface CheckConfig {
  readonly version: 1;
  readonly tasks: readonly Task[];
  readonly redactLiterals: readonly string[];
}
export type ConfigIssueCode =
  | 'CONFIG_OBJECT' | 'UNKNOWN_FIELD' | 'CONFIG_VERSION' | 'TASKS_ARRAY'
  | 'TOO_MANY_TASKS' | 'TASK_OBJECT' | 'TASK_ID' | 'DUPLICATE_ID'
  | 'TASK_NAME' | 'TASK_SCRIPT' | 'SCRIPT_NOT_FOUND' | 'TASK_ARGS'
  | 'TASK_TIMEOUT' | 'REDACT_LITERALS' | 'PACKAGE_OBJECT' | 'PACKAGE_SCRIPTS';

/** Only fixed field paths and codes escape. Never include invalid values/keys. */
export class ConfigError extends Error {
  constructor(readonly code: ConfigIssueCode, readonly field: string, readonly taskIndex: number | null = null) {
    super(code);
    this.name = 'ConfigError';
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function own(value: Record<string, unknown>, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value as unknown;
}
function fields(value: Record<string, unknown>, allowed: readonly string[], field: string, index: number | null = null): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new ConfigError('UNKNOWN_FIELD', field, index);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
}

/** Accept decoded package metadata, never execute or expose script bodies. */
export function packageScripts(value: unknown): Readonly<Record<string, string>> {
  if (!object(value)) throw new ConfigError('PACKAGE_OBJECT', 'package');
  const scripts = own(value, 'scripts');
  if (scripts === undefined) return Object.freeze(Object.create(null) as Record<string, string>);
  if (!object(scripts)) throw new ConfigError('PACKAGE_SCRIPTS', 'scripts');
  const result = Object.create(null) as Record<string, string>;
  for (const key of Object.keys(scripts)) {
    const body = own(scripts, key);
    if (typeof body !== 'string') throw new ConfigError('PACKAGE_SCRIPTS', 'scripts');
    result[key] = body;
  }
  return Object.freeze(result);
}

/** Strict v1 parser. Copies and freezes values so later caller mutation cannot alter a task. */
export function parseConfig(value: unknown, scripts: Readonly<Record<string, string>>): CheckConfig {
  if (!object(value)) throw new ConfigError('CONFIG_OBJECT', 'config');
  fields(value, ['version', 'tasks', 'redactLiterals'], 'config');
  if (own(value, 'version') !== 1) throw new ConfigError('CONFIG_VERSION', 'version');
  const input = own(value, 'tasks');
  if (!Array.isArray(input)) throw new ConfigError('TASKS_ARRAY', 'tasks');
  if (input.length > limits.tasksPerRun) throw new ConfigError('TOO_MANY_TASKS', 'tasks');
  const ids = new Set<string>();
  const tasks = input.map((entry: unknown, index): Task => {
    if (!object(entry)) throw new ConfigError('TASK_OBJECT', 'tasks', index);
    fields(entry, ['id', 'name', 'script', 'args', 'timeoutSeconds'], 'tasks', index);
    const id = own(entry, 'id');
    const name = own(entry, 'name');
    const script = own(entry, 'script');
    const args = own(entry, 'args');
    const timeoutValue = own(entry, 'timeoutSeconds');
    const timeoutSeconds = timeoutValue === undefined ? limits.defaultTimeoutSeconds : timeoutValue;
    if (!text(id)) throw new ConfigError('TASK_ID', 'id', index);
    if (ids.has(id)) throw new ConfigError('DUPLICATE_ID', 'id', index);
    ids.add(id);
    if (!text(name)) throw new ConfigError('TASK_NAME', 'name', index);
    if (!text(script) || script.startsWith('-')) throw new ConfigError('TASK_SCRIPT', 'script', index);
    if (!Object.hasOwn(scripts, script)) throw new ConfigError('SCRIPT_NOT_FOUND', 'script', index);
    if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) {
      throw new ConfigError('TASK_ARGS', 'args', index);
    }
    if (typeof timeoutSeconds !== 'number' || !Number.isInteger(timeoutSeconds)
      || timeoutSeconds < limits.minTimeoutSeconds || timeoutSeconds > limits.maxTimeoutSeconds) {
      throw new ConfigError('TASK_TIMEOUT', 'timeoutSeconds', index);
    }
    return Object.freeze({ id, name, script, args: Object.freeze([...args] as string[]), timeoutSeconds });
  });
  const literals = own(value, 'redactLiterals');
  if (literals !== undefined && (!Array.isArray(literals) || literals.some(item => typeof item !== 'string' || item.length === 0))) {
    throw new ConfigError('REDACT_LITERALS', 'redactLiterals');
  }
  return Object.freeze({ version: 1, tasks: Object.freeze(tasks), redactLiterals: Object.freeze(literals === undefined ? [] : [...literals as string[]]) });
}

export type ToolchainBlocker = 'INVALID_PACKAGE_MANAGER' | 'UNSUPPORTED_PACKAGE_MANAGER' | 'NPM_VERSION_MISMATCH' | 'CONFLICTING_LOCKFILE';
/** Declaration checks only: does not claim an installed/verified toolchain. */
export function toolchainBlockers(pkg: unknown, conflictingLockfile: boolean): readonly ToolchainBlocker[] {
  const blockers: ToolchainBlocker[] = [];
  const declaration = object(pkg) ? own(pkg, 'packageManager') : undefined;
  if (declaration !== undefined) {
    if (typeof declaration !== 'string' || !/^[a-z][a-z0-9-]*@[^\s]+$/.test(declaration)) blockers.push('INVALID_PACKAGE_MANAGER');
    else if (!declaration.startsWith('npm@')) blockers.push('UNSUPPORTED_PACKAGE_MANAGER');
    else if (!/^npm@11\.16\.0(?:\+sha(?:224|256|384|512)\.[a-fA-F0-9]+)?$/.test(declaration)) blockers.push('NPM_VERSION_MISMATCH');
  }
  if (conflictingLockfile) blockers.push('CONFLICTING_LOCKFILE');
  return Object.freeze(blockers);
}
