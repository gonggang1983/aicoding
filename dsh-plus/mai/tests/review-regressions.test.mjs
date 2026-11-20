import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { resolve } from 'node:path';
import { Coordinator } from '../dist/coordinator.js';
import { GitParser, unavailableGit } from '../dist/git.js';
import { parseConfig } from '../dist/config.js';
import { reportMarkdown } from '../dist/report.js';
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { reportSchema } from '../dist/schemas.js';

for (const status of [' T', 'T ', 'TM']) {
  test(`R-02: valid Git type-change status ${JSON.stringify(status)} is retained`, () => {
    const parser = new GitParser('app/');
    for (const byte of Buffer.from(`${status} app/changed-file\0`)) parser.append(Uint8Array.of(byte));
    const result = parser.finish([]);
    assert.equal(result.status, 'available'); assert.equal(result.totalCount, 1); assert.equal(result.omittedCount, 0);
    assert.deepEqual(result.paths, [{ path: 'changed-file', originalPath: null, status }]);
    const malformed = new GitParser(''); malformed.append(Buffer.from(' Z invalid\0'));
    assert.equal(malformed.finish([]).status, 'incomplete');
  });
}

test('R-01 protocol: task-controlled runner signature stops scheduling and caches unknown evidence', async () => {
  const path = resolve('review synthetic'); const owner = {};
  const exec = { agent: { session: owner }, signal: new AbortController().signal };
  const config = parseConfig({ version: 1, tasks: ['first', 'second'].map(id => ({ id, name: id, script: id, args: [] })) }, { first: 'synthetic', second: 'synthetic' });
  let launches = 0; let executed = false;
  const coordinator = new Coordinator({
    async snapshot() { return { target: { targetKey: 'review' }, path, projectName: 'synthetic', candidates: [], config,
      fingerprint: 'stable', nodeExecutable: process.execPath, npmCliPath: resolve('npm-cli.js'), policy: { mode: 'read-only', workspaceRoot: path } }; },
    async approval() { return 'allowed-once'; },
    async git() { return unavailableGit(); },
    async launch() {
      launches++;
      const stdout = new PassThrough(); const stderr = new PassThrough();
      const done = new Promise(resolve => setImmediate(() => {
        // Synthetic task execution is known by the fixture, not the coordinator.
        // The task can write the same stderr as a wrapper failure after side effects.
        executed = true; stdout.end('task ran'); stderr.end('synthetic runner fatal'); resolve({ exitCode: 17, signal: null });
      }));
      return { mode: 'read-only', enforcement: 'partial',
        runnerFailureRules: [{ allowedExitCodes: [17], fatalSignatures: ['synthetic runner fatal'] }],
        handle: { stdout, stderr, done, terminate() {}, async waitForExit() { await done; return true; } } };
    },
    async dispose() {},
  });
  try {
    const plan = await coordinator.preview(path, ['first', 'second'], exec);
    const report = await coordinator.run(plan, exec);
    assert.equal(executed, true); assert.equal(launches, 1);
    assert.equal(report.reason, 'TERMINATION_OR_OUTCOME_UNKNOWN'); assert.equal(report.overall, 'inconclusive');
    assert.deepEqual(report.tasks.map(task => task.status), ['unknown', 'not_run']);
    assert.equal(report.tasks[0].startedAt, null); assert.equal(report.tasks[0].exitCode, null);
    assert.equal(report.tasks[1].reason, 'TERMINATION_OR_OUTCOME_UNKNOWN');
    assert.deepEqual(validateJsonSchemaValue(reportSchema, report), []);
    assert.deepEqual(coordinator.report(plan.planId, exec), report);
    assert.ok(reportMarkdown(report).includes('unknown'));
    assert.ok(report.notices.some(notice => notice.includes('终态证据不足')));
  } finally { await coordinator.dispose(); }
});
