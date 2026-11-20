import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import Projections from '@deepseek-ai/dsh-session-projection';
import Sessions from '@deepseek-ai/dsh-session';
import Approval from '@deepseek-ai/dsh-user-approval';
import Policy from '@deepseek-ai/dsh-sandbox-policy';
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local';
import LocalSandbox from '@deepseek-ai/dsh-sandbox-local';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const toolNames = ['discover', 'preview', 'run', 'report'].map(name => `project_check_${name}`);

// No registry, model request, global install, or modification of a personal DSH_HOME.
// Only the plugin tarball is installed offline. Peers are supplied by the already
// installed fixed host, through one temporary junction removed before tree cleanup.
test('offline tarball: real DSH patch boot, discovery/never rejection/report and loader unload', { timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-pack-中文 '));
  const staging = join(root, 'install'); const project = join(root, 'project 中文');
  const peers = join(staging, 'node_modules', '@deepseek-ai');
  let linked = false; let ctx;
  t.after(async () => {
    try { await ctx?.fiber.dispose(); }
    finally {
      if (linked) await unlink(peers);
      await rm(root, { recursive: true, force: true });
    }
  });
  await mkdir(staging); await mkdir(project);
  const npm = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const invoke = (args, cwd) => execFileSync(process.execPath, [npm, ...args], {
    cwd, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
  const [packed] = JSON.parse(invoke(['pack', '--json', '--ignore-scripts', '--pack-destination', root], source));
  assert.equal(packed.entryCount, 33);
  assert.ok(packed.files.some(file => file.path === 'cordis.patch.example.yml'));
  assert.ok(packed.files.every(file => file.path.startsWith('dist/') || ['README.md', 'package.json', 'cordis.patch.example.yml'].includes(file.path)));
  await writeFile(join(staging, 'package.json'), '{"private":true,"type":"module"}');
  invoke(['install', join(root, packed.filename), '--offline', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--package-lock=false'], staging);
  await symlink(join(source, 'node_modules/@deepseek-ai'), peers, process.platform === 'win32' ? 'junction' : 'dir'); linked = true;
  const installed = join(staging, 'node_modules/dsh-project-check');
  assert.equal(JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version, '0.1.0');
  await assert.rejects(readFile(join(installed, 'src/index.ts')), { code: 'ENOENT' });
  await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'packaged-synthetic', scripts: { test: 'node must-not-run.js' } }));
  await writeFile(join(project, '.dsh-project-check.json'), JSON.stringify({ version: 1, tasks: [{ id: 'test', name: 'Test', script: 'test', args: [] }] }));
  const base = join(root, 'cordis.yml'); const overlay = join(root, 'cordis.patch.yml');
  await writeFile(base, '[]\n');
  const npmCliPath = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const template = await readFile(join(installed, 'cordis.patch.example.yml'), 'utf8');
  const yamlPath = path => path.replaceAll('\\', '/').replaceAll("'", "''");
  await writeFile(overlay, template
    .replace('C:/REPLACE/plugin/node_modules/dsh-project-check/dist/index.js', yamlPath(join(installed, 'dist/index.js')))
    .replace('C:/REPLACE/project', yamlPath(project))
    .replace('C:/REPLACE/node.exe', yamlPath(process.execPath))
    .replace('C:/REPLACE/node_modules/npm/bin/npm-cli.js', yamlPath(npmCliPath)));
  const warnings = [];
  ctx = await boot('packaged-check', base, loadOverlayPatches('packaged-check', overlay), async host => {
    for (const [entry, config] of [[LocalFileSystem, { cwd: project }], [SystemPrompt, {}], [Tools, {}], [Projections, undefined], [Sessions, undefined],
      [Approval, { policy: 'never' }], [Policy, { mode: 'read-only', workspaceRoot: project }], [LocalSubprocess, undefined], [LocalSandbox, {}]]) {
      await (config === undefined ? host.plugin(entry) : host.plugin(entry, config));
    }
    host.on('internal/warning', warning => warnings.push(warning));
  });
  for (let i = 0; i < 50 && !ctx.tools.get('project_check_run'); i++) await new Promise(resolve => setTimeout(resolve, 10));
  for (const name of toolNames) assert.ok(ctx.tools.get(name), `packaged Loader must activate ${name}`);
  assert.equal(ctx.tools.get('project_check_export'), undefined);
  const session = ctx.sessions.create(undefined, { meta: { cwd: project } }); session.append('turn/start', { turn: 1 });
  const exec = args => ({ agent: { session }, signal: AbortSignal.timeout(15000), arguments: args });
  const discovered = await ctx.tools.get('project_check_discover').execute({}, exec({}));
  assert.equal(discovered.projectName, 'packaged-synthetic'); assert.equal(discovered.overall, 'inconclusive');
  const plan = await ctx.tools.get('project_check_preview').execute({ taskIds: ['test'] }, exec({ taskIds: ['test'] }));
  const report = await ctx.tools.get('project_check_run').execute({ plan }, exec({ plan }));
  assert.equal(report.approval, 'rejected'); assert.equal(report.tasks[0].startedAt, null);
  assert.deepEqual(await ctx.tools.get('project_check_report').execute({ runId: plan.planId }, exec({ runId: plan.planId })), report);
  assert.deepEqual((await readdir(project)).sort(), ['.dsh-project-check.json', 'package.json']);
  // Remove the entry through the real Loader, not merely a direct plugin fiber.
  const row = [...ctx.loader.entries()].find(entry => entry.options.id === 'dsh-project-check');
  assert.ok(row);
  const loadedPath = row.options.name.startsWith('file:') ? fileURLToPath(row.options.name) : row.options.name;
  assert.equal(resolve(loadedPath), join(installed, 'dist/index.js'));
  ctx.loader.remove(row.id); await ctx.loader.await();
  // Loader.remove initiates disposal without returning its promise. Removed
  // entries are no longer in loader.await's tree; observe the public registry.
  for (let i = 0; i < 100 && toolNames.some(name => ctx.tools.get(name)); i++) await new Promise(resolve => setTimeout(resolve, 10));
  for (const name of toolNames) assert.equal(ctx.tools.get(name), undefined);
  assert.equal(warnings.length, 0);
  t.diagnostic(`Offline ${packed.filename}; ${packed.entryCount} allowlisted files; real app-boot/Loader, never approval, existing host peers. Not a UI/model-loop or npm execution proof.`);
});
