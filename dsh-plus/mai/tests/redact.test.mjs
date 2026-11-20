import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MetadataProjection, markdownText, withheld } from '../dist/redact.js';

test('metadata projection: complete originals, overlapping/CRLF/control literals and defensive copy', () => {
  const literals = ['abc', 'bcd', 'line\r\nsecret', 'control\x1bsecret'];
  const projection = new MetadataProjection(literals);
  literals[0] = 'changed';
  for (const raw of ['abcd', 'xline\r\nsecrety', 'control\x1bsecret']) {
    assert.deepEqual(projection.field(raw), { text: withheld, hidden: true });
  }
  assert.deepEqual(projection.field('中文 safe 😀'), { text: '中文 safe 😀', hidden: false });
  assert.throws(() => new MetadataProjection(['']), { message: 'INVALID_REDACTION_LITERALS' });
});

for (const raw of [
  'password=synthetic', '"password": "synthetic"', 'token : synthetic',
  'secret=synthetic', 'api_key=synthetic', 'Authorization: Bearer synthetic',
  '"Authorization": "synthetic"', 'Basic synthetic',
  'https://synthetic-user:synthetic-pass@example.invalid/path',
  'sk-syntheticvalue123456789', 'ghp_syntheticvalue123456789',
  'AKIA1234567890ABCDEF', 'a\nb', 'a\x1bb', 'a\u202eb', 'a\u2066b', 'a\ud800b',
]) {
  test(`metadata projection: hides credential/control sample ${JSON.stringify(raw)}`, () => {
    assert.deepEqual(new MetadataProjection([]).field(raw), { text: withheld, hidden: true });
  });
}

test('metadata projection: byte limits hide whole fields, never expose a truncated prefix', () => {
  const projection = new MetadataProjection([]);
  assert.equal(projection.field('x'.repeat(4096)).hidden, false);
  assert.equal(projection.field('x'.repeat(4097)).text, withheld);
  assert.equal(projection.field('中'.repeat(1366)).hidden, true);
  // A fresh projection has exactly 64 KiB of raw safe-field budget.
  const bounded = new MetadataProjection([]);
  for (let i = 0; i < 16; i++) assert.equal(bounded.field('x'.repeat(4096)).hidden, false);
  assert.equal(bounded.field('last').text, withheld);
  const secretAtBoundary = new MetadataProjection(['sensitive-suffix']);
  assert.equal(secretAtBoundary.field('x'.repeat(4090) + 'sensitive-suffix').text, withheld);
});

test('Markdown: HTML, links, auto-links, fences, table cells and controls become literal entities', () => {
  const raw = '<script>"x"</script> [link](https://example.invalid) ![img](x) ``` | & &#60; \\ \r\n\u202e';
  const rendered = markdownText(raw);
  assert.ok(!/[<>`|\[\]()\\\r\n\u202e]/.test(rendered));
  assert.ok(!rendered.includes('https:'));
  assert.ok(rendered.includes('&#38;&#35;60;'));
  // Exactly one entity decoding recovers data, not newly inserted markup syntax.
  assert.equal(rendered.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))), raw);
});
