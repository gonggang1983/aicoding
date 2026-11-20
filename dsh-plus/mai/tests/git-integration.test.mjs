import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local';
import LocalSandbox from '@deepseek-ai/dsh-sandbox-local';
import Policy from '@deepseek-ai/dsh-sandbox-policy';
import Projections from '@deepseek-ai/dsh-session-projection';
import { RuntimeHost } from '../dist/host-runtime.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-中文 '));
  const ctx = new Context(); const fibers = []; let host;
  t.after(async () => {
    await host?.dispose();
    for (const fiber of fibers.reverse()) await fiber.dispose();
    await rm(root, { recursive: true, force: true });
  });
  // Only fixture setup uses direct Git; no project commands/hooks/install are run.
  // The production read under test MUST go through the real read-only sandbox.
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^GIT_/i.test(name)) delete env[name];
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'absent-global-config'), GIT_TERMINAL_PROMPT: '0' });
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=' + join(root, 'no-hooks'), '-c', 'commit.gpgSign=false',
    '-c', 'core.autocrlf=false', '-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', ...args],
  { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
  await mkdir(join(root, 'empty-template'));
  git('init', '--template=' + join(root, 'empty-template'));
  await rm(join(root, 'empty-template'), { recursive: true });
  for (const [entry, config] of [[LocalSubprocess, undefined], [LocalSandbox, {}], [Projections, undefined], [Policy, { mode: 'read-only', workspaceRoot: root }]]) {
    const fiber = config === undefined ? ctx.plugin(entry) : ctx.plugin(entry, config); fibers.push(fiber); await fiber;
  }
  assert.ok(ctx.sandboxPolicy, 'real policy service must be mounted, not silently absent');
  host = new RuntimeHost(ctx, {}, {});
  const exec = { signal: AbortSignal.timeout(20000) };
  const file = async (name, text = name + '\n') => { await mkdir(join(root, name, '..'), { recursive: true }); await writeFile(join(root, name), text); };
  const baseline = async () => { git('add', '--all'); git('commit', '-m', 'synthetic baseline'); };
  return { root, host, exec, git, file, baseline };
}

test('real confined Git: clean, staged, unstaged, Unicode/untracked and no index write', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  await f.file('staged.txt'); await f.file('modified.txt'); await f.baseline();
  const clean = await f.host.git(f.root, [], f.exec);
  assert.equal(clean.status, 'available'); assert.equal(clean.reason, 'GIT_CLEAN'); assert.equal(clean.totalCount, 0);
  await f.file('staged.txt', 'staged change\n'); f.git('add', '--', 'staged.txt');
  await f.file('modified.txt', 'unstaged change\n'); await f.file('中文 space & file.txt');
  const before = await readFile(join(f.root, '.git', 'index'));
  const result = await f.host.git(f.root, [], f.exec);
  assert.equal(result.status, 'available'); assert.equal(result.totalCount, 3); assert.equal(result.omittedCount, 0);
  assert.deepEqual(result.paths, [
    { path: 'modified.txt', originalPath: null, status: ' M' },
    { path: 'staged.txt', originalPath: null, status: 'M ' },
    { path: '中文 space & file.txt', originalPath: null, status: '??' },
  ]);
  assert.deepEqual(await readFile(join(f.root, '.git', 'index')), before);
});

test('real confined Git: nested project filters siblings and preserves internal rename', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  await f.file('project/old name.txt'); await f.file('sibling/private.txt'); await f.baseline();
  await rename(join(f.root, 'project/old name.txt'), join(f.root, 'project/new 中文.txt'));
  await f.file('sibling/private.txt', 'changed outside\n'); f.git('add', '--all');
  const result = await f.host.git(join(f.root, 'project'), [], f.exec);
  assert.equal(result.status, 'available'); assert.equal(result.totalCount, 1);
  assert.deepEqual(result.paths, [{ path: 'new 中文.txt', originalPath: 'old name.txt', status: 'R ' }]);
  assert.ok(!JSON.stringify(result).includes('sibling'));
});

test('real confined Git: cross-subtree renames never expose outside names', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  await f.file('project/moving-out.txt'); await f.file('outside-moving-in.txt'); await f.baseline();
  await rename(join(f.root, 'project/moving-out.txt'), join(f.root, 'outside-moved.txt'));
  await rename(join(f.root, 'outside-moving-in.txt'), join(f.root, 'project/moved-in.txt'));
  f.git('add', '--all');
  const result = await f.host.git(join(f.root, 'project'), [], f.exec);
  assert.equal(result.status, 'available'); assert.equal(result.totalCount, 2);
  assert.ok(result.paths.some(entry => entry.path === 'moved-in.txt'));
  assert.ok(result.paths.some(entry => entry.path === 'moving-out.txt' || entry.originalPath === 'moving-out.txt'));
  assert.ok(!JSON.stringify(result).includes('outside-mov'));
});

test('real confined Git: top-200 counts and configured literal redaction', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  await f.file('baseline'); await f.baseline();
  await Promise.all(Array.from({ length: 205 }, (_, i) => f.file(`entry-${String(i).padStart(3, '0')}.txt`)));
  const result = await f.host.git(f.root, ['entry-000'], f.exec);
  assert.equal(result.status, 'available'); assert.equal(result.totalCount, 205); assert.equal(result.omittedCount, 5);
  assert.equal(result.paths.length, 200); assert.equal(result.paths[0].path, '[withheld]');
  assert.ok(!JSON.stringify(result).includes('entry-000'));
});

test('real confined Git: non-repository degrades; caller cancellation propagates', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  await rm(join(f.root, '.git'), { recursive: true });
  const result = await f.host.git(f.root, [], f.exec);
  assert.equal(result.status, 'unavailable'); assert.equal(result.totalCount, null); assert.deepEqual(result.paths, []);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(f.host.git(f.root, [], { signal: abort.signal }), { name: 'AbortError' });
});
