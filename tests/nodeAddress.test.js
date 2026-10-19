// Tests for src/shared/nodeAddress.js and nodeAddressMigration.js: run with `npm test` (node --test).
// The one-time cleanup of a node address saved by an older GUI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanNodeAddress, probeNodeAddress, MAINNET_FALLBACK_NODE, LOCAL_NODE } from '../src/shared/nodeAddress.js';
import { migrateNodeAddress, NODE_ADDRESS_FLAG } from '../src/shared/nodeAddressMigration.js';

const replies = JSON.parse(fs.readFileSync(new URL('./fixtures/nodeReplies.json', import.meta.url), 'utf8'));

//  [saved, network, url, reason, suggest]
const table = [
  //nothing to do
  ['https://node.epiccash.com:3413', 'mainnet', 'https://node.epiccash.com:3413', '', []],
  ['http://127.0.0.1:3413', 'mainnet', 'http://127.0.0.1:3413', '', []],
  ['http://127.0.0.1:3413', 'floonet', 'http://127.0.0.1:3413', '', []],
  ['https://epic.stackwallet.com:3413', 'mainnet', 'https://epic.stackwallet.com:3413', '', []],
  //format only
  ['  https://node.epiccash.com:3413/  ', 'mainnet', 'https://node.epiccash.com:3413', 'format', []],
  ['HTTPS://Node.EpicCash.com:3413//', 'mainnet', 'https://node.epiccash.com:3413', 'format', []],
  ['http://localhost:3413/', 'mainnet', 'http://localhost:3413', 'format', []],
  //missing scheme: https for a remote host, http for the local node
  ['node.epiccash.com:3413', 'mainnet', 'https://node.epiccash.com:3413', 'scheme_added', ['http://node.epiccash.com:3413']],
  ['127.0.0.1:3413', 'mainnet', 'http://127.0.0.1:3413', 'scheme_added', []],
  ['localhost:3413/', 'usernet', 'http://localhost:3413', 'scheme_added', []],
  ['192.168.1.20:3413', 'mainnet', 'https://192.168.1.20:3413', 'scheme_added', ['http://192.168.1.20:3413']],
  ['node.btlabs.uk', 'mainnet', 'https://node.btlabs.uk', 'scheme_added',
    ['https://node.btlabs.uk:3413', 'http://node.btlabs.uk', 'http://node.btlabs.uk:3413']],
  //https to the local node -> http
  ['https://127.0.0.1:3413', 'mainnet', 'http://127.0.0.1:3413', 'local_http', []],
  ['https://localhost:13413/', 'floonet', 'http://localhost:13413', 'local_http', []],
  //dead fallbacks of older GUIs, any scheme or port -> the current fallback (mainnet)
  ['https://fastepic.eu:3413', 'mainnet', MAINNET_FALLBACK_NODE, 'dead_fallback', []],
  ['http://fastepic.eu:3413', 'mainnet', MAINNET_FALLBACK_NODE, 'dead_fallback', []],
  ['fastepic.eu', 'mainnet', MAINNET_FALLBACK_NODE, 'dead_fallback', []],
  ['https://node.fastepic.eu:443/', 'mainnet', MAINNET_FALLBACK_NODE, 'dead_fallback', []],
  ['http://116.203.211.229:3413', 'mainnet', MAINNET_FALLBACK_NODE, 'dead_fallback', []],
  ['116.203.211.229:3413', 'mainnet', MAINNET_FALLBACK_NODE, 'dead_fallback', []],
  //a floonet/usernet wallet on the mainnet fallback (or a dead one) -> the built-in node
  ['https://node.epiccash.com:3413', 'floonet', LOCAL_NODE, 'mainnet_node_on_testnet', []],
  ['http://node.epiccash.com:3413', 'usernet', LOCAL_NODE, 'mainnet_node_on_testnet', []],
  ['https://fastepic.eu:3413', 'floonet', LOCAL_NODE, 'mainnet_node_on_testnet', []],
  ['http://116.203.211.229:3413', 'usernet', LOCAL_NODE, 'mainnet_node_on_testnet', []],
  //suspicious, only the network step may change it: http:// to a remote host, no port
  ['http://node.epiccash.com:3413', 'mainnet', 'http://node.epiccash.com:3413', '', ['https://node.epiccash.com:3413']],
  ['http://node.btlabs.uk', 'mainnet', 'http://node.btlabs.uk', '', ['https://node.btlabs.uk', 'https://node.btlabs.uk:3413', 'http://node.btlabs.uk:3413']],
  ['https://node.btlabs.uk', 'mainnet', 'https://node.btlabs.uk', '', ['https://node.btlabs.uk:3413']],
  //the user's own host is kept, also on floonet (a floonet node of their own)
  ['https://my-node.example.org:3413', 'mainnet', 'https://my-node.example.org:3413', '', []],
  ['https://my-floonet-node.example.org:13413', 'floonet', 'https://my-floonet-node.example.org:13413', '', []],
  ['http://10.0.0.5:3413', 'mainnet', 'http://10.0.0.5:3413', '', ['https://10.0.0.5:3413']],
  //a path is kept (a node behind a proxy path); query and hash are not node addresses
  ['https://proxy.example.org/epic/', 'mainnet', 'https://proxy.example.org/epic', 'format', ['https://proxy.example.org:3413/epic']],
  //left alone
  ['', 'mainnet', '', 'empty', []],
  ['   ', 'mainnet', '   ', 'empty', []],
  ['http://', 'mainnet', 'http://', 'invalid', []],
  ['ftp://node.example.org', 'mainnet', 'ftp://node.example.org', 'invalid', []],
  ['https://user:pw@node.example.org:3413', 'mainnet', 'https://user:pw@node.example.org:3413', 'invalid', []],
];

for (const [saved, network, url, reason, suggest] of table) {
  test(`cleanNodeAddress ${JSON.stringify(saved)} (${network}) -> ${url}`, () => {
    const r = cleanNodeAddress(saved, { network });
    assert.deepEqual(r, { url, changed: url !== saved, reason, suggest });
    //idempotent: cleaning the result changes nothing more (empty and invalid stay as they are)
    const again = cleanNodeAddress(r.url, { network });
    assert.equal(again.url, r.url);
    assert.equal(again.changed, false);
    assert.ok(['', 'empty', 'invalid'].includes(again.reason), again.reason);
    //a guessed scheme is no longer a guess: its other-scheme suggestions go
    if (reason != 'scheme_added') {
      assert.deepEqual(again.suggest, r.suggest);
    }
  });
}

test('cleanNodeAddress: no network given means mainnet; a non-string is left alone', () => {
  assert.equal(cleanNodeAddress('https://fastepic.eu:3413').url, MAINNET_FALLBACK_NODE);
  assert.deepEqual(cleanNodeAddress(undefined), { url: '', changed: false, reason: 'empty', suggest: [] });
});

test('suggestions never name another host', () => {
  for (const [saved, network] of table) {
    const r = cleanNodeAddress(saved, { network });
    for (const s of r.suggest) {
      assert.equal(new URL(s).hostname, new URL(r.url).hostname);
    }
  }
});

//a fake network from the recorded replies: GET /v1/version per address
function network(answers) {
  const asked = [];
  const fetch = async (url, opts = {}) => {
    const base = url.replace(/\/v1\/version$|\/v2\/foreign$/, '');
    asked.push({ base, redirect: opts.redirect });
    const a = answers[base];
    if (!a || a.error) throw new TypeError('fetch failed');
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => {
      if (a.body && a.body.html !== undefined) throw new SyntaxError('html');
      return a.body;
    } };
  };
  return { fetch, asked };
}
const rec = (name) => replies[name]['GET /v1/version'];

test('probe: http:// to the TLS port of node.epiccash.com -> https, because https answers', async () => {
  const n = network({
    'http://node.epiccash.com:3413': rec('http://node.epiccash.com:3413'),
    'https://node.epiccash.com:3413': rec('https://node.epiccash.com:3413'),
  });
  const c = cleanNodeAddress('http://node.epiccash.com:3413');
  assert.deepEqual(await probeNodeAddress(c.url, c.suggest, n), { url: 'https://node.epiccash.com:3413', changed: true, reason: 'switched' });
  //redirects are not followed
  assert.ok(n.asked.every(a => a.redirect === 'manual'));
});

test('probe: http://node.btlabs.uk (301 to https) -> https://node.btlabs.uk', async () => {
  const n = network({
    'http://node.btlabs.uk': rec('http://node.btlabs.uk'),
    'https://node.btlabs.uk': rec('https://node.epiccash.com:3413'),
  });
  const c = cleanNodeAddress('http://node.btlabs.uk');
  assert.equal((await probeNodeAddress(c.url, c.suggest, n)).url, 'https://node.btlabs.uk');
});

test('probe: a healthy address without a port is kept', async () => {
  const n = network({ 'https://node.btlabs.uk': rec('https://node.epiccash.com:3413') });
  const c = cleanNodeAddress('https://node.btlabs.uk');
  assert.deepEqual(await probeNodeAddress(c.url, c.suggest, n), { url: 'https://node.btlabs.uk', changed: false, reason: 'answers' });
});

test('probe: only :3413 answers -> :3413 is added', async () => {
  const n = network({ 'https://my-node.example.org:3413': rec('https://node.epiccash.com:3413') });
  const c = cleanNodeAddress('https://my-node.example.org');
  assert.equal((await probeNodeAddress(c.url, c.suggest, n)).url, 'https://my-node.example.org:3413');
});

test('probe: a self-hosted plain http node typed without scheme -> http', async () => {
  const n = network({ 'http://192.168.1.20:3413': rec('local 4.1.0-1 (bundled) with api secret') });
  const c = cleanNodeAddress('192.168.1.20:3413');
  assert.equal((await probeNodeAddress(c.url, c.suggest, n)).url, 'http://192.168.1.20:3413');
});

test('probe: the user\'s own http node that answers is kept', async () => {
  const n = network({
    'http://10.0.0.5:3413': rec('local 4.1.0-1 (bundled) with api secret'),
    'https://10.0.0.5:3413': rec('local 4.1.0-1 (bundled) with api secret'),
  });
  const c = cleanNodeAddress('http://10.0.0.5:3413');
  assert.deepEqual(await probeNodeAddress(c.url, c.suggest, n), { url: 'http://10.0.0.5:3413', changed: false, reason: 'answers' });
});

test('probe: an old node with a secret (401) is an Epic node: kept', async () => {
  const n = network({
    'http://old.example.org:3413': rec('local 4.0.3 with api secret'),
    'https://old.example.org:3413': rec('https://node.epiccash.com:3413'),
  });
  const c = cleanNodeAddress('http://old.example.org:3413');
  assert.equal((await probeNodeAddress(c.url, c.suggest, n)).url, 'http://old.example.org:3413');
});

test('probe: nothing answers (offline, dead host) -> the user\'s address is kept', async () => {
  const c = cleanNodeAddress('http://my-node.example.org');
  assert.deepEqual(await probeNodeAddress(c.url, c.suggest, network({})), { url: 'http://my-node.example.org', changed: false, reason: 'no_answer' });
  //a 401 or an html page from a candidate is no node version
  const n = network({ 'https://my-node.example.org': rec('local 4.0.3 with api secret'), 'https://my-node.example.org:3413': rec('http://node.epiccash.com:3413') });
  assert.equal((await probeNodeAddress(c.url, c.suggest, n)).changed, false);
});

test('probe: no suggestions, no network', async () => {
  const n = network({});
  assert.deepEqual(await probeNodeAddress('https://node.epiccash.com:3413', [], n), { url: 'https://node.epiccash.com:3413', changed: false, reason: 'skipped' });
  assert.equal(n.asked.length, 0);
});

test('probe: bounded by timeoutMs, all candidates at once', async () => {
  const hang = (url, opts) => new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => {
    const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
  }));
  const c = cleanNodeAddress('http://slow.example.org');
  const started = Date.now();
  const r = await probeNodeAddress(c.url, c.suggest, { fetch: hang, timeoutMs: 100 });
  assert.equal(r.reason, 'no_answer');
  assert.ok(Date.now() - started < 1000);
});

// ---- the per-account migration on config.json

const okNode = network({ 'https://node.epiccash.com:3413': rec('https://node.epiccash.com:3413') });

test('migrate: the dead 5.x fallback -> the current one, told to the user, flagged, once', async () => {
  const config = { check_node_api_http_addr: 'https://fastepic.eu:3413', nodesynced: true };
  const r = await migrateNodeAddress(config, { network: 'mainnet', fetch: okNode.fetch });
  assert.deepEqual(r, { updated: true, change: { from: 'https://fastepic.eu:3413', to: MAINNET_FALLBACK_NODE, reason: 'dead_fallback' } });
  assert.equal(config.check_node_api_http_addr, MAINNET_FALLBACK_NODE);
  assert.equal(config[NODE_ADDRESS_FLAG], 1);
  //second login: nothing
  assert.deepEqual(await migrateNodeAddress(config, { network: 'mainnet' }), { updated: false, change: null });
});

test('migrate: a floonet wallet on the mainnet fallback -> the built-in node address', async () => {
  const config = { check_node_api_http_addr: 'https://node.epiccash.com:3413' };
  const r = await migrateNodeAddress(config, { network: 'floonet' });
  assert.equal(config.check_node_api_http_addr, LOCAL_NODE);
  assert.equal(r.change.reason, 'mainnet_node_on_testnet');
});

test('migrate: http -> https after the probe', async () => {
  const n = network({
    'http://node.epiccash.com:3413': rec('http://node.epiccash.com:3413'),
    'https://node.epiccash.com:3413': rec('https://node.epiccash.com:3413'),
  });
  const config = { check_node_api_http_addr: 'http://node.epiccash.com:3413' };
  const r = await migrateNodeAddress(config, { fetch: n.fetch });
  assert.deepEqual(r.change, { from: 'http://node.epiccash.com:3413', to: 'https://node.epiccash.com:3413', reason: 'answered' });
});

test('migrate: a healthy or format-only address: flagged, no message, no network', async () => {
  const n = network({});
  const a = { check_node_api_http_addr: 'http://127.0.0.1:3413' };
  assert.deepEqual(await migrateNodeAddress(a, { fetch: n.fetch }), { updated: true, change: null });
  assert.equal(a.check_node_api_http_addr, 'http://127.0.0.1:3413');
  const b = { check_node_api_http_addr: 'https://node.epiccash.com:3413/' };
  assert.deepEqual(await migrateNodeAddress(b, { fetch: n.fetch }), { updated: true, change: null });
  assert.equal(b.check_node_api_http_addr, 'https://node.epiccash.com:3413');
  assert.equal(n.asked.length, 0);
});

test('migrate: a custom host that does not answer is kept as saved', async () => {
  const config = { check_node_api_http_addr: 'http://my-node.example.org' };
  assert.deepEqual(await migrateNodeAddress(config, { fetch: network({}).fetch, timeoutMs: 100 }), { updated: true, change: null });
  assert.equal(config.check_node_api_http_addr, 'http://my-node.example.org');
});

test('migrate: no config or no address', async () => {
  assert.deepEqual(await migrateNodeAddress(undefined), { updated: false, change: null });
  const config = {};
  assert.deepEqual(await migrateNodeAddress(config), { updated: true, change: null });
  assert.equal('check_node_api_http_addr' in config, false);
});

test('migrate: offline at the first logins -> the network step is tried again, at most 3 times', async () => {
  const config = { check_node_api_http_addr: 'http://node.epiccash.com:3413' };
  const offline = { fetch: network({}).fetch, timeoutMs: 100 };
  for (let i = 1; i <= 2; i++) {
    assert.deepEqual(await migrateNodeAddress(config, offline), { updated: true, change: null });
    assert.equal(config[NODE_ADDRESS_FLAG], undefined, 'not flagged after offline login ' + i);
    assert.equal(config.node_address_tries, i);
  }
  //back online at the 3rd login: switched
  const n = network({ 'https://node.epiccash.com:3413': rec('https://node.epiccash.com:3413') });
  const r = await migrateNodeAddress(config, { fetch: n.fetch });
  assert.equal(r.change.to, 'https://node.epiccash.com:3413');
  assert.equal(config[NODE_ADDRESS_FLAG], 1);
  assert.equal(config.node_address_tries, undefined);
  //still offline at the 3rd: given up, address kept
  const c2 = { check_node_api_http_addr: 'http://node.epiccash.com:3413', node_address_tries: 2 };
  await migrateNodeAddress(c2, offline);
  assert.equal(c2[NODE_ADDRESS_FLAG], 1);
  assert.equal(c2.check_node_api_http_addr, 'http://node.epiccash.com:3413');
});
