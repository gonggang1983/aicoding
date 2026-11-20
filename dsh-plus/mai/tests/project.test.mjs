import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoveryResult, discoveryMarkdown, discoveryCandidateLimit } from '../dist/project.js';
import { withheld } from '../dist/redact.js';

const task = { id: 'unit', name: 'Unit tests', script: 'custom', args: ['NEVER_RETURN_ARGUMENT'] };
const pkg = { name: '中文 project', scripts: { test: 'NEVER_RETURN_BODY', custom: 'NEVER_RUN_BODY' } };
const config = { version: 1, tasks: [task] };
const decode = value => value.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

test('discovery: arbitrary candidates, normalized input path, task labels, UUID and inconclusive evidence', () => {
  const result = discoveryResult(pkg, config, 'E:\\中文 project', false);
  assert.equal(result.reportVersion, 1);
  assert.match(result.runId, /^[0-9a-f-]{36}$/);
  assert.ok(Number.isFinite(Date.parse(result.discoveredAt)));
  assert.equal(result.projectPath, 'E:\\中文 project');
  assert.equal(result.projectName, '中文 project');
  assert.deepEqual(result.candidates, ['custom', 'test']);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.omittedCandidateCount, 0);
  assert.deepEqual(result.configuredTasks, [{ id: 'unit', name: 'Unit tests', script: 'custom', argumentCount: 1, timeoutSeconds: 120, redacted: false }]);
  assert.equal(result.overall, 'inconclusive');
  assert.ok(result.evidenceGaps.includes('CHECKS_NOT_RUN'));
  const markdown = decode(discoveryMarkdown(result));
  for (const value of [result.runId, result.projectPath, result.configuredTasks[0].id, result.overall, result.disclaimer, result.privacyNotice]) assert.ok(markdown.includes(value));
  assert.ok(!JSON.stringify([result, markdown]).includes('NEVER_'));
  assert.notEqual(discoveryResult(pkg, config, 'E:\\中文 project', false).runId, result.runId);
});

test('discovery: secrets hidden in all dynamic fields, not just Markdown', () => {
  const secret = 'synthetic-sensitive-value';
  const scripts = { [secret]: 'body' };
  const result = discoveryResult({ name: secret, scripts }, {
    version: 1, tasks: [{ id: secret, name: secret, script: secret, args: [secret] }], redactLiterals: [secret],
  }, `E:\\${secret}`, false);
  assert.equal(result.projectPath, withheld);
  assert.equal(result.projectName, withheld);
  assert.deepEqual(result.candidates, [withheld]);
  assert.equal(result.configuredTasks[0].redacted, true);
  assert.equal(result.hiddenFieldCount, 6);
  assert.ok(!JSON.stringify([result, discoveryMarkdown(result)]).includes(secret));
});

test('discovery: invalid literal config hides all dynamic metadata, no partial task exposure', () => {
  const secret = 'synthetic-private-label';
  const result = discoveryResult({ name: secret, scripts: { [secret]: 'body' } }, {
    version: 1, tasks: [{ ...task, id: secret, script: secret }], redactLiterals: [secret, null],
  }, `E:\\${secret}`, true);
  assert.equal(result.configStatus, 'invalid');
  assert.equal(result.dynamicMetadataWithheld, true);
  assert.equal(result.projectPath, withheld);
  assert.equal(result.projectName, withheld);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.omittedCandidateCount, 1);
  assert.deepEqual(result.configuredTasks, []);
  assert.deepEqual(result.configIssues, ['REDACT_LITERALS:redactLiterals']);
  assert.ok(!JSON.stringify([result, discoveryMarkdown(result)]).includes(secret));
});

test('discovery: missing config and empty task set never imply passed or authorized', () => {
  for (const raw of [undefined, { version: 1, tasks: [] }]) {
    const result = discoveryResult({}, raw, '/project', false);
    assert.equal(result.overall, 'inconclusive');
    assert.deepEqual(result.configuredTasks, []);
    assert.deepEqual(result.candidates, []);
    assert.equal(result.configStatus, raw === undefined ? 'missing' : 'valid');
  }
});

test('discovery: sorted bounded candidates have exact omitted counts', () => {
  const scripts = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`task-${String(i).padStart(3, '0')}`, 'body']));
  const result = discoveryResult({ scripts }, undefined, '/project', false);
  assert.equal(discoveryCandidateLimit, 200);
  assert.equal(result.candidates.length, 200);
  assert.equal(result.omittedCandidateCount, 50);
  assert.equal(result.candidates[0], 'task-000');
  assert.equal(result.candidates[199], 'task-199');
});

test('discovery: combined projection budget protects JSON and tasks have priority', () => {
  const scripts = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`${String(i).padStart(3, '0')}${'x'.repeat(1000)}`, 'body']));
  scripts.custom = 'body';
  const result = discoveryResult({ scripts }, config, '/project', false);
  assert.equal(result.configuredTasks[0].id, 'unit');
  assert.ok(result.hiddenFieldCount > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') < 80 * 1024);
  assert.ok(result.candidates.includes(withheld));
});

test('discovery: hostile display metadata stays data in JSON and literal text in Markdown', () => {
  const label = '<img src=x onerror=alert(1)>[link](https://example.invalid)```|';
  const result = discoveryResult({ name: label, scripts: { [label]: 'body' } }, {
    version: 1, tasks: [{ id: label, name: label, script: label, args: [] }],
  }, `/project/${label}`, false);
  const rendered = discoveryMarkdown(result);
  assert.equal(result.configuredTasks[0].id, label);
  assert.ok(!rendered.includes('<img'));
  assert.ok(!rendered.includes('[link]('));
  assert.ok(!rendered.includes('```'));
  assert.ok(!rendered.includes('|'));
  assert.ok(decode(rendered).includes(label));
});
