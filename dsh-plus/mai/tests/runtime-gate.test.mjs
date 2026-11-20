import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local';
import LocalSandbox from '@deepseek-ai/dsh-sandbox-local';

// Infrastructure probe only: fixed Node --version, no project script or model credentials.
// Never retry using unconfined argv when this test fails.
test('G-01/G-02: real confined subprocess can start and its managed range ends', { timeout: 15000 }, async (t) => {
  const ctx = new Context();
  const subprocess = ctx.plugin(LocalSubprocess);
  const sandbox = ctx.plugin(LocalSandbox, {});
  t.after(async () => { await sandbox.dispose(); await subprocess.dispose(); });
  await subprocess;
  await sandbox;
  const signal = AbortSignal.timeout(10000);
  const confined = await ctx.sandbox.confine([process.execPath, '--version'], {
    mode: 'read-only', workspaceRoot: process.cwd(),
  }, signal);
  assert.ok(['partial', 'full'].includes(confined.enforcement));
  t.diagnostic(`Enforcement: ${confined.enforcement}; read-only probe, no workspace-write grants.`);
  const handle = ctx.subprocess.spawn({
    argv: confined.argv, cwd: process.cwd(),
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    graceMs: 1000, signal,
  });
  t.after(() => handle.terminate());
  const drain = async (stream) => {
    let size = 0;
    const chunks = [];
    for await (const chunk of stream) {
      if (size < 4096) chunks.push(chunk.subarray(0, 4096 - size));
      size += chunk.length;
    }
    return Buffer.concat(chunks).toString('utf8');
  };
  const [outcome, stdout, stderr] = await Promise.all([handle.done, drain(handle.stdout), drain(handle.stderr)]);
  assert.equal(await handle.waitForExit(AbortSignal.timeout(5000)), true);
  assert.equal(outcome.exitCode, 0, 'Confined runner did not exit successfully; no unconfined fallback allowed.');
  assert.equal(stdout.trim(), process.version);
  assert.equal(stderr.trim(), '');
});
