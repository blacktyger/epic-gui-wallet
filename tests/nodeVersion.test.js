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

// ---- classification and status, over the replies recorded from real nodes (tests/fixtures/nodeReplies.json):
// public nodes live, local 4.0.3 / 4.1.0 / 4.1.0-1 release binaries run on usernet in a sandbox
import fs from 'node:fs';
import { classifyNode, fetchNodeStatus, ownerStatusToV1, compareVersions } from '../src/shared/nodeVersion.js';

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
  ['https://epic.stackwallet.com:3413', 'https://epic.stackwallet.com:3413', '', 'status_locked', '4.1.0', true, 'owner'],
  ['http://node.epiccash.com:3413', 'http://node.epiccash.com:3413', '', 'not_epic', null, false, null],
  ['https://example.org', 'https://example.org', '', 'not_epic', null, false, null],
  ['https://fastepic.eu:3413', 'https://fastepic.eu:3413', '', 'unreachable', null, false, null],
  ['http://116.203.211.229:3413', 'http://116.203.211.229:3413', '', 'unreachable', null, false, null],
  //a local 4.0.3 with its secret, which the GUI has (built-in node folder): too old, status readable
  ['local 4.0.3 with api secret', LOCAL, SECRET, 'too_old', '4.0.3', true, 'v1'],
  //...the GUI doesn't have that secret: too old, and the status can't be read either
  ['local 4.0.3 with api secret', LOCAL, '', 'too_old', '4.0.3', false, null],
  ['local 4.0.3 without api secret', LOCAL, '', 'too_old', '4.0.3', true, 'v1'],
  //the same 4.0.3 with a secret on another host: 401, version unknown, never asked with a secret
  ['local 4.0.3 with api secret', 'https://old-node.example:3413', SECRET, 'too_old', null, false, null],
  //a local plain 4.1.0: with the GUI's secret /v1/status works; without it, the owner status does
  ['local 4.1.0 with api secret', LOCAL, SECRET, 'ok', '4.1.0', true, 'v1'],
  ['local 4.1.0 with api secret', LOCAL, '', 'status_locked', '4.1.0', true, 'owner'],
  ['local 4.1.0 without api secret', LOCAL, '', 'status_locked', '4.1.0', true, 'owner'],
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

  //4.0.3 with a secret the GUI doesn't have: both 401
  const old = recorded('local 4.0.3 with api secret');
  assert.deepEqual(await fetchNodeStatus(LOCAL, { fetch: old.fetch }), { ok: false, reason: 'HTTP 401', locked: true });

  const dead = recorded('https://fastepic.eu:3413');
  assert.deepEqual(await fetchNodeStatus('https://fastepic.eu:3413', { fetch: dead.fetch }), { ok: false, reason: 'not reachable', locked: false });
});

test('withoutUserinfo: credentials in a saved address never reach the log', () => {
  assert.equal(withoutUserinfo('https://user:pw@node.example.org:3413'), 'https://node.example.org:3413');
  assert.equal(withoutUserinfo('http://user@127.0.0.1:3413/x'), 'http://127.0.0.1:3413/x');
  assert.equal(withoutUserinfo('https://node.epiccash.com:3413'), 'https://node.epiccash.com:3413');
  assert.equal(withoutUserinfo(undefined), '');
});
