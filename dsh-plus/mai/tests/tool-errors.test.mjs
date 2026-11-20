import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { ToolContextUnavailableError } from '@deepseek-ai/dsh-tools';
import { registerRuntimeTools } from '../dist/tools.js';
import { recoveryAdvice } from '../dist/report.js';

function tools(coordinator) {
  const registered = new Map();
  registerRuntimeTools({ tools: { register(tool) { registered.set(tool.name, tool); } } }, coordinator);
  return registered;
}

test('tool boundary: missing report returns fixed actionable advice, not raw inputs', async () => {
  const registered = tools({ report() { return undefined; } });
  const exec = { signal: new AbortController().signal };
  await assert.rejects(registered.get('project_check_report').execute({ runId: 'synthetic-private-run-id' }, exec), error => {
    assert.ok(error instanceof ToolContextUnavailableError);
    assert.ok(error.message.includes('REPORT_UNAVAILABLE'));
    assert.ok(error.message.includes(recoveryAdvice('REPORT_UNAVAILABLE')));
    assert.ok(!error.message.includes('synthetic-private-run-id')); return true;
  });
});

test('tool boundary: provider failure never exposes message or nested cause', async () => {
  const registered = tools({ async preview() { throw new Error('synthetic-provider-secret', { cause: new Error('nested-secret') }); } });
  const exec = { signal: new AbortController().signal };
  await assert.rejects(registered.get('project_check_preview').execute({ projectPath: resolve('synthetic-project'), taskIds: [] }, exec), error => {
    assert.ok(error instanceof ToolContextUnavailableError);
    assert.ok(error.message.includes('PROJECT_CHECK_UNAVAILABLE'));
    assert.ok(!error.message.includes('synthetic-provider-secret')); assert.equal(error.cause, undefined); return true;
  });
});
