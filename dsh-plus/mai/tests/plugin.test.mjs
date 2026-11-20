import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import * as plugin from '../dist/index.js';

// Actual Cordis, registry and filesystem. Direct tool-body calls are deliberately
// NOT claimed as model-loop / real UI / approval integration evidence.
test('independent plugin registers discovery, invokes safely, and unregisters on disposal', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-'));
  const ctx = new Context();
  const fibers = [];
  t.after(async () => {
    for (const fiber of fibers.reverse()) await fiber.dispose();
    await rm(root, { recursive: true, force: true });
  });
  for (const [entry, config] of [[LocalFileSystem, { cwd: root }], [SystemPrompt, {}], [Tools, {}]]) {
    const fiber = ctx.plugin(entry, config);
    fibers.push(fiber);
    await fiber;
  }
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: {
    test: 'node must-not-execute.js', build: 'private-token=synthetic', custom: 'secret',
  } }));
  const fiber = ctx.plugin(plugin, { readRoot: root });
  fibers.push(fiber);
  await fiber;
  const tool = ctx.tools.get('project_check_discover');
  assert.ok(tool);
  assert.equal(ctx.tools.get('project_check_export'), undefined);
  assert.equal(ctx.tools.get('project_check_run'), undefined);
  const args = { projectPath: root };
  const signal = new AbortController().signal;
  const result = await tool.execute(args, { arguments: args, signal });
  assert.deepEqual(result.candidates, ['build', 'custom', 'test']);
  assert.equal(result.configPresent, false);
  assert.equal(result.configStatus, 'missing');
  assert.equal(result.configuredTaskCount, 0);
  assert.equal(result.candidateCount, 3);
  assert.equal(result.projectPath, root);
  assert.equal(result.overall, 'inconclusive');
  assert.equal(result.reportVersion, 1);
  const rendered = tool.output.render(args, result)[0].text;
  const displayed = rendered.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  assert.ok(displayed.includes(result.runId));
  assert.ok(displayed.includes(result.projectPath));
  assert.deepEqual(result.toolchainBlockers, []);
  assert.ok(!JSON.stringify(result).includes('synthetic'));
  assert.ok(!JSON.stringify(tool.output.render(args, result)).includes('synthetic'));
  assert.deepEqual(await readdir(root), ['package.json']);
  await assert.rejects(tool.execute({ ...args, approved: true }, { arguments: { ...args, approved: true }, signal }));
  await assert.rejects(tool.execute({}, { arguments: {}, signal }));
  const defaulted = await tool.execute({}, { arguments: {}, signal, agent: { session: { header: { cwd: root } } } });
  assert.deepEqual(defaulted.candidates, ['build', 'custom', 'test']);
  await t.test('discovery validates private configuration without exposing secret-bearing labels or args', async () => {
    const privateConfig = {
      version: 1,
      tasks: [{ id: 'synthetic-id-secret', name: 'synthetic-name-secret', script: 'custom', args: ['synthetic-arg-secret'] }],
      redactLiterals: ['synthetic-id-secret', 'synthetic-name-secret', 'synthetic-arg-secret'],
    };
    await writeFile(join(root, '.dsh-project-check.json'), JSON.stringify(privateConfig));
    const value = await tool.execute(args, { arguments: args, signal });
    assert.equal(value.configStatus, 'valid');
    assert.equal(value.configuredTaskCount, 1);
    assert.deepEqual(value.configIssues, []);
    assert.equal(value.configuredTasks[0].id, '[withheld]');
    assert.equal(value.configuredTasks[0].name, '[withheld]');
    assert.equal(value.configuredTasks[0].redacted, true);
    assert.equal(value.configuredTasks[0].script, 'custom');
    const both = JSON.stringify([value, tool.output.render(args, value)]);
    assert.ok(!both.includes('synthetic-'));
    assert.deepEqual((await readdir(root)).sort(), ['.dsh-project-check.json', 'package.json']);
    privateConfig.tasks[0].command = 'synthetic-secret-command';
    await writeFile(join(root, '.dsh-project-check.json'), JSON.stringify(privateConfig));
    const invalid = await tool.execute(args, { arguments: args, signal });
    assert.equal(invalid.configStatus, 'invalid');
    assert.equal(invalid.configuredTaskCount, 0);
    assert.equal(invalid.projectPath, '[withheld]');
    assert.equal(invalid.dynamicMetadataWithheld, true);
    assert.deepEqual(invalid.candidates, []);
    assert.deepEqual(invalid.configIssues, ['UNKNOWN_FIELD:tasks[0]']);
    assert.ok(!JSON.stringify([invalid, tool.output.render(args, invalid)]).includes('synthetic-'));
  });
  await t.test('declarations and lockfile entries are visible blockers, never a silent npm fallback', async () => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.0.0', scripts: {} }));
    await writeFile(join(root, 'pnpm-lock.yaml'), 'synthetic-lock-content-must-not-escape');
    const value = await tool.execute(args, { arguments: args, signal });
    assert.deepEqual(value.toolchainBlockers, ['UNSUPPORTED_PACKAGE_MANAGER', 'CONFLICTING_LOCKFILE']);
    assert.equal(value.candidateCount, 0);
    assert.equal(value.configStatus, 'invalid'); // Unknown task field is rejected before script lookup.
    assert.deepEqual(value.configIssues, ['UNKNOWN_FIELD:tasks[0]']);
    assert.ok(!JSON.stringify([value, tool.output.render(args, value)]).includes('synthetic-'));
    assert.deepEqual((await readdir(root)).sort(), ['.dsh-project-check.json', 'package.json', 'pnpm-lock.yaml']);
  });
  await fiber.dispose();
  assert.equal(ctx.tools.get('project_check_discover'), undefined);
});
