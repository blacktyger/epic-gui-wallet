// Tests for src/shared/nodeVersion.js: run with `npm test` (node --test).
// Replies are the ones recorded from real nodes 3.0.0 to 4.1.0-1 (upgrade-path research, 2026-10-19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchNodeVersion, withoutUserinfo } from '../src/shared/nodeVersion.js';

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

test('the version from the foreign get_version first: /v1/version is not asked', async () => {
  const n = node({
    'GET /v1/version': reply(200, { node_version: '4.1.0', block_header_version: 6 }),
    'POST /v2/foreign': reply(200, { id: 1, jsonrpc: '2.0', result: { Ok: { node_version: '4.1.1', block_header_version: 6 } } }),
  });
  assert.deepEqual(await fetchNodeVersion('https://node.example.org:3413/', n), { ok: true, version: '4.1.1' });
  assert.deepEqual(n.calls.map(c => c.key), ['POST /v2/foreign']);
  assert.equal(n.calls[0].body.method, 'get_version');
});

test('failover: no foreign get_version, then the public /v1/version', async () => {
  const n = node({ 'GET /v1/version': reply(200, { node_version: '4.1.0', block_header_version: 6 }) });
  assert.deepEqual(await fetchNodeVersion('https://node.example.org:3413/', n), { ok: true, version: '4.1.0' });
  assert.deepEqual(n.calls.map(c => c.key), ['POST /v2/foreign', 'GET /v1/version']);
});

test('4.0.x or 3.x with an api secret: /v1/version 401 does not matter, the foreign get_version answers', async () => {
  const n = node({
    'GET /v1/version': reply(401, null),
    'POST /v2/foreign': reply(200, { result: { Ok: { node_version: '4.0.3' } } }),
  });
  assert.deepEqual(await fetchNodeVersion('https://node.example.org:3413', n), { ok: true, version: '4.0.3' });
  assert.deepEqual(n.calls.map(c => c.key), ['POST /v2/foreign']);
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
  assert.deepEqual(await fetchNodeVersion('https://slow.example', slow), { ok: false, reason: 'no reply within 1 s', timeout: true });
});

// ---- classification and status, over the replies recorded from real nodes (tests/fixtures/nodeReplies.json):
// public nodes live, local 4.0.3 / 4.1.0 / 4.1.0-1 release binaries run on usernet in a sandbox
import fs from 'node:fs';
import { classifyNode, fetchNodeStatus, fetchLocalStatus, compareVersions, foreignTipToV1, fetchTipHeight, SYNC_TOLERANCE } from '../src/shared/nodeVersion.js';

const replies = JSON.parse(fs.readFileSync(new URL('./fixtures/nodeReplies.json', import.meta.url), 'utf8'));

//a fake node that answers as one recorded node did. '(auth)' replies are used when the
//request carries an Authorization header and the recording has them
function recorded(name) {
  const r = replies[name];
  assert.ok(r, 'no recording for ' + name);
  const calls = [];
  const fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    let key = (opts.method || 'GET') + ' ' + path;
    if (path == '/v2/owner' || path == '/v2/foreign') {
      key += ' ' + JSON.parse(opts.body).method;
    }
    const auth = !!(opts.headers && opts.headers.Authorization);
    calls.push({ key, auth, redirect: opts.redirect });
    const rec = (auth && r[key + ' (auth)']) || r[key];
    if (!rec) return { ok: false, status: 404, json: async () => null };
    //what Chromium's fetch does: follow a redirect unless told 'manual' (then an opaque reply)
    if (rec.status >= 300 && rec.status < 400) {
      if (opts.redirect == 'manual') return { ok: false, status: 0, type: 'opaqueredirect', json: async () => null };
      throw new Error('this fake fetch does not follow redirects: pass redirect manual');
    }
    if (rec.error) {
      const e = new TypeError('fetch failed');
      if (/Timeout/.test(rec.error)) e.name = 'TimeoutError';
      throw e;
    }
    return { ok: rec.status >= 200 && rec.status < 300, status: rec.status, json: async () => {
      if (rec.body && (rec.body.html !== undefined || rec.body.text !== undefined)) throw new SyntaxError('not json');
      return JSON.parse(JSON.stringify(rec.body));
    } };
  };
  return { fetch, calls };
}

const SECRET = 'not-a-real-secret';
const LOCAL = 'http://127.0.0.1:3413';

test('compareVersions', () => {
  assert.equal(compareVersions('4.0.3', '4.1.0'), -1);
  assert.equal(compareVersions('4.1.0', '4.1.0'), 0);
  assert.equal(compareVersions('4.1.0-1', '4.1.0'), 1);
  assert.equal(compareVersions('3.0.0', '4.1.0'), -1);
  assert.equal(compareVersions('v4.10.0', '4.9.9'), 1);
});

const classifications = [
  // [recording, address, kind, version, statusReadable]
  //every node is read from the public foreign API (get_tip + ready_for_txs), whatever its /v1/status says
  ['https://node.epiccash.com:3413', 'https://node.epiccash.com:3413', 'ok', '4.1.0', true],
  //a plain 4.1.0: /v1/status locked: just a normal node now
  ['https://epic.stackwallet.com:3413', 'https://epic.stackwallet.com:3413', 'ok', '4.1.0', true],
  ['remote 4.1.0, status locked (user report)', 'http://node.example.net:3413', 'ok', '4.1.0', true],
  ['http://node.epiccash.com:3413', 'http://node.epiccash.com:3413', 'not_epic', null, false],
  ['https://example.org', 'https://example.org', 'not_epic', null, false],
  ['https://fastepic.eu:3413', 'https://fastepic.eu:3413', 'unreachable', null, false],
  ['http://116.203.211.229:3413', 'http://116.203.211.229:3413', 'unreachable', null, false],
  ['local 4.0.3 with api secret', LOCAL, 'ok', '4.0.3', true],
  ['local 4.0.3 without api secret', LOCAL, 'ok', '4.0.3', true],
  ['local 4.0.3 with api secret', 'https://old-node.example:3413', 'ok', '4.0.3', true],
  ['local 4.1.0 with api secret', LOCAL, 'ok', '4.1.0', true],
  ['local 4.1.0 without api secret', LOCAL, 'ok', '4.1.0', true],
  ['local 4.1.0-1 (bundled) with api secret', LOCAL, 'ok', '4.1.0', true],
];

for (const [name, address, kind, version, statusReadable] of classifications) {
  test(`classifyNode: ${name} at ${address} -> ${kind}`, async () => {
    const n = recorded(name);
    const c = await classifyNode(address, { fetch: n.fetch, timeoutMs: 1000 });
    assert.equal(c.kind, kind, c.reason);
    assert.equal(c.version, version);
    assert.equal(c.statusReadable, statusReadable);
    assert.equal(c.address, address);
    if (statusReadable) {
      assert.equal(typeof c.status.tip.height, 'number');
      assert.equal(typeof c.status.sync_status, 'string');
      //peers are not known any more
      assert.equal(c.status.connections, null);
    }
    //no secret; /v1/status and /v2/owner only as the failover of a node that doesn't answer ready_for_txs
    assert.ok(n.calls.every(call => !call.auth), 'a secret was sent to ' + address);
    if (replies[name]['POST /v2/foreign ready_for_txs']) {
      assert.ok(n.calls.every(call => !/v1\/status|v2\/owner/.test(call.key)), n.calls.map(c => c.key).join());
    }
  });
}

test('the http:// 301 of node.btlabs.uk is not an Epic node when redirects are not followed', async () => {
  const rec = recorded('http://node.btlabs.uk');
  const c = await classifyNode('http://node.btlabs.uk', rec);
  assert.equal(c.kind, 'not_epic');
  assert.equal(c.reason, 'redirects elsewhere');
  assert.ok(rec.calls.length && rec.calls.every(call => call.redirect == 'manual'));
});

test('fetchNodeStatus: get_tip and ready_for_txs; /v1/status, then owner get_status only when ready_for_txs has no answer', async () => {
  const has = rpcNode({ 'POST /v2/foreign get_tip': reply(200, tipReply(3762557)), 'POST /v2/foreign ready_for_txs': ready(true),
    'GET /v1/status': reply(200, { tip: { height: 1 }, sync_status: 'header_sync', connections: 8 }) });
  const r0 = await fetchNodeStatus('https://n.example.net:443', { fetch: has.fetch });
  assert.equal(r0.status.sync_status, 'no_sync');
  assert.deepEqual(has.calls.map(c => c.key).sort(), ['POST /v2/foreign get_tip', 'POST /v2/foreign ready_for_txs']);

  //before 4.1.0 (no ready_for_txs): the sync state from /v1/status, the height still from get_tip, no peers
  const old = rpcNode({ 'POST /v2/foreign get_tip': reply(200, tipReply(3762000)),
    'GET /v1/status': reply(200, { tip: { height: 3762000 }, sync_status: 'body_sync', connections: 8 }) });
  const r1 = await fetchNodeStatus('https://n.example.net:443', { fetch: old.fetch, referenceHeight: 3762557 });
  assert.equal(r1.ok, true);
  assert.notEqual(r1.status.sync_status, 'no_sync');
  assert.equal(r1.status.connections, null);
  assert.deepEqual(old.calls.map(c => c.key), ['POST /v2/foreign get_tip', 'POST /v2/foreign ready_for_txs', 'GET /v1/status']);

  //and /v1/status closed: owner get_status (the secret to a local node only)
  const own = rpcNode({ 'POST /v2/foreign get_tip': reply(200, tipReply(3762557)), 'GET /v1/status': reply(401, null),
    'POST /v2/owner get_status': reply(200, { result: { Ok: { tip: { height: 3762557 }, sync_status: 'no_sync', connections: 8 } } }) });
  const r2 = await fetchNodeStatus('https://n.example.net:443', { fetch: own.fetch, apiSecret: SECRET });
  assert.equal(r2.status.sync_status, 'no_sync');
  assert.deepEqual(own.calls.map(c => c.key), ['POST /v2/foreign get_tip', 'POST /v2/foreign ready_for_txs', 'GET /v1/status', 'POST /v2/owner get_status']);
  assert.ok(own.calls.every(c => !c.auth), 'a secret to a remote node');

  const dead = recorded('https://fastepic.eu:3413');
  assert.deepEqual(await fetchNodeStatus('https://fastepic.eu:3413', { fetch: dead.fetch }), { ok: false, reason: 'not reachable' });
});

test('withoutUserinfo: credentials in a saved address never reach the log', () => {
  assert.equal(withoutUserinfo('https://user:pw@node.example.org:3413'), 'https://node.example.org:3413');
  assert.equal(withoutUserinfo('http://user@127.0.0.1:3413/x'), 'http://127.0.0.1:3413/x');
  assert.equal(withoutUserinfo('https://node.epiccash.com:3413'), 'https://node.epiccash.com:3413');
  assert.equal(withoutUserinfo(undefined), '');
});

// ---- every node via the foreign API

const tipReply = (height) => ({ id: 1, jsonrpc: '2.0', result: { Ok: { height, last_block_pushed: 'ab', prev_block_to_last: 'cd', total_difficulty: { progpow: 1 } } } });
const ready = (v) => reply(200, { id: 1, jsonrpc: '2.0', result: { Ok: { ready_for_txs: v } } });

//routes by method: 'GET /v1/version', 'POST /v2/foreign get_tip', ...; anything else is 404
function rpcNode(routes) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    let key = (opts.method || 'GET') + ' ' + path;
    if (opts.body) key += ' ' + JSON.parse(opts.body).method;
    calls.push({ key, auth: !!(opts.headers && opts.headers.Authorization) });
    const r = routes[key];
    if (r instanceof Error) throw r;
    return r || reply(404, null);
  };
  return { fetch, calls };
}

//a node that keeps /v1/status and owner closed (401 or 403, e.g. behind a proxy)
const node4 = (height, extra = {}) => rpcNode({
  'GET /v1/version': reply(200, { node_version: '4.1.0', block_header_version: 6 }),
  'GET /v1/status': reply(401, null),
  'POST /v2/owner get_status': reply(403, null),
  'POST /v2/foreign get_tip': reply(200, tipReply(height)),
  'POST /v2/foreign ready_for_txs': ready(true),
  ...extra,
});

test('a node that closes /v1/status and /v2/owner (401, 403) is a normal node: only foreign calls', async () => {
  const n = node4(3762557);
  const c = await classifyNode('https://epic-node.example.net:443', { fetch: n.fetch, referenceHeight: 3762558 });
  assert.equal(c.kind, 'ok');
  assert.equal(c.reason, '');
  assert.equal(c.status.tip.height, 3762557);
  assert.equal(c.status.sync_status, 'no_sync');
  assert.equal(c.status.connections, null);
  assert.deepEqual(n.calls.map(x => x.key).sort(), ['GET /v1/version', 'POST /v2/foreign get_tip', 'POST /v2/foreign get_version', 'POST /v2/foreign ready_for_txs']);
});

test('a status poll asks get_tip + ready_for_txs, never /v1/status or /v2/owner', async () => {
  const n = node4(100);
  const r = await fetchNodeStatus('https://n.example', { fetch: n.fetch });
  assert.equal(r.ok, true);
  assert.deepEqual(n.calls.map(x => x.key).sort(), ['POST /v2/foreign get_tip', 'POST /v2/foreign ready_for_txs']);
});

test('synced = ready_for_txs true; not ready = syncing with N behind the network tip', async () => {
  //ready: synced, even with no network tip to compare with
  const a = await classifyNode('https://n.example.net:443', { fetch: node4(3762557).fetch });
  assert.equal(a.status.sync_status, 'no_sync');
  assert.equal(a.status.ready_for_txs, true);
  //not ready: syncing, with the blocks to the network tip
  const b = await classifyNode('https://n.example.net:443', { fetch: node4(3762000, { 'POST /v2/foreign ready_for_txs': ready(false) }).fetch, referenceHeight: 3762557 });
  assert.equal(b.kind, 'ok');
  assert.notEqual(b.status.sync_status, 'no_sync');
  assert.deepEqual(b.status.sync_info, { current_height: 3762000, highest_height: 3762557 });
  //not ready although within the tolerance of the reference: ready_for_txs wins
  const c = await classifyNode('https://n.example.net:443', { fetch: node4(3762556, { 'POST /v2/foreign ready_for_txs': ready(false) }).fetch, referenceHeight: 3762557 });
  assert.notEqual(c.status.sync_status, 'no_sync');
  //no answer to ready_for_txs (null): the tolerance against the reference
  const none = { 'POST /v2/foreign ready_for_txs': reply(404, null) };
  const d = await classifyNode('https://n.example.net:443', { fetch: node4(3762000, none).fetch, referenceHeight: 3762557 });
  assert.notEqual(d.status.sync_status, 'no_sync');
  const e = await classifyNode('https://n.example.net:443', { fetch: node4(3762556, none).fetch, referenceHeight: 3762557 });
  assert.equal(e.status.sync_status, 'no_sync');
});

test('get_tip behind the reference (no ready_for_txs): syncing towards it, with the heights', async () => {
  const st = foreignTipToV1(tipReply(1000), { referenceHeight: 1000 + SYNC_TOLERANCE + 1 });
  assert.equal(st.sync_status, 'body_sync');
  assert.deepEqual(st.sync_info, { current_height: 1000, highest_height: 1000 + SYNC_TOLERANCE + 1 });
  assert.equal(foreignTipToV1(tipReply(1000), { referenceHeight: 1000 + SYNC_TOLERANCE }).sync_status, 'no_sync');
  //a node ahead of a lagging reference is synced
  assert.equal(foreignTipToV1(tipReply(1000), { referenceHeight: 990 }).sync_status, 'no_sync');
  //no reference: synced once it has a tip
  assert.equal(foreignTipToV1(tipReply(1000)).sync_status, 'no_sync');
  assert.equal(foreignTipToV1(tipReply(0)).tip.height, 0);
  assert.equal(foreignTipToV1({ error: { code: -32601 } }), null);
});

test('the reference height is asked once per status read', async () => {
  let asked = 0;
  const referenceHeight = async () => { asked++; return 50; };
  const r = await fetchNodeStatus('https://n.example', { fetch: node4(40, { 'POST /v2/foreign ready_for_txs': reply(404, null) }).fetch, referenceHeight });
  assert.equal(asked, 1);
  assert.equal(r.status.sync_status, 'body_sync');
});

test('kinds: unreachable, not an Epic node, too old, and a node with no get_tip', async () => {
  const noTip = node4(1, { 'POST /v2/foreign get_tip': reply(401, null) });
  const c = await classifyNode('https://node.example.net:3413', { fetch: noTip.fetch });
  assert.equal(c.kind, 'unreachable');
  assert.equal(c.statusReadable, false);
  const old = node4(1, { 'GET /v1/version': reply(200, { node_version: '4.0.3' }), 'POST /v2/foreign get_tip': reply(500, null) });
  assert.equal((await classifyNode('https://node.example.net:3413', { fetch: old.fetch })).kind, 'too_old');
  assert.equal((await classifyNode('https://example.org', { fetch: rpcNode({}).fetch })).kind, 'not_epic');
  assert.equal((await classifyNode('https://dead.example', { fetch: rpcNode({ 'GET /v1/version': new TypeError('fetch failed') }).fetch })).kind, 'unreachable');
});

test('fetchTipHeight: a node\'s tip from the public foreign API, 0 when it has none', async () => {
  assert.equal(await fetchTipHeight('https://node.epiccash.com:3413', { fetch: recorded('https://node.epiccash.com:3413').fetch }),
    replies['https://node.epiccash.com:3413']['POST /v2/foreign get_tip'].body.result.Ok.height);
  assert.equal(await fetchTipHeight('https://fastepic.eu:3413', { fetch: recorded('https://fastepic.eu:3413').fetch }), 0);
  assert.equal(await fetchTipHeight('https://x.example', { fetch: rpcNode({}).fetch }), 0);
});

test('fetchLocalStatus (the built-in node watchdog): GET /v1/status with the secret, local addresses only', async () => {
  const n = rpcNode({ 'GET /v1/status': reply(200, { tip: { height: 7 }, sync_status: 'no_sync', connections: 3 }) });
  const s = await fetchLocalStatus(LOCAL, { fetch: n.fetch, apiSecret: SECRET });
  assert.equal(s.connections, 3);
  assert.deepEqual(n.calls, [{ key: 'GET /v1/status', auth: true }]);
  //a remote address is never asked (no secret leaves the computer)
  const r = rpcNode({ 'GET /v1/status': reply(200, { tip: { height: 7 } }) });
  assert.equal(await fetchLocalStatus('https://node.example.org:3413', { fetch: r.fetch, apiSecret: SECRET }), null);
  assert.equal(r.calls.length, 0);
  //closed or failing: null (the watchdog then judges nothing)
  assert.equal(await fetchLocalStatus(LOCAL, { fetch: rpcNode({ 'GET /v1/status': reply(401, null) }).fetch }), null);
});

test('regression: a saved address with a trailing slash never asks for //v2/foreign', async () => {
  const urls = [];
  const fetch = async (url) => { urls.push(String(url)); return reply(200, { result: { Ok: { height: 1, ready_for_txs: true } } }); };
  await fetchNodeStatus('https://node.example.org:3413//', { fetch });
  await fetchTipHeight('https://node.example.org:3413/', { fetch });
  await fetchNodeVersion('https://node.example.org:3413/', { fetch });
  assert.ok(urls.length >= 3);
  for (const u of urls) assert.doesNotMatch(u.replace(/^https?:\/\//, ''), /\/\//, u);
});
