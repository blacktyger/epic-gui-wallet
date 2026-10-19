// Tests for src/shared/epicboxDirectory.js (and the epicbox part of nodeDirectory.parseDirectory)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEpicboxServers, epicboxServerList, loadEpicboxServers, knownServers, findServer, cleanDomain,
} from '../src/shared/epicboxDirectory.js';
import { parseDirectory, createDirectory } from '../src/shared/nodeDirectory.js';

function relay(over = {}) {
  return Object.assign({
    kind: 'epicbox', id: 'epicbox.example.org', endpoint: 'wss://epicbox.example.org:443/', host: 'epicbox.example.org',
    state: 'healthy', label: null, operator: 'Example', listing: 'community', latency_ms: 480.4,
    location: { country: 'FI', provider: 'Hetzner' }, uptime: { '1h': 1, '24h': 0.99, '30d': 0.95 },
  }, over);
}
function doc(epicbox, over = {}) {
  return Object.assign({ stale: false, network: { chain: 'mainnet' }, nodes: [], epicbox }, over);
}

test('parse: the fields the app shows, checked', () => {
  const [s] = parseEpicboxServers(doc([relay()]));
  assert.deepEqual(s, {
    domain: 'epicbox.example.org', state: 'healthy', label: null, operator: 'Example', listing: 'community',
    latencyMs: 480, uptime24h: 0.99, country: 'FI', isDefault: false,
  });
});

test('parse: offline and unstable servers are listed with their state', () => {
  const list = parseEpicboxServers(doc([relay({ endpoint: 'wss://a.example.org', state: 'down', latency_ms: null }), relay({ endpoint: 'wss://b.example.org', state: 'degraded' })]));
  assert.deepEqual(list.map((s) => [s.domain, s.state]), [['b.example.org', 'degraded'], ['a.example.org', 'down']]);
  assert.equal(list[1].latencyMs, null);
});

test('parse: only wss on port 443 (the field holds a domain only), no duplicates, no junk', () => {
  const list = parseEpicboxServers(doc([
    relay({ endpoint: 'ws://plain.example.org:80' }),
    relay({ endpoint: 'wss://port.example.org:8443' }),
    relay({ endpoint: 'https://http.example.org' }),
    relay({ endpoint: 'wss://user@cred.example.org' }),
    relay({ kind: 'node' }),
    relay(), relay(),
    null, 42, 'x',
    relay({ endpoint: 'wss://ok.example.org', state: 'weird', operator: 'x'.repeat(200), listing: 'paid', latency_ms: -5, uptime: { '24h': 3 } }),
  ]));
  assert.deepEqual(list.map((s) => s.domain), ['epicbox.example.org', 'ok.example.org']);
  const ok = list[1];
  assert.equal(ok.state, 'unknown');
  assert.equal(ok.operator, null);
  assert.equal(ok.listing, null);
  assert.equal(ok.latencyMs, null);
  assert.equal(ok.uptime24h, null);
});

test('parse: no epicbox array → []', () => {
  for (const d of [null, 'x', {}, { epicbox: {} }, { epicbox: 'x' }]) assert.deepEqual(parseEpicboxServers(d), []);
});

test('order: the default server first, then online before unstable before offline, official, latency', () => {
  const list = parseEpicboxServers(doc([
    relay({ endpoint: 'wss://slow.example.org', latency_ms: 900 }),
    relay({ endpoint: 'wss://down.example.org', state: 'down', latency_ms: 10 }),
    relay({ endpoint: 'wss://fast.example.org', latency_ms: 100 }),
    relay({ endpoint: 'wss://official.example.org', latency_ms: 950, listing: 'official' }),
    relay({ endpoint: 'wss://epicbox.epiccash.com:443/', state: 'degraded', latency_ms: 4777 }),
  ]));
  assert.deepEqual(list.map((s) => s.domain), ['epicbox.epiccash.com', 'official.example.org', 'fast.example.org', 'slow.example.org', 'down.example.org']);
  assert.equal(list[0].isDefault, true);
});

test('nodeDirectory.parseDirectory carries the servers, also when the chain has no nodes', () => {
  const d = parseDirectory(doc([relay()]), 'mainnet');
  assert.ok(d);
  assert.deepEqual(d.nodes, []);
  assert.equal(d.epicbox[0].domain, 'epicbox.example.org');
  assert.equal(parseDirectory(doc([]), 'mainnet'), null);
  assert.equal(parseDirectory(doc([relay()], { stale: true }), 'mainnet'), null);
  assert.equal(parseDirectory(doc([relay()]), 'floonet'), null, 'the other chain');
});

test('renderer: live list from the directory, checked again', () => {
  const dir = { epicbox: parseEpicboxServers(doc([relay()])).concat([{ domain: 'bad domain' }, null, { domain: 'epicbox.example.org' }]) };
  const res = epicboxServerList(dir, 'mainnet');
  assert.equal(res.live, true);
  assert.deepEqual(res.servers.map((s) => s.domain), ['epicbox.example.org']);
});

test('renderer: no directory → the known servers, status unknown, not live', () => {
  for (const dir of [null, undefined, {}, { epicbox: [] }, { epicbox: 'x' }]) {
    const res = epicboxServerList(dir, 'mainnet');
    assert.equal(res.live, false);
    assert.ok(res.servers.length >= 1);
    assert.equal(res.servers[0].domain, 'epicbox.epiccash.com');
    assert.ok(res.servers.every((s) => s.state === 'unknown' && s.latencyMs === null));
  }
  assert.deepEqual(knownServers('floonet').map((s) => s.domain), ['flooepicbox.btlabs.uk']);
  assert.deepEqual(knownServers('usernet'), []);
});

test('load: asks the main process once, falls back on errors and timeouts, never throws', async () => {
  let asked = [];
  const api = { nodeDirectory: async (chain) => { asked.push(chain); return { nodes: [], epicbox: parseEpicboxServers(doc([relay()])) }; } };
  const res = await loadEpicboxServers(api, 'mainnet');
  assert.deepEqual(asked, ['mainnet']);
  assert.equal(res.live, true);

  const failing = { nodeDirectory: async () => { throw new Error('ipc'); } };
  assert.equal((await loadEpicboxServers(failing, 'mainnet')).live, false);

  const hanging = { nodeDirectory: () => new Promise(() => {}) };
  const t0 = Date.now();
  const late = await loadEpicboxServers(hanging, 'mainnet', 50);
  assert.equal(late.live, false);
  assert.ok(Date.now() - t0 < 1000);

  assert.equal((await loadEpicboxServers(undefined, 'mainnet')).live, false);
  asked = [];
  assert.equal((await loadEpicboxServers(api, 'nonsense')).servers.length, 0);
  assert.deepEqual(asked, [], 'no request for an unknown chain');
});

test('cache: the main process fetches status.json once per minute, not per screen', async () => {
  let calls = 0;
  let t = 0;
  const body = JSON.stringify(doc([relay()]));
  const fetchFn = async () => { calls++; return { status: 200, headers: { get: () => null }, text: async () => body }; };
  const dir = createDirectory({ fetch: fetchFn, now: () => t, ttlMs: 60000 });
  const a = await dir.get('mainnet');
  await dir.get('mainnet');
  t = 59000; await dir.get('mainnet');
  assert.equal(calls, 1);
  assert.equal(epicboxServerList(a, 'mainnet').servers[0].domain, 'epicbox.example.org');
  t = 61000; await dir.get('mainnet');
  assert.equal(calls, 2);
});

test('findServer and cleanDomain', () => {
  const list = knownServers('mainnet');
  assert.equal(findServer(list, '  EPICBOX.epiccash.com ').domain, 'epicbox.epiccash.com');
  assert.equal(findServer(list, 'my.own.server'), null);
  assert.equal(findServer(list, ''), null);
  assert.equal(findServer(null, 'epicbox.epiccash.com'), null);
  assert.equal(cleanDomain('wss://x.org'), '');
  assert.equal(cleanDomain('localhost'), '');
  assert.equal(cleanDomain('a.b-c.org'), 'a.b-c.org');
});
