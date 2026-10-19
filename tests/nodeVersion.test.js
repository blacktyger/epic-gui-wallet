// Tests for src/shared/nodeVersion.js: run with `npm test` (node --test).
// Replies are the ones recorded from real nodes 3.0.0 to 4.1.0-1 (upgrade-path research, 2026-10-19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchNodeVersion } from '../src/shared/nodeVersion.js';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

//a fake node: routes 'GET /v1/version' and 'POST /v2/foreign' to replies, records the calls
function node(routes) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    const key = (opts.method || 'GET') + ' ' + new URL(url).pathname;
    calls.push({ key, body: opts.body ? JSON.parse(opts.body) : undefined });
    const r = routes[key];
    if (r instanceof Error) throw r;
    return r || reply(404, null);
  };
  return { fetch, calls };
}

test('4.1.x: /v1/version is public', async () => {
  const n = node({ 'GET /v1/version': reply(200, { node_version: '4.1.0', block_header_version: 6 }) });
  assert.deepEqual(await fetchNodeVersion('https://node.example.org:3413/', n), { ok: true, version: '4.1.0' });
  assert.deepEqual(n.calls.map(c => c.key), ['GET /v1/version']);
});

test('4.0.x or 3.x with an api secret: 401, then the version from /v2/foreign get_version', async () => {
  const n = node({
    'GET /v1/version': reply(401, null),
    'POST /v2/foreign': reply(200, { id: 1, jsonrpc: '2.0', result: { Ok: { node_version: '4.0.3', block_header_version: 6 } } }),
  });
  assert.deepEqual(await fetchNodeVersion('http://127.0.0.1:3413', n), { ok: true, version: '4.0.3' });
  assert.equal(n.calls[1].body.method, 'get_version');
});

test('a remote node that answers 401 is not asked again (its secret is never sent)', async () => {
  const n = node({
    'GET /v1/version': reply(401, null),
    'POST /v2/foreign': reply(200, { result: { Ok: { node_version: '4.0.3' } } }),
  });
  assert.deepEqual(await fetchNodeVersion('https://node.example.org:3413', n), { ok: false, reason: 'HTTP 401' });
  assert.deepEqual(n.calls.map(c => c.key), ['GET /v1/version']);
});

test('401 everywhere is reported as HTTP 401', async () => {
  const n = node({ 'GET /v1/version': reply(401, null), 'POST /v2/foreign': reply(401, null) });
  assert.deepEqual(await fetchNodeVersion('http://127.0.0.1:3413', n), { ok: false, reason: 'HTTP 401' });
});

test('not an Epic node', async () => {
  assert.deepEqual(await fetchNodeVersion('https://example.org', node({})), { ok: false, reason: 'HTTP 404' });
  const html = node({ 'GET /v1/version': { ok: true, status: 200, json: async () => { throw new SyntaxError('html'); } } });
  assert.deepEqual(await fetchNodeVersion('https://example.org', html), { ok: false, reason: 'no node version in the reply' });
  //http:// to a TLS port: nginx says 400
  assert.deepEqual(await fetchNodeVersion('http://node.example.org:3413', node({ 'GET /v1/version': reply(400, null) })), { ok: false, reason: 'HTTP 400' });
});

test('unreachable and timeout', async () => {
  assert.deepEqual(await fetchNodeVersion('https://dead.example', node({ 'GET /v1/version': new TypeError('fetch failed') })), { ok: false, reason: 'not reachable' });
  const slow = { fetch: (url, opts) => new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => {
    const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
  })), timeoutMs: 20 };
  assert.deepEqual(await fetchNodeVersion('https://slow.example', slow), { ok: false, reason: 'no reply within 1 s' });
});
