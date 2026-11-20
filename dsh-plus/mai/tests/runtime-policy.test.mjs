import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeHost } from '../dist/host-runtime.js';

// Capability-seam protocol tests only: no OS process, approval or confinement proof.
function fixture(config = {}, enforcement = 'partial') {
  let policy = { mode: 'read-only', workspaceRoot: 'synthetic-root' };
  const calls = { confine: 0, spawn: 0, terminate: 0, wait: 0 };
  const handle = { terminate() { calls.terminate++; }, async waitForExit() { calls.wait++; return true; } };
  const ctx = {
    sandboxPolicy: { resolve() { return structuredClone(policy); } },
    sandbox: { async confine(argv) { calls.confine++; return { argv: ['synthetic-wrapper', ...argv], enforcement, runnerFailureRules: [] }; } },
    subprocess: { spawn(options) { calls.spawn++; calls.options = options; return handle; } },
  };
  const host = new RuntimeHost(ctx, {}, config);
  const exec = { signal: new AbortController().signal };
  return { host, ctx, exec, calls, handle, setPolicy(value) { policy = value; }, policy: structuredClone(policy) };
}

test('runtime policy: full-enforcement requirement fails before spawn, no unconfined retry', async () => {
  const f = fixture({ requireFullEnforcement: true });
  await assert.rejects(f.host.launch(['synthetic-node'], 'synthetic-root', f.exec, f.exec.signal), /FULL_ENFORCEMENT_REQUIRED/);
  assert.equal(f.calls.confine, 1); assert.equal(f.calls.spawn, 0);
  await f.host.dispose(); assert.equal(f.calls.terminate, 0);
});

test('runtime policy: changed frozen policy rejects before confinement or spawn', async () => {
  const f = fixture();
  f.setPolicy({ ...f.policy, mode: 'danger-full-access' });
  await assert.rejects(f.host.launch(['synthetic-node'], 'synthetic-root', f.exec, f.exec.signal, f.policy), /PLAN_CHANGED/);
  assert.equal(f.calls.confine, 0); assert.equal(f.calls.spawn, 0);
});

test('runtime policy: policy change during confinement rejects before spawn', async () => {
  const f = fixture();
  const confine = f.ctx.sandbox.confine;
  f.ctx.sandbox.confine = async argv => {
    const result = await confine(argv);
    f.setPolicy({ ...f.policy, workspaceRoot: 'different-root' });
    return result;
  };
  await assert.rejects(f.host.launch(['synthetic-node'], 'synthetic-root', f.exec, f.exec.signal, f.policy), /PLAN_CHANGED/);
  assert.equal(f.calls.confine, 1); assert.equal(f.calls.spawn, 0);
});

test('runtime policy: abort during confinement cannot spawn', async () => {
  const f = fixture(); const abort = new AbortController();
  const confine = f.ctx.sandbox.confine;
  f.ctx.sandbox.confine = async argv => { const result = await confine(argv); abort.abort(); return result; };
  await assert.rejects(f.host.launch(['synthetic-node'], 'synthetic-root', f.exec, abort.signal), { name: 'AbortError' });
  assert.equal(f.calls.spawn, 0);
});

test('runtime policy: confined argv/pipes are preserved and active handles disposed', async () => {
  const f = fixture({ requireFullEnforcement: true }, 'full');
  const launch = await f.host.launch(['synthetic-node', '中文 & spaces'], 'synthetic-root', f.exec, f.exec.signal, f.policy);
  assert.deepEqual(f.calls.options.argv, ['synthetic-wrapper', 'synthetic-node', '中文 & spaces']);
  assert.deepEqual(f.calls.options.stdio, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  assert.equal(launch.enforcement, 'full');
  await f.host.dispose(); assert.equal(f.calls.terminate, 1); assert.equal(f.calls.wait, 1);
});
