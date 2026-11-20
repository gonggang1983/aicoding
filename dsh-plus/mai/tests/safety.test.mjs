import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OutputCapture } from '../dist/redact.js';
import { GitParser } from '../dist/git.js';
import { classify } from '../dist/runner.js';
import { overall, recoveryAdvice, reportNotices } from '../dist/report.js';
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { planSchema, reportSchema, runInput } from '../dist/schemas.js';

for (const [code, keyword] of [
  ['APPROVAL_NOT_GRANTED', '批准'], ['NO_TASKS_SELECTED', '选择任务'], ['TIMEOUT', '超时'],
  ['TERMINATION_OR_OUTCOME_UNKNOWN', '残留进程'], ['BUSY', '等待'], ['FULL_ENFORCEMENT_REQUIRED', '不要关闭沙箱'],
]) {
  test(`fixed recovery advice: ${code}, no raw provider data`, () => {
    const task = { selected: true, status: code === 'TIMEOUT' ? 'failed' : 'not_run', reason: code, enforcement: 'not_resolved' };
    const notices = reportNotices({ reason: code, tasks: [task] });
    assert.equal(notices.length, 1); assert.ok(notices[0].includes(keyword));
    assert.ok(!recoveryAdvice('synthetic-provider-secret').includes('synthetic-provider-secret'));
  });
}

for (const [selected, expected] of [[[], 'inconclusive'], [['passed'], 'passed'], [['passed','failed'], 'failed'], [['passed','not_run'], 'inconclusive'], [['passed','unknown'], 'inconclusive']]) {
  test(`overall ${JSON.stringify(selected)} -> ${expected}; unselected failure ignored`, () => {
    assert.equal(overall([...selected.map(status => ({ selected: true, status })), { selected: false, status: 'failed' }]), expected);
  });
}
for (const [evidence, expected] of [
  [{ started: 'no', rangeEmpty: true, outcomeKnown: false, exitCode: null, cause: 'normal' }, 'not_run'],
  [{ started: 'yes', rangeEmpty: true, outcomeKnown: true, exitCode: 0, cause: 'normal' }, 'passed'],
  [{ started: 'yes', rangeEmpty: true, outcomeKnown: true, exitCode: 7, cause: 'normal' }, 'failed'],
  [{ started: 'yes', rangeEmpty: false, outcomeKnown: true, exitCode: 0, cause: 'normal' }, 'unknown'],
  [{ started: 'possible', rangeEmpty: true, outcomeKnown: false, exitCode: null, cause: 'normal' }, 'unknown'],
  [{ started: 'yes', rangeEmpty: true, outcomeKnown: true, exitCode: 0, cause: 'timeout' }, 'failed'],
  [{ started: 'yes', rangeEmpty: true, outcomeKnown: true, exitCode: null, cause: 'cancel' }, 'failed'],
  [{ started: 'yes', rangeEmpty: true, outcomeKnown: false, exitCode: null, cause: 'channel_lost' }, 'unknown'],
]) test(`terminal ${JSON.stringify(evidence)} -> ${expected}`, () => assert.equal(classify(evidence), expected));

test('capture: byte-split UTF-8/literals; original CRLF/control/overlap matching', () => {
  for (const secret of ['合成秘密', 'overlapaba', 'a\r\nb', 'a\u001bb']) {
    const capture = new OutputCapture();
    for (const byte of Buffer.from(`prefix ${secret} suffix`)) capture.append('stdout', Uint8Array.of(byte));
    assert.equal(capture.finish([secret]).stdout, '[withheld]');
  }
  const capture = new OutputCapture();
  for (const byte of Buffer.from('中文😀\r\nOK\n')) capture.append('stdout', Uint8Array.of(byte));
  assert.equal(capture.finish([]).stdout, '中文😀\nOK\n');
});
test('capture: cross-stream literals, credentials, overflow, invalid UTF-8 and incomplete data', () => {
  const mixed = new OutputCapture(); mixed.append('stdout', Buffer.from('syn')); mixed.append('stderr', Buffer.from('thetic-secret'));
  const hidden = mixed.finish(['synthetic-secret']); assert.equal(hidden.stdout, '[withheld]'); assert.equal(hidden.stderr, '[withheld]');
  for (const value of ['token=synthetic', 'Authorization: Bearer synthetic', 'https://u:p@example.invalid', '\u001b[31mraw']) {
    const c = new OutputCapture(); c.append('stderr', Buffer.from(value)); assert.equal(c.finish([]).stderr, '[withheld]');
  }
  const overflow = new OutputCapture(); overflow.append('stdout', Buffer.alloc(65536, 97)); overflow.append('stderr', Buffer.from('partial-secret'));
  const result = overflow.finish(['partial-secret']); assert.equal(result.truncated, true); assert.equal(result.stdout, '[withheld]');
  const malformed = new OutputCapture(); malformed.append('stdout', Uint8Array.of(255)); assert.equal(malformed.finish([]).stdout, '[withheld]');
  const partial = new OutputCapture(); partial.append('stdout', Buffer.from('secret-prefix')); partial.incomplete = true; assert.equal(partial.finish([]).stdout, '[withheld]');
});
test('Git parser: split NUL, renames, subtree, top-200 omissions and safe paths', () => {
  const parser = new GitParser('app/');
  const raw = ' M app/a.txt\0?? outside.txt\0R  app/new.txt\0outside/old.txt\0 M app/token=synthetic\0';
  for (const byte of Buffer.from(raw)) parser.append(Uint8Array.of(byte));
  const value = parser.finish([]);
  assert.equal(value.totalCount, 3); assert.equal(value.omittedCount, 0);
  assert.equal(value.paths.find(p => p.path === 'new.txt').originalPath, '[outside project]');
  assert.ok(!JSON.stringify(value).includes('token=synthetic'));
  const large = new GitParser('');
  for (let i = 300; i >= 0; i--) large.append(Buffer.from(`?? ${String(i).padStart(3, '0')}\0`));
  const bounded = large.finish([]); assert.equal(bounded.paths.length, 200); assert.equal(bounded.omittedCount, 101); assert.equal(bounded.paths[0].path, '000');
  for (const raw of [Buffer.from(' M unfinished'), Buffer.alloc(5000, 97), Uint8Array.of(255, 0)]) {
    const broken = new GitParser(''); broken.append(raw); assert.equal(broken.finish([]).omittedCount, null);
  }
});
test('runtime schemas are enforced subset, unknown flags rejected before dispatch', () => {
  for (const schema of [planSchema, reportSchema, runInput]) assertSupportedJsonSchema(schema);
  assert.ok(validateJsonSchemaValue(runInput, { plan: {}, approved: true }).length);
  assert.ok(validateJsonSchemaValue(reportSchema, { reportVersion: 99 }).length);
});
