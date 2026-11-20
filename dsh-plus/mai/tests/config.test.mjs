import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, packageScripts, parseConfig, toolchainBlockers } from '../dist/config.js';

const scripts = packageScripts(JSON.parse('{"scripts":{"test":"DO_NOT_EXECUTE","build":"arbitrary-body","__proto__":"own-body"}}'));
const task = () => ({ id: 'test', name: 'Test', script: 'test', args: [] });
const config = () => ({ version: 1, tasks: [task()] });
function rejects(value, code, field, index = null) {
  assert.throws(() => parseConfig(value, scripts), error => {
    assert.ok(error instanceof ConfigError);
    assert.equal(error.code, code);
    assert.equal(error.field, field);
    assert.equal(error.taskIndex, index);
    assert.equal(error.message, code);
    return true;
  });
}

test('config: defaults, empty configuration and immutable defensive copies', () => {
  const input = config();
  input.redactLiterals = ['synthetic\r\nsecret', 'overlap'];
  const parsed = parseConfig(input, scripts);
  assert.equal(parsed.tasks[0].timeoutSeconds, 120);
  input.tasks[0].args.push('changed');
  input.tasks[0].name = 'changed';
  input.redactLiterals[0] = 'changed';
  assert.deepEqual(parsed.tasks[0].args, []);
  assert.equal(parsed.tasks[0].name, 'Test');
  assert.equal(parsed.redactLiterals[0], 'synthetic\r\nsecret');
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.tasks) && Object.isFrozen(parsed.tasks[0]));
  assert.throws(() => parsed.tasks[0].args.push('mutate'));
  assert.equal(parseConfig({ version: 1, tasks: [] }, scripts).tasks.length, 0);
});

test('config: own script keys, metacharacters and literal argv are data, never commands', () => {
  const pkg = JSON.parse('{"scripts":{"__proto__":"body","a&b":"body"}}');
  const ownScripts = packageScripts(pkg);
  assert.equal(Object.getPrototypeOf(ownScripts), null);
  for (const script of ['__proto__', 'a&b']) {
    const parsed = parseConfig({ version: 1, tasks: [{ ...task(), script, args: ['', '中文 空格', 'x&y', '--flag'] }] }, ownScripts);
    assert.deepEqual(parsed.tasks[0].args, ['', '中文 空格', 'x&y', '--flag']);
  }
  rejects({ version: 1, tasks: [{ ...task(), script: 'toString' }] }, 'SCRIPT_NOT_FOUND', 'script', 0);
});

for (const [label, value, code, field, index] of [
  ['null root', null, 'CONFIG_OBJECT', 'config'],
  ['array root', [], 'CONFIG_OBJECT', 'config'],
  ['unknown root', { ...config(), secret_unknown_key: 'must-not-escape' }, 'UNKNOWN_FIELD', 'config'],
  ['unknown version', { ...config(), version: 2 }, 'CONFIG_VERSION', 'version'],
  ['missing tasks', { version: 1 }, 'TASKS_ARRAY', 'tasks'],
  ['too many tasks', { version: 1, tasks: Array.from({ length: 21 }, (_, i) => ({ ...task(), id: String(i) })) }, 'TOO_MANY_TASKS', 'tasks'],
  ['null task', { version: 1, tasks: [null] }, 'TASK_OBJECT', 'tasks', 0],
  ['command rejected', { version: 1, tasks: [{ ...task(), command: 'arbitrary' }] }, 'UNKNOWN_FIELD', 'tasks', 0],
  ['env rejected', { version: 1, tasks: [{ ...task(), env: {} }] }, 'UNKNOWN_FIELD', 'tasks', 0],
  ['cwd rejected', { version: 1, tasks: [{ ...task(), cwd: '..' }] }, 'UNKNOWN_FIELD', 'tasks', 0],
  ['empty id', { version: 1, tasks: [{ ...task(), id: ' ' }] }, 'TASK_ID', 'id', 0],
  ['NUL id', { version: 1, tasks: [{ ...task(), id: 'a\0b' }] }, 'TASK_ID', 'id', 0],
  ['duplicate id', { version: 1, tasks: [task(), task()] }, 'DUPLICATE_ID', 'id', 1],
  ['missing name', { version: 1, tasks: [{ id: 'x', script: 'test', args: [] }] }, 'TASK_NAME', 'name', 0],
  ['option script', { version: 1, tasks: [{ ...task(), script: '--help' }] }, 'TASK_SCRIPT', 'script', 0],
  ['NUL script', { version: 1, tasks: [{ ...task(), script: 'a\0b' }] }, 'TASK_SCRIPT', 'script', 0],
  ['missing script', { version: 1, tasks: [{ ...task(), script: 'missing' }] }, 'SCRIPT_NOT_FOUND', 'script', 0],
  ['args string', { version: 1, tasks: [{ ...task(), args: 'shell' }] }, 'TASK_ARGS', 'args', 0],
  ['mixed args', { version: 1, tasks: [{ ...task(), args: ['ok', 2] }] }, 'TASK_ARGS', 'args', 0],
  ['NUL args', { version: 1, tasks: [{ ...task(), args: ['a\0b'] }] }, 'TASK_ARGS', 'args', 0],
  ['null timeout', { version: 1, tasks: [{ ...task(), timeoutSeconds: null }] }, 'TASK_TIMEOUT', 'timeoutSeconds', 0],
  ['low timeout', { version: 1, tasks: [{ ...task(), timeoutSeconds: 0 }] }, 'TASK_TIMEOUT', 'timeoutSeconds', 0],
  ['high timeout', { version: 1, tasks: [{ ...task(), timeoutSeconds: 1801 }] }, 'TASK_TIMEOUT', 'timeoutSeconds', 0],
  ['fraction timeout', { version: 1, tasks: [{ ...task(), timeoutSeconds: 1.5 }] }, 'TASK_TIMEOUT', 'timeoutSeconds', 0],
  ['string timeout', { version: 1, tasks: [{ ...task(), timeoutSeconds: '120' }] }, 'TASK_TIMEOUT', 'timeoutSeconds', 0],
  ['null literals', { ...config(), redactLiterals: null }, 'REDACT_LITERALS', 'redactLiterals'],
  ['empty literal', { ...config(), redactLiterals: [''] }, 'REDACT_LITERALS', 'redactLiterals'],
  ['mixed literals', { ...config(), redactLiterals: ['ok', 1] }, 'REDACT_LITERALS', 'redactLiterals'],
]) {
  test(`config rejects ${label} with safe position`, () => rejects(value, code, field, index));
}

test('config: inclusive task count and timeout limits', () => {
  for (const timeoutSeconds of [1, 1800]) {
    const value = { version: 1, tasks: Array.from({ length: 20 }, (_, i) => ({ ...task(), id: String(i), timeoutSeconds })) };
    assert.equal(parseConfig(value, scripts).tasks.length, 20);
  }
});

test('package scripts: reject invalid shapes; missing scripts is empty', () => {
  assert.deepEqual(Object.keys(packageScripts({})), []);
  for (const value of [null, [], { scripts: [] }, { scripts: { test: 1 } }]) {
    assert.throws(() => packageScripts(value), ConfigError);
  }
});

test('toolchain: declarations and conflicting locks fail closed without executable lookup', () => {
  assert.deepEqual(toolchainBlockers({}, false), []);
  assert.deepEqual(toolchainBlockers({ packageManager: 'npm@11.16.0' }, false), []);
  assert.deepEqual(toolchainBlockers({ packageManager: 'npm@11.16.0+sha512.abcdef' }, false), []);
  assert.deepEqual(toolchainBlockers({ packageManager: 'npm@10.0.0' }, false), ['NPM_VERSION_MISMATCH']);
  assert.deepEqual(toolchainBlockers({ packageManager: 'pnpm@10.0.0' }, true), ['UNSUPPORTED_PACKAGE_MANAGER', 'CONFLICTING_LOCKFILE']);
  for (const packageManager of [null, 42, '', 'npm', 'npm@11.16.0\nsecret']) {
    assert.deepEqual(toolchainBlockers({ packageManager }, false), ['INVALID_PACKAGE_MANAGER']);
  }
});
