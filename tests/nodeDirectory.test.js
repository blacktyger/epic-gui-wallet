// Tests for src/shared/nodeDirectory.js: run with `npm test` (node --test, no extra dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDirectory, createDirectory, loadDirectory, parseDirectory, normalizeNodeUrl, findNode,
  nodePageUrl, statusUrl, flag,
} from '../src/shared/nodeDirectory.js';

function node(over = {}) {
  return Object.assign({
    kind: 'node', id: 'node.example.org', endpoint: 'https://node.example.org', state: 'healthy',
    operator: 'Example', listing: 'official', height: 100, tip_lag: 0, node_version: '4.1.0', peers: 12,
    latency_ms: 80, location: { country: 'GB', provider: 'Example Host' }, uptime: { '24h': 0.99, '30d': 0.98 },
    node_status: { awaiting_peers: false },
  }, over);
}
function doc(nodes = [node()], over = {}) {
  return Object.assign({ stale: false, generated_at: '2026-10-18T20:00:00Z', network: { chain: 'mainnet', tip_height: 100 }, nodes }, over);
}
function response(body, { status = 200, headers = {} } = {}) {
  return { status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => body };
}
const okFetch = (body) => async () => response(typeof body === 'string' ? body : JSON.stringify(body));

// ------------------------------------------------------------------ failure paths: all end as null

test('timeout: a request that never answers resolves to null within the timeout', async () => {
  let aborted = false;
  const hang = (url, opts) => new Promise(() => { opts.signal.addEventListener('abort', () => { aborted = true; }); });
  const t0 = Date.now();
  assert.equal(await fetchDirectory(hang, 'mainnet', { timeoutMs: 50 }), null);
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(aborted, 'the request is aborted');
});

test('timeout: a body that never finishes resolves to null', async () => {
  const slowBody = async () => ({ status: 200, headers: { get: () => null }, text: () => new Promise(() => {}) });
  assert.equal(await fetchDirectory(slowBody, 'mainnet', { timeoutMs: 50 }), null);
});

test('non-200 responses resolve to null', async () => {
  for (const status of [204, 301, 304, 404, 500, 503]) {
    assert.equal(await fetchDirectory(async () => response(JSON.stringify(doc()), { status }), 'mainnet'), null, String(status));
  }
});

test('network errors and a throwing fetch resolve to null', async () => {
  assert.equal(await fetchDirectory(async () => { throw new TypeError('fetch failed'); }, 'mainnet'), null);
  assert.equal(await fetchDirectory(() => { throw new Error('sync throw'); }, 'mainnet'), null);
  assert.equal(await fetchDirectory(async () => null, 'mainnet'), null);
  assert.equal(await fetchDirectory(undefined, 'mainnet'), null);
});

test('bad JSON resolves to null', async () => {
  for (const body of ['', 'not json', '{"nodes": [', '<html>502 Bad Gateway</html>', '\u0000\u0001']) {
    assert.equal(await fetchDirectory(okFetch(body), 'mainnet'), null, JSON.stringify(body));
  }
});

test('an oversized body resolves to null', async () => {
  assert.equal(await fetchDirectory(okFetch('x'.repeat(2000)), 'mainnet', { maxBytes: 1000 }), null);
  const big = async () => response(JSON.stringify(doc()), { headers: { 'content-length': '99999999' } });
  assert.equal(await fetchDirectory(big, 'mainnet'), null);
});

test('wrong shape resolves to null', async () => {
  const shapes = [null, 42, 'str', [], [doc()], {}, { nodes: {} }, { nodes: 'x' }, { nodes: [] },
    { nodes: [null, 1, 'x', []] }, doc([], {}), doc([node({ state: 'down' })]), doc([node({ endpoint: 'ftp://x.org' })]),
    doc([node()], { stale: true }), doc([node()], { network: { chain: 'floonet' } })];
  for (const s of shapes) {
    assert.equal(await fetchDirectory(okFetch(s), 'mainnet'), null, JSON.stringify(s));
  }
});

test('an unknown chain makes no request', async () => {
  let called = false;
  assert.equal(await fetchDirectory(async () => { called = true; }, 'usernet'), null);
  assert.equal(called, false);
});

test('loadDirectory (renderer): missing API, throwing, hanging or garbage IPC all give null', async () => {
  assert.equal(await loadDirectory(undefined, 'mainnet'), null);
  assert.equal(await loadDirectory({}, 'mainnet'), null);
  assert.equal(await loadDirectory({ nodeDirectory: () => { throw new Error('x'); } }, 'mainnet'), null);
  assert.equal(await loadDirectory({ nodeDirectory: async () => { throw new Error('x'); } }, 'mainnet'), null);
  assert.equal(await loadDirectory({ nodeDirectory: () => new Promise(() => {}) }, 'mainnet', 50), null);
  assert.equal(await loadDirectory({ nodeDirectory: async () => 'garbage' }, 'mainnet'), null);
  assert.equal(await loadDirectory({ nodeDirectory: async () => ({ nodes: [{ endpoint: 'javascript:alert(1)' }] }) }, 'mainnet'), null);
  const ok = await loadDirectory({ nodeDirectory: async () => parseDirectory(doc(), 'mainnet') }, 'mainnet');
  assert.equal(ok.nodes.length, 1);
});

// ------------------------------------------------------------------ cache

test('cache: a good result is reused within the TTL, then fetched again', async () => {
  let t = 0, calls = 0;
  const dir = createDirectory({ fetch: async () => { calls++; return response(JSON.stringify(doc())); }, now: () => t, ttlMs: 1000 });
  assert.ok(await dir.get('mainnet'));
  t = 500; assert.ok(await dir.get('mainnet'));
  assert.equal(calls, 1);
  t = 1500; assert.ok(await dir.get('mainnet'));
  assert.equal(calls, 2);
});

test('cache: a failure is remembered briefly, and concurrent calls share one request', async () => {
  let t = 0, calls = 0;
  const dir = createDirectory({ fetch: async () => { calls++; return response('nope', { status: 500 }); }, now: () => t, failTtlMs: 1000 });
  const [a, b] = await Promise.all([dir.get('mainnet'), dir.get('mainnet')]);
  assert.equal(a, null); assert.equal(b, null);
  assert.equal(calls, 1);
  t = 500; assert.equal(await dir.get('mainnet'), null);
  assert.equal(calls, 1);
  t = 1500; await dir.get('mainnet');
  assert.equal(calls, 2);
});

test('cache: after the TTL a failure replaces the old result (nothing stale is shown)', async () => {
  let t = 0, ok = true;
  const dir = createDirectory({ fetch: async () => (ok ? response(JSON.stringify(doc())) : response('', { status: 503 })), now: () => t, ttlMs: 1000 });
  assert.ok(await dir.get('mainnet'));
  ok = false; t = 1500;
  assert.equal(await dir.get('mainnet'), null);
});

test('cache: get() never rejects, even when fetch throws synchronously', async () => {
  const dir = createDirectory({ fetch: () => { throw new Error('boom'); } });
  assert.equal(await dir.get('mainnet'), null);
  assert.equal(await dir.get('nonsense'), null);
});

// ------------------------------------------------------------------ parsing and sorting

test('only http(s) origins are offered; credentials, paths and other schemes are dropped', () => {
  const d = parseDirectory(doc([
    node({ id: 'a', endpoint: 'https://a.org:3413/' }),
    node({ id: 'b', endpoint: 'http://b.org:3413' }),
    node({ id: 'c', endpoint: 'javascript:alert(1)' }),
    node({ id: 'd', endpoint: 'https://user:pw@d.org' }),
    node({ id: 'e', endpoint: 'https://e.org/path' }),
    node({ id: 'f', endpoint: 'file:///etc/passwd' }),
    node({ id: 'g', endpoint: 42 }),
    node({ id: 'h', endpoint: 'https://a.org:3413' }), //duplicate of a
  ]), 'mainnet');
  assert.deepEqual(d.nodes.map((n) => n.endpoint).sort(), ['http://b.org:3413', 'https://a.org:3413']);
});

test('fields are checked one by one; bad values become null, not errors', () => {
  const d = parseDirectory(doc([node({
    height: -1, tip_lag: 'x', node_version: '<script>', peers: 1.5, latency_ms: NaN, operator: 'x'.repeat(200),
    location: { country: 'gb', provider: 7 }, uptime: { '24h': 2, '30d': 'y' }, node_status: 'z',
  })]), 'mainnet');
  const n = d.nodes[0];
  assert.equal(n.height, null); assert.equal(n.tipLag, null); assert.equal(n.version, null); assert.equal(n.peers, null);
  assert.equal(n.latencyMs, null); assert.equal(n.operator, null); assert.equal(n.country, null); assert.equal(n.provider, null);
  assert.equal(n.uptime24h, null); assert.equal(n.uptime30d, null); assert.equal(n.awaitingPeers, false);
});

test('sorted: online, at tip, not waiting for peers, lowest latency, then highest uptime', () => {
  const d = parseDirectory(doc([
    node({ id: 'degraded', endpoint: 'https://degraded.org', state: 'degraded', latency_ms: 1 }),
    node({ id: 'behind', endpoint: 'https://behind.org', tip_lag: 3, latency_ms: 1 }),
    node({ id: 'waiting', endpoint: 'https://waiting.org', latency_ms: 1, node_status: { awaiting_peers: true } }),
    node({ id: 'slow', endpoint: 'https://slow.org', latency_ms: 300 }),
    node({ id: 'fast-lower', endpoint: 'https://fast-lower.org', latency_ms: 20, uptime: { '24h': 0.9 } }),
    node({ id: 'fast-higher', endpoint: 'https://fast-higher.org', latency_ms: 20, uptime: { '24h': 0.999 } }),
    node({ id: 'down', endpoint: 'https://down.org', state: 'down' }),
  ]), 'mainnet');
  assert.deepEqual(d.nodes.map((n) => n.id), ['fast-higher', 'fast-lower', 'slow', 'waiting', 'behind', 'degraded']);
});

test('control and bidi characters are stripped from text; a bad id falls back to the host', () => {
  const d = parseDirectory(doc([node({ id: 'bad id <x>', operator: 'Evil\u202eCorp\u0007', location: { provider: '\u2066Host\u2069' } })]), 'mainnet');
  assert.equal(d.nodes[0].operator, 'EvilCorp');
  assert.equal(d.nodes[0].provider, 'Host');
  assert.equal(d.nodes[0].id, 'node.example.org');
});

test('a floonet document is not taken for mainnet', () => {
  assert.equal(parseDirectory(doc([node()], { network: { chain: 'floonet' } }), 'mainnet'), null);
  assert.ok(parseDirectory(doc([node()], { network: { chain: 'floonet' } }), 'floonet'));
});

test('loadDirectory keeps the good entries of a mixed list', async () => {
  const good = parseDirectory(doc(), 'mainnet').nodes[0];
  const res = await loadDirectory({ nodeDirectory: async () => ({ nodes: [good, null, { endpoint: 'https://x.org/path' }, { endpoint: 7 }] }) }, 'mainnet');
  assert.deepEqual(res.nodes.map((n) => n.endpoint), ['https://node.example.org']);
});

test('the official Epic Cash node comes first, matched by host or operator, unless it is down', () => {
  const others = [
    node({ id: 'fast', endpoint: 'https://fast.org', latency_ms: 5, operator: 'btlabs' }),
    node({ id: 'mid', endpoint: 'https://mid.org', latency_ms: 100, operator: 'x' }),
  ];
  // by host (with a port), even when it is slower, behind and degraded
  let d = parseDirectory(doc([...others, node({ id: 'node.epiccash.com', endpoint: 'https://node.epiccash.com:3413', operator: null, latency_ms: 900, tip_lag: 4, state: 'degraded' })]), 'mainnet');
  assert.deepEqual(d.nodes.map((n) => n.id), ['node.epiccash.com', 'fast', 'mid']);
  // by operator name, whatever the host and letter case
  d = parseDirectory(doc([...others, node({ id: 'epic-mirror', endpoint: 'https://mirror.epic.example', operator: ' EPIC cash ', latency_ms: 900 })]), 'mainnet');
  assert.deepEqual(d.nodes.map((n) => n.id), ['epic-mirror', 'fast', 'mid']);
  // down: not listed at all
  d = parseDirectory(doc([...others, node({ id: 'node.epiccash.com', endpoint: 'https://node.epiccash.com:3413', state: 'down' })]), 'mainnet');
  assert.deepEqual(d.nodes.map((n) => n.id), ['fast', 'mid']);
  // a look-alike host is not official
  d = parseDirectory(doc([...others, node({ id: 'fake', endpoint: 'https://node.epiccash.com.evil.org', operator: 'Not Epic', latency_ms: 900 })]), 'mainnet');
  assert.equal(d.nodes[0].id, 'fast');
});

test('the live sample shape parses', () => {
  const d = parseDirectory(doc([node({ id: 'node.btlabs.uk', endpoint: 'https://node.btlabs.uk' })]), 'mainnet');
  assert.equal(d.tipHeight, 100);
  assert.equal(d.nodes[0].host, 'node.btlabs.uk');
  assert.equal(d.nodes[0].uptime30d, 0.98);
});

test('helpers', () => {
  assert.equal(normalizeNodeUrl(' node.example.org:3413/ '), 'https://node.example.org:3413');
  assert.equal(normalizeNodeUrl('https://node.example.org:443'), 'https://node.example.org');
  assert.equal(normalizeNodeUrl('ws://x.org'), '');
  assert.equal(normalizeNodeUrl(null), '');
  const d = parseDirectory(doc(), 'mainnet');
  assert.equal(findNode(d, 'https://NODE.example.org/').id, 'node.example.org');
  assert.equal(findNode(d, 'http://other.org'), null);
  assert.equal(findNode(null, 'x'), null);
  assert.equal(nodePageUrl('mainnet', 'epic.stackwallet.com:3413'), 'https://status.btlabs.uk/#row-epic.stackwallet.com:3413');
  assert.equal(nodePageUrl('floonet', 'a'), 'https://status.btlabs.uk/?chain=floonet#row-a');
  assert.equal(statusUrl('floonet'), 'https://status.btlabs.uk/api/v1/status.json?chain=floonet');
  assert.equal(flag('GB'), '\u{1F1EC}\u{1F1E7}');
  assert.equal(flag('gb'), '');
});
