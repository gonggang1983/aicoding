import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import Projections from '@deepseek-ai/dsh-session-projection';
import Sessions from '@deepseek-ai/dsh-session';
import Approval from '@deepseek-ai/dsh-user-approval';
import Policy from '@deepseek-ai/dsh-sandbox-policy';
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local';
import LocalSandbox from '@deepseek-ai/dsh-sandbox-local';
import * as plugin from '../dist/index.js';

// Actual services and tool bodies; synthetic agent facade, no model-loop/UI approval claim.
test('runtime plugin: four tools, real frozen metadata, real never-policy rejection, no writes, unload', { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-中文 ')); const ctx = new Context(); const fibers = [];
  t.after(async () => { for (const fiber of fibers.reverse()) await fiber.dispose(); await rm(root, { recursive: true, force: true }); });
  for (const [entry, config] of [[LocalFileSystem, { cwd: root }], [SystemPrompt, {}], [Tools, {}], [Projections, undefined], [Sessions, undefined],
    [Approval, { policy: 'never' }], [Policy, { mode: 'read-only', workspaceRoot: root }], [LocalSubprocess, undefined], [LocalSandbox, {}]]) {
    const fiber = config === undefined ? ctx.plugin(entry) : ctx.plugin(entry, config); fibers.push(fiber); await fiber;
  }
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'synthetic', scripts: { test: 'node must-not-run.js' } }));
  await writeFile(join(root, '.dsh-project-check.json'), JSON.stringify({ version: 1, tasks: [{ id: 'test', name: 'Test', script: 'test', args: [] }] }));
  const npmCliPath = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const fiber = ctx.plugin(plugin, { readRoot: root, npmCliPath }); fibers.push(fiber); await fiber;
  // Child injection is lifecycle-owned; let its activation finish.
  for (let i = 0; i < 20 && !ctx.tools.get('project_check_run'); i++) await new Promise(resolve => setTimeout(resolve, 10));
  for (const name of ['discover', 'preview', 'run', 'report']) assert.ok(ctx.tools.get(`project_check_${name}`));
  assert.equal(ctx.tools.get('project_check_export'), undefined);
  const session = ctx.sessions.create(undefined, { meta: { cwd: root } }); session.append('turn/start', { turn: 1 });
  const agent = { session }; const signal = new AbortController().signal;
  const exec = args => ({ agent, signal, arguments: args });
  const preview = ctx.tools.get('project_check_preview'); const run = ctx.tools.get('project_check_run'); const report = ctx.tools.get('project_check_report');
  const args = { taskIds: ['test'] }; const plan = await preview.execute(args, exec(args));
  assert.equal(plan.projectPath, root); assert.deepEqual(plan.tasks[0].argv, [process.execPath, npmCliPath, 'run-script', 'test', '--']);
  assert.equal(plan.tasks[0].timeoutSeconds, 120);
  const result = await run.execute({ plan }, exec({ plan }));
  assert.equal(result.approval, 'rejected'); assert.equal(result.tasks[0].status, 'not_run'); assert.equal(result.tasks[0].startedAt, null);
  assert.equal(result.overall, 'inconclusive');
  assert.deepEqual(await report.execute({ runId: plan.planId }, exec({ runId: plan.planId })), result);
  await assert.rejects(run.execute({ plan, approved: true }, exec({ plan, approved: true })));
  await assert.rejects(preview.execute({ taskIds: [], outputPath: 'secret-report.json' }, exec({ taskIds: [] })));
  assert.deepEqual((await readdir(root)).sort(), ['.dsh-project-check.json', 'package.json']);
  await fiber.dispose();
  for (const name of ['discover', 'preview', 'run', 'report']) assert.equal(ctx.tools.get(`project_check_${name}`), undefined);
});
