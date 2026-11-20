import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { resolve } from 'node:path';
import { SessionStore } from '../dist/plan.js';
import { Coordinator } from '../dist/coordinator.js';
import { parseConfig } from '../dist/config.js';
import { reportMarkdown, recoveryAdvice } from '../dist/report.js';
import { unavailableGit } from '../dist/git.js';
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { planSchema, reportSchema } from '../dist/schemas.js';

const path = resolve('synthetic project 中文');
const tasks = ['one', 'two', 'three'].map(id => ({ id, name: id, script: id, args: [], timeoutSeconds: 1 }));
function fixture() {
  const config = parseConfig({ version: 1, tasks }, Object.fromEntries(tasks.map(t => [t.id, 'never executed'])));
  return { target: { targetKey: 'synthetic-key' }, path, projectName: 'synthetic', candidates: tasks.map(t => t.id), config,
    fingerprint: 'stable', nodeExecutable: process.execPath, npmCliPath: resolve('trusted npm/bin/npm-cli.js'), policy: { mode: 'read-only', workspaceRoot: path } };
}
function execution(owner = {}) { return { agent: { session: owner }, signal: new AbortController().signal, callId: 'synthetic-call' }; }
function publicView(snapshot) {
  return { projectPath: snapshot.path, nodeExecutable: snapshot.nodeExecutable, npmCliPath: snapshot.npmCliPath, mode: 'read-only', risk: 'synthetic',
    tasks: snapshot.config.tasks.map(t => ({ ...t, args: [...t.args], selected: true, argv: [process.execPath] })) };
}
function fakeHandle(code = 0, text = 'success\n') {
  const stdout = new PassThrough(); const stderr = new PassThrough(); let finish;
  const done = new Promise(resolve => { finish = resolve; }); let ended = false;
  const end = () => { if (!ended) { ended = true; stdout.end(text); stderr.end(); finish({ exitCode: code, signal: null }); } };
  setImmediate(end);
  return { stdout, stderr, done, terminate: end, async waitForExit() { await done; return true; } };
}
function protocolHost(overrides = {}) {
  const snapshot = fixture(); const calls = [];
  return { calls, snapshotValue: snapshot, async snapshot() { return structuredClone(snapshot); },
    async approval() { return 'allowed-once'; }, async git() { return unavailableGit(); },
    async launch(argv) { calls.push([...argv]); return { handle: fakeHandle(argv[3] === 'two' ? 7 : 0), mode: 'read-only', enforcement: 'partial' }; },
    async dispose() {}, ...overrides };
}

// Protocol fakes validate state machines, not actual approval/sandbox compatibility.
for (const [enforcement, notices] of [
  ['partial', ['SANDBOX_ENFORCEMENT_PARTIAL']],
  ['none', ['SANDBOX_NOT_ENFORCED']],
  ['full', []],
]) {
  test(`protocol report notices: ${enforcement} is consistent in JSON/Markdown/cache`, async () => {
    const host = protocolHost({ async launch() { return { handle: fakeHandle(), mode: 'read-only', enforcement }; } });
    const coordinator = new Coordinator(host); const exec = execution();
    try {
      const plan = await coordinator.preview(path, ['one', 'two'], exec);
      const result = await coordinator.run(plan, exec);
      assert.deepEqual(result.notices, notices); // one notice per condition, not per task
      assert.deepEqual(validateJsonSchemaValue(reportSchema, result), []);
      assert.deepEqual(coordinator.report(result.runId, exec).notices, notices);
      const rendered = reportMarkdown(result).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
      assert.ok(rendered.includes(`Notices: ${notices.join(', ') || '(none)'}`));
      assert.equal(result.overall, 'passed'); // enforcement is separate from script outcomes
    } finally { await coordinator.dispose(); }
  });
}
test('plans: identity/canonical match/single use/expiry/bounds/instance locks', () => {
  let now = 0; const store = new SessionStore(() => now); const owner = {}; const snapshot = fixture();
  const create = () => store.create(owner, snapshot, ['one'], publicView(snapshot)); const plan = create();
  assert.throws(() => store.consume({}, plan), /PLAN_UNAVAILABLE/);
  assert.equal(store.consume(owner, Object.fromEntries(Object.entries(plan).reverse())).public, plan);
  assert.throws(() => store.consume(owner, plan), /PLAN_UNAVAILABLE/);
  const tampered = structuredClone(create()); tampered.tasks[0].argv.push('injected');
  assert.throws(() => store.consume(owner, tampered), /PLAN_MISMATCH/);
  assert.throws(() => store.consume(owner, tampered), /PLAN_UNAVAILABLE/);
  const expired = create(); now += 600001; assert.throws(() => store.consume(owner, expired), /PLAN_EXPIRED/);
  const evicted = create(); for (let i = 0; i < 10; i++) create();
  assert.throws(() => store.consume(owner, evicted), /PLAN_UNAVAILABLE/);
  const unlock = store.acquire('project'); assert.equal(store.acquire('project'), undefined); unlock(); assert.ok(store.acquire('project'));
  assert.throws(() => store.create(owner, snapshot, ['absent'], publicView(snapshot)), /INVALID_TASK_SELECTION/);
  assert.throws(() => store.create(owner, snapshot, ['one', 'one'], publicView(snapshot)), /INVALID_TASK_SELECTION/);
});
test('protocol: config-order/nonzero-continue/private argv/report schema/cache/Markdown', async () => {
  const host = protocolHost(); const c = new Coordinator(host); const exec = execution();
  const plan = await c.preview(path, ['three', 'one', 'two'], exec);
  assert.equal(validateJsonSchemaValue(planSchema, plan).length, 0);
  const result = await c.run(plan, exec);
  assert.deepEqual(host.calls.map(a => a[3]), ['one', 'two', 'three']);
  assert.deepEqual(result.tasks.map(t => t.status), ['passed', 'failed', 'passed']);
  assert.equal(result.overall, 'failed'); assert.equal(result.runId, plan.planId);
  assert.deepEqual(validateJsonSchemaValue(reportSchema, result), []);
  assert.deepEqual(c.report(result.runId, exec), result); assert.equal(c.report(result.runId, execution()), undefined);
  const rendered = reportMarkdown(result).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  for (const text of [result.runId, result.planId, 'EXIT_NONZERO_OR_SIGNAL', 'partial', '7', '11.16.0']) assert.ok(rendered.includes(text));
  assert.throws(() => plan.tasks[0].argv.push('mutate'), TypeError);
  await assert.rejects(c.run(plan, exec), /PLAN_UNAVAILABLE/);
  await c.dispose(); assert.equal(c.report(result.runId, exec), undefined);
});
for (const outcome of ['rejected', 'unavailable', 'cancelled', 'rogue']) {
  test(`protocol approval ${outcome}: zero starts, not_run and one-time consumption`, async () => {
    const host = protocolHost({ async approval() { return outcome; } }); const c = new Coordinator(host); const exec = execution();
    const plan = await c.preview(path, ['one'], exec); const result = await c.run(plan, exec);
    assert.equal(host.calls.length, 0); assert.equal(result.overall, 'inconclusive');
    assert.deepEqual(result.notices, [recoveryAdvice('APPROVAL_NOT_GRANTED')]);
    assert.deepEqual(validateJsonSchemaValue(reportSchema, result), []);
    assert.equal(result.tasks[0].startedAt, null); assert.equal(result.tasks[0].exitCode, null); assert.equal(result.tasks[1].reason, 'NOT_SELECTED');
    await assert.rejects(c.run(plan, exec), /PLAN_UNAVAILABLE/);
  });
}
test('protocol: approval wait holds project lock; post-approval file change blocks', async () => {
  let answer; const waiting = new Promise(resolve => { answer = resolve; });
  const host = protocolHost({ async approval() { return waiting; } }); const c = new Coordinator(host); const exec = execution();
  const first = await c.preview(path, ['one'], exec); const second = await c.preview(path, ['two'], exec);
  const running = c.run(first, exec); const busy = await c.run(second, exec);
  assert.equal(busy.reason, 'BUSY'); assert.equal(host.calls.length, 0);
  assert.ok(busy.notices.includes(recoveryAdvice('BUSY')));
  host.snapshotValue.fingerprint = 'changed'; answer('allowed-once');
  const changed = await running; assert.equal(changed.reason, 'PLAN_CHANGED'); assert.equal(host.calls.length, 0);
  assert.ok(changed.notices.includes(recoveryAdvice('PLAN_CHANGED')));
});
test('protocol: unsafe argv blocks preview; empty selection never asks/executes', async () => {
  const host = protocolHost({ async approval() { throw new Error('must not ask'); } }); const c = new Coordinator(host); const exec = execution();
  const plan = await c.preview(path, [], exec); const empty = await c.run(plan, exec);
  assert.equal(empty.overall, 'inconclusive'); assert.equal(empty.approval, 'not_requested');
  assert.deepEqual(empty.notices, [recoveryAdvice('NO_TASKS_SELECTED')]);
  host.snapshotValue.config = { ...host.snapshotValue.config, tasks: [{ ...tasks[0], args: ['token=synthetic'] }] };
  await assert.rejects(c.preview(path, ['one'], exec), /PLAN_CONTAINS_UNDISPLAYABLE_DATA/);
  await assert.rejects(c.preview(path, ['one'], { signal: exec.signal }), /SESSION_REQUIRED/);
});
test('protocol cancellation caches safe partial report at known plan ID and propagates abort', async () => {
  const abort = new AbortController(); let ready; const started = new Promise(resolve => { ready = resolve; });
  const host = protocolHost({ async launch(_argv, _cwd, _exec, signal) {
    const stdout = new PassThrough(); const stderr = new PassThrough(); let finish;
    const done = new Promise(resolve => { finish = resolve; });
    const end = () => { stdout.end('token=synthetic'); stderr.end(); finish({ exitCode: null, signal: 'SIGTERM' }); };
    signal.addEventListener('abort', end, { once: true }); ready();
    return { handle: { stdout, stderr, done, terminate: end, async waitForExit() { await done; return true; } }, mode: 'read-only', enforcement: 'partial' };
  } });
  const c = new Coordinator(host); const exec = { ...execution(), signal: abort.signal };
  const plan = await c.preview(path, ['one', 'two'], exec); const running = c.run(plan, exec); await started; abort.abort();
  await assert.rejects(running, { name: 'AbortError' });
  const partial = c.report(plan.planId, { ...exec, signal: new AbortController().signal });
  assert.equal(partial.tasks[0].status, 'failed'); assert.equal(partial.tasks[1].status, 'not_run');
  assert.ok(!JSON.stringify(partial).includes('token=synthetic'));
});
test('protocol: change after first task preserves evidence and blocks remaining starts', async () => {
  const host = protocolHost(); const launch = host.launch.bind(host);
  host.launch = async (...args) => {
    const result = await launch(...args);
    host.snapshotValue.fingerprint = 'changed after first start';
    return result;
  };
  const c = new Coordinator(host); const exec = execution();
  try {
    const plan = await c.preview(path, ['one', 'two', 'three'], exec);
    const report = await c.run(plan, exec);
    assert.equal(host.calls.length, 1); assert.equal(report.reason, 'PLAN_CHANGED');
    assert.deepEqual(report.tasks.map(task => task.status), ['passed', 'not_run', 'not_run']);
    assert.equal(report.tasks[1].reason, 'PLAN_CHANGED'); assert.equal(report.overall, 'inconclusive');
    assert.deepEqual(c.report(plan.planId, exec), report);
  } finally { await c.dispose(); }
});

test('protocol: channel loss stops remaining tasks and preserves none-enforcement warning', async () => {
  let starts = 0;
  const host = protocolHost({ async launch() {
    starts++; const stdout = new PassThrough(); const stderr = new PassThrough(); stdout.end(); stderr.end();
    return { mode: 'danger-full-access', enforcement: 'none', handle: { stdout, stderr,
      done: Promise.reject(new Error('synthetic channel failure')), terminate() {}, async waitForExit() { return true; } } };
  } });
  const c = new Coordinator(host); const exec = execution();
  try {
    const plan = await c.preview(path, ['one', 'two'], exec); const report = await c.run(plan, exec);
    assert.equal(starts, 1); assert.equal(report.overall, 'inconclusive');
    assert.deepEqual(report.tasks.map(task => task.status), ['unknown', 'not_run', 'not_run']);
    assert.equal(report.tasks[0].startedAt, null); assert.ok(report.notices.includes('SANDBOX_NOT_ENFORCED'));
    assert.ok(report.notices.includes(recoveryAdvice('TERMINATION_OR_OUTCOME_UNKNOWN')));
    assert.ok(!JSON.stringify(report).includes('synthetic channel failure'));
  } finally { await c.dispose(); }
});

test('report cache: five-entry bound/ten-minute TTL/copies/restart', () => {
  let now = 0; const store = new SessionStore(() => now); const owner = {};
  for (let i = 0; i < 6; i++) store.save(owner, { runId: String(i), tasks: [] });
  assert.equal(store.report(owner, '0'), undefined);
  const copy = store.report(owner, '5'); copy.tasks.push('mutated'); assert.equal(store.report(owner, '5').tasks.length, 0);
  now += 600001; assert.equal(store.report(owner, '5'), undefined); store.clear();
});
