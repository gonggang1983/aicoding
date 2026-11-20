import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import { MetadataReader } from '../dist/host.js';

// Real Cordis service and real local provider, not a simulated filesystem.
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-check-'));
  const ctx = new Context();
  t.after(() => rm(root, { recursive: true, force: true }));
  const fiber = ctx.plugin(LocalFileSystem, { cwd: root });
  t.after(() => fiber.dispose());
  await fiber;
  const allowed = await ctx.fs.resolve(root);
  return { root, ctx, reader: new MetadataReader(ctx.fs, allowed), signal: new AbortController().signal };
}

test('real fs: bounded JSON read does not execute scripts or create a report', async (t) => {
  const { root, reader, signal } = await fixture(t);
  const project = join(root, '中文 project');
  await mkdir(project);
  await writeFile(join(project, 'package.json'), JSON.stringify({ scripts: { test: 'must-not-execute' } }));
  const target = await reader.project(project, signal);
  assert.deepEqual(await reader.json(target, 'package.json', signal), { scripts: { test: 'must-not-execute' } });
  assert.equal(await reader.json(target, '.dsh-project-check.json', signal), undefined);
  assert.deepEqual(await readdir(project), ['package.json']);
});

test('real fs: reject project outside trusted root', async (t) => {
  const { reader, signal } = await fixture(t);
  await assert.rejects(reader.project(tmpdir(), signal), { code: 'READ_BOUNDARY' });
});

test('real fs: sanitize malformed/oversized metadata errors', async (t) => {
  const { root, reader, signal } = await fixture(t);
  const target = await reader.project(root, signal);
  await writeFile(join(root, 'package.json'), 'private-secret-not-json');
  await assert.rejects(reader.json(target, 'package.json', signal), { message: 'INVALID_JSON' });
  await writeFile(join(root, 'package.json'), 'x'.repeat(1024 * 1024 + 1));
  await assert.rejects(reader.json(target, 'package.json', signal), { message: 'READ_FAILED' });
});

test('real fs: directory masquerading as metadata is rejected', async (t) => {
  const { root, reader, signal } = await fixture(t);
  await mkdir(join(root, 'package.json'));
  await assert.rejects(reader.json(await reader.project(root, signal), 'package.json', signal), { code: 'NOT_FILE' });
});

test('pre-aborted reads preserve cancellation', async (t) => {
  const { root, reader } = await fixture(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(reader.project(root, controller.signal), { name: 'AbortError' });
});

test('real fs: fixed lockfile detection does not parse contents and enforces boundary/cancellation', async (t) => {
  const { root, ctx, reader, signal } = await fixture(t);
  const target = await reader.project(root, signal);
  assert.equal(await reader.conflictingLockfile(target, signal), false);
  for (const filename of ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
    await writeFile(join(root, filename), 'not-json-synthetic-secret');
    assert.equal(await reader.conflictingLockfile(target, signal), true);
    await rm(join(root, filename));
  }
  await mkdir(join(root, 'yarn.lock'));
  assert.equal(await reader.conflictingLockfile(target, signal), true);
  await assert.rejects(reader.conflictingLockfile(await ctx.fs.resolve(tmpdir()), signal), { code: 'READ_BOUNDARY' });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(reader.conflictingLockfile(target, controller.signal), { name: 'AbortError' });
});

test('real fs: metadata symlink is rejected before read', async (t) => {
  const { root, reader, signal } = await fixture(t);
  await writeFile(join(root, 'original.json'), '{}');
  try {
    await symlink(join(root, 'original.json'), join(root, 'package.json'), 'file');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      t.skip('No permission to create a test file symlink; AC-11 remains unverified.');
      return;
    }
    throw error;
  }
  await assert.rejects(reader.json(await reader.project(root, signal), 'package.json', signal), { code: 'NOT_FILE' });
});
