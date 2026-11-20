import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local';
import LocalSandbox from '@deepseek-ai/dsh-sandbox-local';

// T-01 infrastructure evidence only. Fixed synthetic Node programs, never npm,
// project scripts, model requests, approval substitutes, or unconfined fallback.
async function fixture(t) {
  const ctx = new Context();
  const subprocess = ctx.plugin(LocalSubprocess);
  const sandbox = ctx.plugin(LocalSandbox, {});
  t.after(async () => { await sandbox.dispose(); await subprocess.dispose(); });
  await subprocess;
  await sandbox;
  return async (code, args = [], signal = AbortSignal.timeout(10000)) => {
    const confined = await ctx.sandbox.confine(
      [process.execPath, '-e', code, '--', ...args],
      { mode: 'read-only', workspaceRoot: process.cwd() }, signal,
    );
    assert.ok(['partial', 'full'].includes(confined.enforcement));
    t.diagnostic(`Enforcement: ${confined.enforcement}; synthetic read-only probe.`);
    const handle = ctx.subprocess.spawn({
      argv: confined.argv, cwd: process.cwd(),
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      graceMs: 100, signal,
    });
    // Always register cleanup before assertions or waiting for readiness.
    t.after(async () => {
      handle.terminate();
      assert.equal(await handle.waitForExit(AbortSignal.timeout(5000)), true,
        'Provider-managed range did not terminate; no unconfined retry permitted.');
    });
    return handle;
  };
}

async function drain(stream) {
  let retained = 0;
  const chunks = [];
  for await (const chunk of stream) {
    const part = chunk.subarray(0, Math.max(0, 4096 - retained));
    chunks.push(part);
    retained += part.length;
  }
  return Buffer.concat(chunks).toString('utf8');
}

test('G-02: confined direct Node argv preserves Unicode, spaces and shell metacharacters', { timeout: 20000 }, async (t) => {
  const start = await fixture(t);
  const args = ['中文 空格', 'a&b|c>d<e', '$(not-a-command)', '%NOT_EXPANDED%', '"quoted"', '', '--flag'];
  const handle = await start('process.stdout.write(JSON.stringify(process.argv.slice(1)))', args);
  const [outcome, stdout, stderr] = await Promise.all([handle.done, drain(handle.stdout), drain(handle.stderr)]);
  assert.equal(await handle.waitForExit(AbortSignal.timeout(5000)), true);
  assert.equal(outcome.exitCode, 0);
  assert.deepEqual(JSON.parse(stdout), args);
  assert.equal(stderr, '');
});

test('G-02: confined nonzero exit remains a nonzero fact with separate pipes', { timeout: 20000 }, async (t) => {
  const start = await fixture(t);
  const handle = await start('process.stdout.write("synthetic-out"); process.stderr.write("synthetic-err"); process.exitCode = 7;');
  const [outcome, stdout, stderr] = await Promise.all([handle.done, drain(handle.stdout), drain(handle.stderr)]);
  assert.equal(await handle.waitForExit(AbortSignal.timeout(5000)), true);
  assert.equal(outcome.exitCode, 7);
  assert.equal(stdout, 'synthetic-out');
  assert.equal(stderr, 'synthetic-err');
});

test('G-02: cancellation ends a ready synthetic root process', { timeout: 20000 }, async (t) => {
  const start = await fixture(t);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 10000);
  t.after(() => clearTimeout(deadline));
  const handle = await start('process.stdout.write("root-ready"); setInterval(() => {}, 1000)', [], controller.signal);
  const done = handle.done.then(() => undefined, () => undefined);
  const stderr = drain(handle.stderr);
  let ready = false;
  const stdout = (async () => {
    let text = '';
    for await (const chunk of handle.stdout) {
      text += chunk.toString('utf8');
      assert.ok(text.length <= 4096);
      if (!ready && text.includes('root-ready')) {
        ready = true;
        controller.abort();
      }
    }
  })();
  await Promise.all([done, stdout, stderr]);
  assert.equal(ready, true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(await handle.waitForExit(AbortSignal.timeout(5000)), true);
});

test('G-02: cancellation ends a ready synthetic parent and its provider-managed child', { timeout: 20000 }, async (t) => {
  const start = await fixture(t);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 10000);
  t.after(() => clearTimeout(deadline));
  // The descendant announces readiness through the parent's pipe. It neither
  // writes files nor detaches/breaks away from the provider-managed range.
  const childCode = 'process.stdout.write("child-ready\\n"); setInterval(() => {}, 1000)';
  const code = `
    const { spawn } = await import('node:child_process');
    try {
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
      setInterval(() => {}, 1000);
    } catch (error) {
      if (error.code !== 'EPERM') throw error;
      process.stderr.write('SYNTHETIC_CHILD_SPAWN_EPERM');
      process.exitCode = 77;
    }
  `;
  const handle = await start(code, [], controller.signal);
  // Attach a rejection handler immediately: cancellation may reject done.
  const done = handle.done.then(value => ({ value }), () => ({ rejected: true }));
  const stderr = drain(handle.stderr);
  let ready = false;
  const stdout = (async () => {
    let text = '';
    for await (const chunk of handle.stdout) {
      text += chunk.toString('utf8');
      assert.ok(text.length <= 4096, 'Unexpected synthetic probe output volume.');
      if (!ready && text.includes('child-ready\n')) {
        ready = true;
        controller.abort();
      }
    }
    return text;
  })();
  const [completion, , errorText] = await Promise.all([done, stdout, stderr]);
  if (!ready && completion.value?.exitCode === 77 && errorText === 'SYNTHETIC_CHILD_SPAWN_EPERM') {
    assert.equal(await handle.waitForExit(AbortSignal.timeout(5000)), true);
    t.skip('BLOCKED G-02: confined child spawn returned EPERM; descendant cancellation and npm lifecycle capability NOT verified. No privilege expansion or fallback.');
    return;
  }
  assert.equal(ready, true, 'Synthetic descendant must become ready before cancellation.');
  assert.equal(controller.signal.aborted, true);
  assert.equal(await handle.waitForExit(AbortSignal.timeout(5000)), true);
  t.diagnostic('waitForExit confirms only the provider-managed range; no claim about detached/breakaway descendants.');
});
