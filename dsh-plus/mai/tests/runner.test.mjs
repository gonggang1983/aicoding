import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { Context } from '@deepseek-ai/cordis';
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local';
import LocalSandbox from '@deepseek-ai/dsh-sandbox-local';
import { runTask } from '../dist/runner.js';

const task = { id: 'synthetic', name: 'synthetic', script: 'not-used', args: [], timeoutSeconds: 1 };
async function services(t) {
  const ctx = new Context(); const process = ctx.plugin(LocalSubprocess); const sandbox = ctx.plugin(LocalSandbox, {});
  t.after(async () => { await sandbox.dispose(); await process.dispose(); });
  await process; await sandbox; return ctx;
}
async function launch(ctx, code, signal) {
  const wrapped = await ctx.sandbox.confine([process.execPath, '--input-type=module', '-e', code], { mode: 'read-only', workspaceRoot: process.cwd() }, signal);
  const handle = ctx.subprocess.spawn({ argv: wrapped.argv, cwd: process.cwd(), stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, graceMs: 200, signal });
  return { handle, mode: 'read-only', enforcement: wrapped.enforcement, runnerFailureRules: wrapped.runnerFailureRules };
}
for (const [code, expected, exit] of [
  ["process.stdout.write('中文😀');process.stderr.write('diagnostic');", 'passed', 0],
  ["console.log('success');process.exitCode=7;", 'failed', 7],
  ["process.stdout.write('x'.repeat(100000));", 'passed', 0],
  ["process.stdout.write('synthetic-secret');", 'passed', 0],
]) {
  test(`real confined runner: ${expected}/${exit}, no npm/project scripts or unconfined fallback`, { timeout: 15000 }, async t => {
    const ctx = await services(t);
    // Finite-exit cases test exit facts, not a 1s startup race under parallel sandbox load.
    // The dedicated timeout case below retains the actual 1s deadline.
    const result = await runTask({ ...task, timeoutSeconds: 5 }, ['synthetic-secret'], AbortSignal.timeout(10000), signal => launch(ctx, code, signal));
    assert.equal(result.status, expected); assert.equal(result.exitCode, exit);
    assert.ok(result.startedAt); assert.ok(result.endedAt); assert.ok(result.durationMs >= 0);
    assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
    if (code.includes('100000')) { assert.equal(result.truncated, true); assert.equal(result.stdout, '[withheld]'); }
    if (code.includes('中文')) assert.equal(result.stdout, '中文😀');
    t.diagnostic(`Actual enforcement: ${result.enforcement}; synthetic direct Node, not npm argv/lifecycle proof.`);
  });
}
test('R-01 real Windows confinement: task output can mimic the active wrapper failure', { timeout: 15000, skip: process.platform !== 'win32' }, async t => {
  const ctx = await services(t);
  const result = await runTask({ ...task, timeoutSeconds: 5 }, [], AbortSignal.timeout(10000), signal => launch(ctx,
    "process.stdout.write('synthetic task reached main');process.stderr.write('windows-acl-run: synthetic diagnostic');process.exitCode=127;", signal));
  assert.equal(result.stdout, 'synthetic task reached main');
  assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'TERMINATION_OR_OUTCOME_UNKNOWN');
  assert.equal(result.startedAt, null); assert.equal(result.exitCode, null);
  t.diagnostic(`Enforcement: ${result.enforcement}; real direct Node with task-controlled stderr, not npm or UI approval proof.`);
});
test('real confined runner: per-task timeout terminates ready synthetic root', { timeout: 15000 }, async t => {
  const ctx = await services(t);
  const result = await runTask(task, [], AbortSignal.timeout(10000), signal => launch(ctx, "console.log('ready');setInterval(()=>{},1000)", signal));
  assert.equal(result.status, 'failed'); assert.equal(result.reason, 'TIMEOUT'); assert.ok(result.endedAt);
});
for (const alreadyClosed of [false, true]) {
  test(`protocol: premature pipe close hides partial data (already closed=${alreadyClosed})`, async () => {
    const stdout = new PassThrough(); const stderr = new PassThrough();
    if (alreadyClosed) stdout.destroy();
    else setImmediate(() => { stdout.write('synthetic sensitive prefix'); stdout.destroy(); });
    stderr.end();
    const result = await runTask(task, [], new AbortController().signal, async () => ({
      mode: 'read-only', enforcement: 'partial', handle: { stdout, stderr,
        done: Promise.resolve({ exitCode: 0, signal: null }), terminate() {}, async waitForExit() { return true; } },
    }));
    assert.equal(result.outputIncomplete, true);
    assert.ok(!JSON.stringify(result).includes('synthetic sensitive prefix'));
    assert.equal(result.stdout, alreadyClosed ? '' : '[withheld]');
  });
}
test('protocol: synchronous preparation failure is not_run with null facts', async () => {
  const result = await runTask(task, [], new AbortController().signal, async () => { throw new Error('synthetic raw secret'); });
  assert.equal(result.status, 'not_run'); assert.equal(result.startedAt, null); assert.equal(result.exitCode, null);
  assert.ok(!JSON.stringify(result).includes('synthetic raw secret'));
});
test('protocol: zero exit with unconfirmed range remains unknown; channel loss does not prove zero starts', async () => {
  for (const rejected of [false, true]) {
    const stdout = new PassThrough(); const stderr = new PassThrough(); stdout.end(); stderr.end();
    const result = await runTask(task, [], new AbortController().signal, async () => ({ mode: 'read-only', enforcement: 'partial',
      handle: { stdout, stderr, done: rejected ? Promise.reject(new Error('lost')) : Promise.resolve({ exitCode: 0, signal: null }), terminate() {}, async waitForExit() { return false; } } }));
    assert.equal(result.status, 'unknown'); assert.equal(result.outputIncomplete, true);
  }
});
test('protocol: stderr runner signature cannot prove the task never started', async () => {
  const stdout = new PassThrough(); const stderr = new PassThrough(); stderr.end('fixed fatal startup'); stdout.end();
  const result = await runTask(task, [], new AbortController().signal, async () => ({ mode: 'read-only', enforcement: 'partial',
    runnerFailureRules: [{ allowedExitCodes: [99], fatalSignatures: ['fixed fatal startup'] }],
    handle: { stdout, stderr, done: Promise.resolve({ exitCode: 99, signal: null }), terminate() {}, async waitForExit() { return true; } } }));
  assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'TERMINATION_OR_OUTCOME_UNKNOWN');
  assert.equal(result.startedAt, null); assert.equal(result.exitCode, null);
});
