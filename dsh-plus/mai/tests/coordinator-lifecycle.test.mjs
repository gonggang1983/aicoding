import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Coordinator } from '../dist/coordinator.js';
import { parseConfig } from '../dist/config.js';

const path = resolve('lifecycle synthetic');
function fixture() {
  return { target: { targetKey: 'lifecycle' }, path, projectName: 'synthetic', candidates: [],
    config: parseConfig({ version: 1, tasks: [] }, {}), fingerprint: 'fixed',
    nodeExecutable: process.execPath, npmCliPath: resolve('npm-cli.js'),
    policy: { mode: 'read-only', workspaceRoot: path } };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function execution(signal = new AbortController().signal) { return { agent: { session: {} }, signal }; }

for (const event of ['cancel', 'dispose']) {
  test(`coordinator lifecycle: ${event} during snapshot cannot create a late plan`, async () => {
    const read = deferred(); const entered = deferred(); let snapshotSignal;
    const host = { async snapshot(_path, exec) { snapshotSignal = exec.signal; entered.resolve(); return read.promise; }, async dispose() {} };
    const coordinator = new Coordinator(host); const abort = new AbortController();
    const pending = coordinator.preview(path, [], execution(abort.signal));
    // Attach the rejection observer before triggering cancellation.
    const rejected = assert.rejects(pending, event === 'cancel' ? { name: 'AbortError' } : /PLUGIN_DISPOSED/);
    await entered.promise;
    if (event === 'cancel') abort.abort(); else await coordinator.dispose();
    const wasAborted = snapshotSignal.aborted;
    // Even a provider that returns successfully after abort must not populate the store.
    read.resolve(fixture());
    await rejected;
    assert.equal(wasAborted, true);
    await coordinator.dispose();
  });
}

test('coordinator lifecycle: failed provider disposal still clears cached plans and reports', async () => {
  const coordinator = new Coordinator({ async snapshot() { return fixture(); }, async dispose() { throw new Error('synthetic dispose failure'); } });
  const exec = execution(); const plan = await coordinator.preview(path, [], exec);
  coordinator.store.save(exec.agent.session, { runId: 'cached', tasks: [] });
  await assert.rejects(coordinator.dispose(), /synthetic dispose failure/);
  assert.equal(coordinator.report('cached', exec), undefined);
  assert.throws(() => coordinator.store.consume(exec.agent.session, plan), /PLAN_UNAVAILABLE/);
  await assert.rejects(coordinator.preview(path, [], exec), /PLUGIN_DISPOSED/);
});
