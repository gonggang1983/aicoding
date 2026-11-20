import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { RuntimeHost } from '../dist/host-runtime.js';

// Explicit protocol handles test pipe/outcome races, not real confinement.
function fixture(factory) {
  const signal = new AbortController().signal;
  const host = new RuntimeHost({ subprocess: { async resolveExecutable() { return 'synthetic-git'; } } }, {}, {});
  let calls = 0;
  host.launch = async () => ({ handle: factory(calls++), mode: 'read-only', enforcement: 'partial' });
  return { host, exec: { signal } };
}
function handle(write) {
  const stdout = new PassThrough(); const stderr = new PassThrough();
  const value = { stdout, stderr, done: Promise.resolve({ exitCode: 0, signal: null }),
    terminate() { stdout.destroy(); stderr.destroy(); }, async waitForExit() { return true; } };
  setTimeout(() => write(stdout, stderr), 10);
  return value;
}

test('Git protocol: delayed pipe tail after done is included before reporting clean', async () => {
  const f = fixture(index => handle((out, err) => { out.end(index === 0 ? '\n' : '?? late file.txt\0'); err.end(); }));
  const result = await f.host.git('synthetic-root', [], f.exec);
  assert.equal(result.status, 'available'); assert.equal(result.totalCount, 1);
  assert.deepEqual(result.paths, [{ path: 'late file.txt', originalPath: null, status: '??' }]);
});

test('Git protocol: premature pipe close is unavailable, never a clean tree', async () => {
  const f = fixture(() => handle((out, err) => { out.destroy(); err.end(); }));
  const result = await f.host.git('synthetic-root', [], f.exec);
  assert.equal(result.status, 'unavailable'); assert.equal(result.totalCount, null);
});

test('Git protocol: malformed UTF-8 prefix is unavailable without diagnostics leakage', async () => {
  const f = fixture(() => handle((out, err) => { out.end(Buffer.from([0xff, 0x0a])); err.end('synthetic-raw-secret'); }));
  const result = await f.host.git('synthetic-root', [], f.exec);
  assert.equal(result.status, 'unavailable'); assert.ok(!JSON.stringify(result).includes('synthetic-raw-secret'));
});

test('Git protocol: caller cancellation during pending command terminates and propagates', async () => {
  const abort = new AbortController(); let terminated = 0;
  const f = fixture(() => {
    setImmediate(() => abort.abort());
    return { stdout: new PassThrough(), stderr: new PassThrough(), done: new Promise(() => {}),
      terminate() { terminated++; }, async waitForExit() { return true; } };
  });
  await assert.rejects(f.host.git('synthetic-root', [], { signal: abort.signal }), { name: 'AbortError' });
  assert.equal(terminated, 1);
});
