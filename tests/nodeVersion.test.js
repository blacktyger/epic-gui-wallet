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

test('a remote node that answers 401: the version from the public /v2/foreign, never with a secret', async () => {
  const n = node({
    'GET /v1/version': reply(401, null),
    'POST /v2/foreign': reply(200, { result: { Ok: { node_version: '4.0.3' } } }),
  });
  assert.deepEqual(await fetchNodeVersion('https://node.example.org:3413', n), { ok: true, version: '4.0.3' });
  assert.deepEqual(n.calls.map(c => c.key), ['GET /v1/version', 'POST /v2/foreign']);
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

// ---- classification and status, over the replies recorded from real nodes (tests/fixtures/nodeReplies.json):
// public nodes live, local 4.0.3 / 4.1.0 / 4.1.0-1 release binaries run on usernet in a sandbox
import fs from 'node:fs';
import { classifyNode, fetchNodeStatus, ownerStatusToV1, compareVersions, foreignTipToV1, fetchTipHeight, SYNC_TOLERANCE } from '../src/shared/nodeVersion.js';

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
  // [recording, address, apiSecret, kind, version, statusReadable, statusVia]
  ['https://node.epiccash.com:3413', 'https://node.epiccash.com:3413', '', 'ok', '4.1.0', true, 'v1'],
  //a plain 4.1.0: /v1/status locked, the owner status answers: usable, no notice
  ['https://epic.stackwallet.com:3413', 'https://epic.stackwallet.com:3413', '', 'ok', '4.1.0', true, 'owner'],
  //the user report: plain 4.1.0, owner status not answering either, the foreign API (what the wallet uses) does
  ['remote 4.1.0, status locked (user report)', 'http://node.example.net:3413', '', 'ok', '4.1.0', true, 'foreign'],
  ['http://node.epiccash.com:3413', 'http://node.epiccash.com:3413', '', 'not_epic', null, false, null],
  ['https://example.org', 'https://example.org', '', 'not_epic', null, false, null],
  ['https://fastepic.eu:3413', 'https://fastepic.eu:3413', '', 'unreachable', null, false, null],
  ['http://116.203.211.229:3413', 'http://116.203.211.229:3413', '', 'unreachable', null, false, null],
  //older nodes the wallet can talk to are usable too; the version only goes to the log
  ['local 4.0.3 with api secret', LOCAL, SECRET, 'ok', '4.0.3', true, 'v1'],
  //...the GUI doesn't have that secret: v1 and owner locked, get_tip on the foreign API answers
  ['local 4.0.3 with api secret', LOCAL, '', 'ok', '4.0.3', true, 'foreign'],
  ['local 4.0.3 without api secret', LOCAL, '', 'ok', '4.0.3', true, 'v1'],
  //the same 4.0.3 with a secret on another host: never asked with a secret, the foreign API answers
  ['local 4.0.3 with api secret', 'https://old-node.example:3413', SECRET, 'ok', '4.0.3', true, 'foreign'],
  ['local 4.1.0 with api secret', LOCAL, SECRET, 'ok', '4.1.0', true, 'v1'],
  ['local 4.1.0 with api secret', LOCAL, '', 'ok', '4.1.0', true, 'owner'],
  ['local 4.1.0 without api secret', LOCAL, '', 'ok', '4.1.0', true, 'owner'],
  ['local 4.1.0-1 (bundled) with api secret', LOCAL, SECRET, 'ok', '4.1.0', true, 'v1'],
  ['local 4.1.0-1 (bundled) with api secret', LOCAL, '', 'ok', '4.1.0', true, 'v1'],
];

for (const [name, address, apiSecret, kind, version, statusReadable, statusVia] of classifications) {
  test(`classifyNode: ${name} at ${address}${apiSecret ? ' (GUI has the secret)' : ''} -> ${kind}`, async () => {
    const n = recorded(name);
    const c = await classifyNode(address, { fetch: n.fetch, apiSecret, timeoutMs: 1000 });
    assert.equal(c.kind, kind, c.reason);
    assert.equal(c.version, version);
    assert.equal(c.statusReadable, statusReadable);
    assert.equal(c.statusVia, statusVia);
    assert.equal(c.address, address);
    if (statusReadable) {
      assert.equal(typeof c.status.tip.height, 'number');
      assert.equal(typeof c.status.sync_status, 'string');
    }
    //the secret goes to a local node only
    if (!c.local) {
      assert.ok(n.calls.every(call => !call.auth), 'a secret was sent to ' + address);
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

test('ownerStatusToV1 gives the /v1/status shape (recorded stackwallet and local 4.1.0)', () => {
  for (const name of ['https://epic.stackwallet.com:3413', 'local 4.1.0 without api secret']) {
    const owner = ownerStatusToV1(replies[name]['POST /v2/owner get_status'].body);
    for (const key of ['protocol_version', 'user_agent', 'connections', 'tip', 'sync_status', 'supply', 'max_supply', 'blocks_to_next_halving']) {
      assert.ok(key in owner, key);
    }
    assert.equal(owner.tip.height, replies[name]['POST /v2/owner get_status'].body.result.Ok.tip.height);
  }
  //same fields and values as /v1/status of the same node (local 4.1.0, read with its secret)
  const rec = replies['local 4.1.0 with api secret'];
  assert.deepEqual(ownerStatusToV1(rec['POST /v2/owner get_status'].body), rec['GET /v1/status (auth)'].body);
  //sync_info is carried over while the node syncs
  const syncing = ownerStatusToV1({ result: { Ok: { tip: { height: 5 }, sync_status: 'body_sync', connections: 3,
    sync_info: { current_height: 5, highest_height: 900 } } } });
  assert.deepEqual(syncing.sync_info, { current_height: 5, highest_height: 900 });
  //no status in the reply
  assert.equal(ownerStatusToV1({ error: { code: -32600, message: 'Unauthorized' } }), null);
  assert.equal(ownerStatusToV1({ result: { Err: 'Internal' } }), null);
  assert.equal(ownerStatusToV1(null), null);
});

test('fetchNodeStatus: /v1/status first, /v2/owner only after a 401', async () => {
  const ok = recorded('https://node.epiccash.com:3413');
  const r1 = await fetchNodeStatus('https://node.epiccash.com:3413', { fetch: ok.fetch });
  assert.equal(r1.via, 'v1');
  assert.deepEqual(ok.calls.map(c => c.key), ['GET /v1/status']);

  const locked = recorded('https://epic.stackwallet.com:3413');
  const r2 = await fetchNodeStatus('https://epic.stackwallet.com:3413/', { fetch: locked.fetch, apiSecret: SECRET });
  assert.equal(r2.ok, true);
  assert.equal(r2.via, 'owner');
  assert.equal(r2.locked, true);
  assert.equal(r2.status.sync_status, 'no_sync');
  assert.deepEqual(locked.calls, [{ key: 'GET /v1/status', auth: false, redirect: 'manual' }, { key: 'POST /v2/owner get_status', auth: false, redirect: 'manual' }]);

  //4.0.3 with a secret the GUI doesn't have: v1 and owner 401, then the public foreign get_tip
  const old = recorded('local 4.0.3 with api secret');
  const r3 = await fetchNodeStatus(LOCAL, { fetch: old.fetch });
  assert.equal(r3.ok, true);
  assert.equal(r3.via, 'foreign');
  assert.deepEqual(old.calls.map(c => c.key), ['GET /v1/status', 'POST /v2/owner get_status', 'POST /v2/foreign get_tip', 'POST /v2/foreign ready_for_txs']);

  const dead = recorded('https://fastepic.eu:3413');
  assert.deepEqual(await fetchNodeStatus('https://fastepic.eu:3413', { fetch: dead.fetch }), { ok: false, reason: 'not reachable', locked: false });
});

test('withoutUserinfo: credentials in a saved address never reach the log', () => {
  assert.equal(withoutUserinfo('https://user:pw@node.example.org:3413'), 'https://node.example.org:3413');
  assert.equal(withoutUserinfo('http://user@127.0.0.1:3413/x'), 'http://127.0.0.1:3413/x');
  assert.equal(withoutUserinfo('https://node.epiccash.com:3413'), 'https://node.epiccash.com:3413');
  assert.equal(withoutUserinfo(undefined), '');
});

// ---- the /v2/foreign fallback (a node whose /v1/status and owner status are locked)

const tipReply = (height) => ({ id: 1, jsonrpc: '2.0', result: { Ok: { height, last_block_pushed: 'ab', prev_block_to_last: 'cd', total_difficulty: { progpow: 1 } } } });

//routes by method: 'GET /v1/status', 'POST /v2/owner get_status', 'POST /v2/foreign get_tip', ...
function rpcNode(routes) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    let key = (opts.method || 'GET') + ' ' + path;
    if (opts.body) key += ' ' + JSON.parse(opts.body).method;
    calls.push({ key, auth: !!(opts.headers && opts.headers.Authorization) });
    return routes[key] || reply(404, null);
  };
  return { fetch, calls };
}

const lockedNode = (height, extra = {}) => rpcNode({
  'GET /v1/version': reply(200, { node_version: '4.1.0', block_header_version: 6 }),
  'GET /v1/status': reply(401, null),
  'POST /v2/owner get_status': reply(401, null),
  'POST /v2/foreign get_tip': reply(200, tipReply(height)),
  ...extra,
});

test('403 on /v1/status and owner (status API kept private): the status from /v2/foreign get_tip, the node is usable', async () => {
  const n = lockedNode(3762557, {
    'GET /v1/status': reply(403, null),
    'POST /v2/owner get_status': reply(403, null),
  });
  const c = await classifyNode('https://epic-node.example.net:443', { fetch: n.fetch, referenceHeight: 3762558 });
  assert.equal(c.kind, 'ok');
  assert.equal(c.statusVia, 'foreign');
  assert.equal(c.status.tip.height, 3762557);
  assert.equal(c.status.sync_status, 'no_sync');
  //get_tip has no peer count: unknown, not 0
  assert.equal(c.status.connections, null);
  //no network tip to compare with: the height alone, still usable
  const u = await classifyNode('https://epic-node.example.net:443', { fetch: n.fetch });
  assert.equal(u.kind, 'ok');
  assert.equal(u.status.tip.height, 3762557);
  //a refusal elsewhere is still an error
  const other = await fetchNodeStatus('https://epic-node.example.net:443', { fetch: lockedNode(1, { 'GET /v1/status': reply(500, null) }).fetch });
  assert.equal(other.ok, false);
  assert.equal(other.reason, 'HTTP 500');
});

test('locked status: ready_for_txs decides synced or syncing, get_tip the height against the network tip', async () => {
  const ready = (v) => reply(200, { id: 1, jsonrpc: '2.0', result: { Ok: { ready_for_txs: v } } });
  const closed = { 'GET /v1/status': reply(403, null), 'POST /v2/owner get_status': reply(403, null) };
  //ready: synced, even with no network tip to compare with
  const a = await classifyNode('https://n.example.net:443', { fetch: lockedNode(3762557, { ...closed, 'POST /v2/foreign ready_for_txs': ready(true) }).fetch });
  assert.equal(a.kind, 'ok');
  assert.equal(a.status.sync_status, 'no_sync');
  //not ready: syncing, N behind the network tip
  const b = await classifyNode('https://n.example.net:443', { fetch: lockedNode(3762000, { ...closed, 'POST /v2/foreign ready_for_txs': ready(false) }).fetch, referenceHeight: 3762557 });
  assert.equal(b.kind, 'ok');
  assert.notEqual(b.status.sync_status, 'no_sync');
  assert.deepEqual(b.status.sync_info, { current_height: 3762000, highest_height: 3762557 });
  //not ready although within the tolerance of the reference: ready_for_txs wins
  const c = await classifyNode('https://n.example.net:443', { fetch: lockedNode(3762556, { ...closed, 'POST /v2/foreign ready_for_txs': ready(false) }).fetch, referenceHeight: 3762557 });
  assert.notEqual(c.status.sync_status, 'no_sync');
  //no answer to ready_for_txs: the tolerance against the reference, as before
  const d = await classifyNode('https://n.example.net:443', { fetch: lockedNode(3762000, closed).fetch, referenceHeight: 3762557 });
  assert.notEqual(d.status.sync_status, 'no_sync');
  const e = await classifyNode('https://n.example.net:443', { fetch: lockedNode(3762556, closed).fetch, referenceHeight: 3762557 });
  assert.equal(e.status.sync_status, 'no_sync');
});

test('401 on /v1/status and owner: the status from /v2/foreign get_tip, the node is usable', async () => {
  const n = lockedNode(3760613);
  const c = await classifyNode('https://node.example.net:3413', { fetch: n.fetch, referenceHeight: 3760614 });
  assert.equal(c.kind, 'ok');
  assert.equal(c.statusVia, 'foreign');
  assert.equal(c.status.tip.height, 3760613);
  //within the tolerance of the reference: synced, so sending and Epicbox go ahead
  assert.equal(c.status.sync_status, 'no_sync');
  assert.equal(c.status.user_agent, 'MW/Epic 4.1.0');
  assert.match(c.reason, /status via foreign/);
  assert.ok(n.calls.every(call => !call.auth), 'no secret to a remote host');
});

test('get_tip behind the reference: syncing towards it, with the heights', async () => {
  const st = foreignTipToV1(tipReply(1000), { referenceHeight: 1000 + SYNC_TOLERANCE + 1 });
  assert.equal(st.sync_status, 'body_sync');
  assert.deepEqual(st.sync_info, { current_height: 1000, highest_height: 1000 + SYNC_TOLERANCE + 1 });
  assert.equal(foreignTipToV1(tipReply(1000), { referenceHeight: 1000 + SYNC_TOLERANCE }).sync_status, 'no_sync');
  //a node ahead of a lagging reference is synced
  assert.equal(foreignTipToV1(tipReply(1000), { referenceHeight: 990 }).sync_status, 'no_sync');
  //no reference: synced once it has a tip
  assert.equal(foreignTipToV1(tipReply(1000)).sync_status, 'no_sync');
  //a node that just started (genesis only) has a tip at 0: readable, not synced (App needs height > 0)
  assert.equal(foreignTipToV1(tipReply(0)).tip.height, 0);
  assert.equal(foreignTipToV1({ error: { code: -32601 } }), null);
});

test('the reference height is asked only when the foreign fallback is used', async () => {
  let asked = 0;
  const referenceHeight = async () => { asked++; return 50; };
  const ok = rpcNode({ 'GET /v1/status': reply(200, { tip: { height: 50 }, sync_status: 'no_sync', connections: 8 }) });
  assert.equal((await fetchNodeStatus('https://n.example', { fetch: ok.fetch, referenceHeight })).via, 'v1');
  assert.equal(asked, 0);
  const r = await fetchNodeStatus('https://n.example', { fetch: lockedNode(40).fetch, referenceHeight });
  assert.equal(asked, 1);
  assert.equal(r.via, 'foreign');
  assert.equal(r.status.sync_status, 'body_sync');
});

test('nothing public answers: status_locked (4.1.0) or too_old (older), and the notice shows', async () => {
  const locked = lockedNode(1, { 'POST /v2/foreign get_tip': reply(401, null) });
  const c = await classifyNode('https://node.example.net:3413', { fetch: locked.fetch });
  assert.equal(c.kind, 'status_locked');
  assert.equal(c.statusReadable, false);
  const old = lockedNode(1, {
    'GET /v1/version': reply(200, { node_version: '4.0.3' }),
    'POST /v2/foreign get_tip': reply(500, null),
  });
  assert.equal((await classifyNode('https://node.example.net:3413', { fetch: old.fetch })).kind, 'too_old');
});

test('fetchTipHeight: a node\'s tip from the public foreign API, 0 when it has none', async () => {
  assert.equal(await fetchTipHeight('https://node.epiccash.com:3413', { fetch: recorded('https://node.epiccash.com:3413').fetch }),
    replies['https://node.epiccash.com:3413']['POST /v2/foreign get_tip'].body.result.Ok.height);
  assert.equal(await fetchTipHeight('https://fastepic.eu:3413', { fetch: recorded('https://fastepic.eu:3413').fetch }), 0);
  assert.equal(await fetchTipHeight('https://x.example', { fetch: rpcNode({}).fetch }), 0);
});

test('regression: a locked node is asked the way that worked last time, not with 401s first on every poll', async () => {
  //6.1.5 sent GET /v1/status (401) and POST /v2/owner (401) before get_tip on every 10 s poll
  const n = lockedNode(500);
  const first = await fetchNodeStatus('https://n.example', { fetch: n.fetch });
  assert.equal(first.via, 'foreign');
  n.calls.length = 0;
  const again = await fetchNodeStatus('https://n.example', { fetch: n.fetch, via: first.via });
  assert.equal(again.ok, true);
  assert.equal(again.via, 'foreign');
  assert.equal(again.locked, true);
  assert.deepEqual(n.calls.map(c => c.key), ['POST /v2/foreign get_tip', 'POST /v2/foreign ready_for_txs']);

  const o = rpcNode({
    'GET /v1/status': reply(401, null),
    'POST /v2/owner get_status': reply(200, { id: 1, jsonrpc: '2.0', result: { Ok: { chain: 'main', protocol_version: 2, user_agent: 'MW/Epic 4.1.0', connections: 8, tip: { height: 9, last_block_pushed: 'a', prev_block_to_last: 'b', total_difficulty: 1 }, sync_status: 'no_sync', sync_info: null } } }),
  });
  const viaOwner = await fetchNodeStatus('https://n.example', { fetch: o.fetch, via: 'owner' });
  assert.equal(viaOwner.via, 'owner');
  assert.deepEqual(o.calls.map(c => c.key), ['POST /v2/owner get_status']);
});

test('the hinted way fails: the whole chain again (the node changed or was unlocked)', async () => {
  const opened = rpcNode({ 'GET /v1/status': reply(200, { tip: { height: 7 }, sync_status: 'no_sync', connections: 3 }) });
  const r = await fetchNodeStatus('https://n.example', { fetch: opened.fetch, via: 'foreign' });
  assert.equal(r.via, 'v1');
  assert.deepEqual(opened.calls.map(c => c.key), ['POST /v2/foreign get_tip', 'POST /v2/foreign ready_for_txs', 'GET /v1/status']);
  const gone = rpcNode({});
  const g = await fetchNodeStatus('https://n.example', { fetch: gone.fetch, via: 'owner' });
  assert.equal(g.ok, false);
  assert.deepEqual(gone.calls.map(c => c.key), ['POST /v2/owner get_status', 'POST /v2/foreign get_tip', 'POST /v2/foreign ready_for_txs', 'GET /v1/status']);
});

test('regression: a saved address with a trailing slash never asks for //v1/status', async () => {
  const urls = [];
  const fetch = async (url) => { urls.push(String(url)); return reply(200, { tip: { height: 1 }, sync_status: 'no_sync' }); };
  await fetchNodeStatus('https://node.example.org:3413//', { fetch });
  await fetchTipHeight('https://node.example.org:3413/', { fetch });
  await fetchNodeVersion('https://node.example.org:3413/', { fetch });
  assert.ok(urls.length >= 3);
  for (const u of urls) assert.doesNotMatch(u.replace(/^https?:\/\//, ''), /\/\//, u);
});
