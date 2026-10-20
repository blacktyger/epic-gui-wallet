// Tests for My nodes: src/shared/myNodes.js (the list), the settings.json key (shared/settingsStore.js)
// and the address normalisation they use (shared/nodeAddress.js). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nodeCheckAddress, nodeAddressKey } from '../src/shared/nodeAddress.js';
import { addMyNode, updateMyNode, removeMyNode, findMyNode, cleanMyNodeList, normalizeMyNodes, cleanNodeLabel, MY_NODES_MAX, NODE_LABEL_MAX } from '../src/shared/myNodes.js';
import { createSettingsStore, SCHEMA } from '../src/shared/settingsStore.js';

const NOW = () => '2026-10-20T12:00:00.000Z';

test('nodeCheckAddress: what the field would save, only when it is a finished http(s) address', () => {
  assert.equal(nodeCheckAddress('node.example.com'), 'https://node.example.com');
  assert.equal(nodeCheckAddress(' 192.168.1.5:3413/ '), 'http://192.168.1.5:3413');
  assert.equal(nodeCheckAddress('https://node.example.com:3413//'), 'https://node.example.com:3413');
  assert.equal(nodeCheckAddress('http://localhost:3413'), 'http://localhost:3413');
  assert.equal(nodeCheckAddress('http://[::1]:3413'), 'http://[::1]:3413');
  //half typed, or not something to ask
  for (const s of ['', 'h', 'http://', 'https://node', 'node.epic', 'node.epiccash.c', '192.168.1', '1.2.3.400',
    'ftp://node.example.com', 'https://user:pw@node.example.com', 'https://node.example.com/?x=1', 'https://node.example.com/#a',
    'https://my node.example.com', 'x'.repeat(301) + '.com']) {
    assert.equal(nodeCheckAddress(s), s === 'node.epic' ? 'https://node.epic' : '', JSON.stringify(s));
  }
});

test('nodeAddressKey: one key for every way of writing the same node', () => {
  const k = nodeAddressKey('https://node.example.com');
  for (const s of ['node.example.com', 'node.example.com/', 'HTTPS://Node.Example.COM', 'https://node.example.com:443', ' https://node.example.com// ']) {
    assert.equal(nodeAddressKey(s), k, s);
  }
  assert.notEqual(nodeAddressKey('http://node.example.com'), k, 'another scheme is another address');
  assert.notEqual(nodeAddressKey('https://node.example.com:3413'), k, 'another port is another address');
  assert.equal(nodeAddressKey('not a node'), '');
});

test('add: the address as the field saves it, an optional label, refused when it repeats one', () => {
  let r = addMyNode([], { address: 'node.example.com:3413/', label: '  Home  ' }, NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(r.list, [{ address: 'https://node.example.com:3413', label: 'Home', addedAt: NOW() }]);
  r = addMyNode(r.list, { address: '192.168.1.5:3413' }, NOW);
  assert.deepEqual(r.entry, { address: 'http://192.168.1.5:3413', label: '', addedAt: NOW() });
  const list = r.list;

  const dup = addMyNode(list, { address: 'HTTPS://NODE.example.com:3413/', label: 'Again' }, NOW);
  assert.equal(dup.ok, false);
  assert.equal(dup.error, 'duplicate');
  assert.equal(dup.existing.label, 'Home');
  assert.deepEqual(addMyNode(list, { address: 'http://' }, NOW), { ok: false, error: 'invalid' });
  assert.deepEqual(addMyNode(list, { address: 'https://u:p@node.example.com' }, NOW), { ok: false, error: 'invalid' });
});

test('a one-word host (a home server) can be saved and checked; while typing it waits for the port', () => {
  assert.equal(addMyNode([], { address: 'http://umbrel:3413' }, NOW).ok, true);
  assert.equal(nodeAddressKey('HTTP://Umbrel:3413/'), 'http://umbrel:3413');
  assert.equal(nodeCheckAddress('http://umbrel'), '', 'half typed?');
  assert.equal(nodeCheckAddress('http://umbrel:3413'), 'http://umbrel:3413');
  assert.equal(nodeCheckAddress('http://umbrel', { complete: false }), 'http://umbrel');
});

test('update keeps what a later version added to the entry', () => {
  const r = updateMyNode([{ address: 'https://a.example.com', label: 'A', addedAt: 'x', pinned: true }], 'https://a.example.com', { address: 'https://a.example.com', label: 'B' });
  assert.deepEqual(r.entry, { address: 'https://a.example.com', label: 'B', addedAt: 'x', pinned: true });
});

test('add: an offline or unknown node can be saved (no network here), the list has a limit', () => {
  let list = [];
  for (let i = 0; i < MY_NODES_MAX; i++) list = addMyNode(list, { address: 'https://n' + i + '.example.com' }, NOW).list;
  assert.equal(list.length, MY_NODES_MAX);
  assert.deepEqual(addMyNode(list, { address: 'https://one-more.example.com' }, NOW), { ok: false, error: 'full' });
});

test('update: in place, keeps addedAt; the same address with a new label is fine, another entry\'s address is not', () => {
  const list = [
    { address: 'https://a.example.com', label: 'A', addedAt: '2026-01-01' },
    { address: 'https://b.example.com', label: 'B', addedAt: '2026-01-02' },
  ];
  let r = updateMyNode(list, 'a.example.com/', { address: 'https://a.example.com/', label: 'Alpha' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.list[0], { address: 'https://a.example.com', label: 'Alpha', addedAt: '2026-01-01' });
  r = updateMyNode(list, 'https://a.example.com', { address: 'https://c.example.com:3413', label: 'C' });
  assert.deepEqual(r.list.map(e => e.address), ['https://c.example.com:3413', 'https://b.example.com']);
  r = updateMyNode(list, 'https://a.example.com', { address: 'B.example.com', label: 'x' });
  assert.equal(r.error, 'duplicate');
  assert.equal(r.existing.label, 'B');
  assert.equal(updateMyNode(list, 'https://zzz.example.com', { address: 'https://d.example.com' }).error, 'missing');
  assert.equal(updateMyNode(list, 'https://a.example.com', { address: 'http://' }).error, 'invalid');
});

test('remove and find: by any spelling of the address', () => {
  const list = [{ address: 'https://a.example.com', label: '', addedAt: '' }, { address: 'http://10.0.0.2:3413', label: 'LAN', addedAt: '' }];
  assert.equal(findMyNode(list, '10.0.0.2:3413/').label, 'LAN');
  assert.equal(findMyNode(list, 'https://b.example.com'), null);
  assert.deepEqual(removeMyNode(list, 'HTTPS://A.example.com/').list.map(e => e.label), ['LAN']);
  assert.deepEqual(removeMyNode(list, 'https://b.example.com'), { ok: false, error: 'missing' });
});

test('labels: trimmed, controls and direction overrides dropped, at most NODE_LABEL_MAX code points', () => {
  assert.equal(cleanNodeLabel(' Home\tnode‮ '), 'Home node');
  assert.equal(cleanNodeLabel('🙂'.repeat(NODE_LABEL_MAX + 5)), '🙂'.repeat(NODE_LABEL_MAX));
  assert.equal(cleanNodeLabel(42), '');
});

test('a stored list read back: broken entries and repeats dropped, what a later version adds kept', () => {
  const raw = {
    mainnet: [
      { address: 'https://a.example.com', label: 'A', addedAt: 'x' },
      { address: 'https://A.example.com/', label: 'repeat' },
      { address: 'javascript:alert(1)', label: 'bad' },
      'not an object',
      { label: 'no address' },
      { address: 'https://b.example.com:3413', label: { no: 1 }, pinned: true },
    ],
    floonet: 'not a list',
    marsnet: [{ address: 'https://m.example.com' }],
  };
  assert.deepEqual(normalizeMyNodes(raw, ['mainnet', 'floonet', 'usernet']), {
    mainnet: [
      { address: 'https://a.example.com', label: 'A', addedAt: 'x' },
      { address: 'https://b.example.com:3413', label: '', addedAt: '', pinned: true },
    ],
    marsnet: [{ address: 'https://m.example.com' }],
  });
  assert.deepEqual(normalizeMyNodes(null, ['mainnet']), {});
  assert.deepEqual(normalizeMyNodes([1, 2], ['mainnet']), {});
  assert.equal(cleanMyNodeList(Array.from({ length: 80 }, (_, i) => ({ address: 'https://n' + i + '.example.com' }))).length, MY_NODES_MAX);
});

/* settings.json */
function tmpRoot() {
  return fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'mynodes-'));
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('settings: a 6.1.x file without myNodes loads, gets no key by reading, and keeps schema 1', () => {
  const root = tmpRoot();
  const file = path.join(root, 'settings.json');
  const old = { schema: 1, app: { ui: 'classic', theme: 'dark', scale: 100, locale: 'pl' }, legacy: {}, node: {}, defaultWallet: '', nextId: 1, wallets: [], futureKey: { a: 1 } };
  fs.writeFileSync(file, JSON.stringify(old));
  const s = createSettingsStore({ fs, pathMod: path, file, now: NOW }).load();
  assert.equal(s.readOnly, false);
  assert.deepEqual(s.myNodes('mainnet'), []);
  assert.deepEqual(readJson(file), old, 'reading changes nothing');
  assert.equal(SCHEMA, 1, 'no schema bump: an older 6.1.x would refuse a newer schema (read only)');

  assert.equal(s.addMyNode('mainnet', { address: 'node.example.com:3413', label: 'Home' }).ok, true);
  const saved = readJson(file);
  assert.equal(saved.schema, 1);
  assert.deepEqual(saved.myNodes, { mainnet: [{ address: 'https://node.example.com:3413', label: 'Home', addedAt: NOW() }] });
  assert.deepEqual(saved.futureKey, { a: 1 }, 'keys this version does not know are kept');
  assert.equal(saved.app.locale, 'pl');
  fs.rmSync(root, { recursive: true, force: true });
});

test('settings: per network, add / update / remove saved and read back; duplicates refused', () => {
  const root = tmpRoot();
  const file = path.join(root, 'settings.json');
  const s = createSettingsStore({ fs, pathMod: path, file, now: NOW }).load();
  assert.equal(s.addMyNode('mainnet', { address: 'https://a.example.com' }).ok, true);
  assert.equal(s.addMyNode('floonet', { address: 'http://127.0.0.1:13413', label: 'test' }).ok, true);
  assert.equal(s.addMyNode('mainnet', { address: 'A.EXAMPLE.COM/' }).error, 'duplicate');
  assert.equal(s.addMyNode('marsnet', { address: 'https://m.example.com' }).error, 'invalid');
  assert.equal(s.updateMyNode('mainnet', 'https://a.example.com', { address: 'https://a.example.com', label: 'Alpha' }).ok, true);

  let r = createSettingsStore({ fs, pathMod: path, file }).load();
  assert.deepEqual(r.myNodes('mainnet').map(e => [e.address, e.label]), [['https://a.example.com', 'Alpha']]);
  assert.deepEqual(r.myNodes('floonet').map(e => e.label), ['test']);
  assert.deepEqual(r.myNodes('usernet'), []);
  //copies: changing one changes nothing stored
  r.myNodes('mainnet')[0].label = 'changed';
  assert.equal(r.myNodes('mainnet')[0].label, 'Alpha');

  assert.equal(r.removeMyNode('mainnet', 'a.example.com').ok, true);
  assert.equal(r.removeMyNode('mainnet', 'a.example.com').error, 'missing');
  const saved = readJson(file);
  assert.equal('mainnet' in saved.myNodes, false, 'an emptied network is dropped');
  assert.equal(saved.myNodes.floonet.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('settings: a failed save changes nothing, also in memory; a read-only file is never written', () => {
  const root = tmpRoot();
  const file = path.join(root, 'settings.json');
  const s = createSettingsStore({ fs, pathMod: path, file, now: NOW }).load();
  s.addMyNode('mainnet', { address: 'https://a.example.com' });
  const failing = { ...fs, writeFileSync: () => { const e = new Error('disk full'); e.code = 'ENOSPC'; throw e; } };
  const f = createSettingsStore({ fs: failing, pathMod: path, file, now: NOW }).load();
  assert.deepEqual(f.addMyNode('mainnet', { address: 'https://b.example.com' }), { ok: false, error: 'not_saved' });
  assert.deepEqual(f.myNodes('mainnet').map(e => e.address), ['https://a.example.com']);
  assert.deepEqual(f.removeMyNode('mainnet', 'https://a.example.com'), { ok: false, error: 'not_saved' });
  assert.equal(f.myNodes('mainnet').length, 1);

  fs.writeFileSync(file, '{ broken');
  const ro = createSettingsStore({ fs, pathMod: path, file }).load();
  assert.equal(ro.readOnly, true);
  assert.deepEqual(ro.addMyNode('mainnet', { address: 'https://c.example.com' }), { ok: false, error: 'not_saved' });
  assert.equal(fs.readFileSync(file, 'utf8'), '{ broken');
  fs.rmSync(root, { recursive: true, force: true });
});

test('settings: a hand-edited myNodes with junk loads, junk dropped at the next save', () => {
  const root = tmpRoot();
  const file = path.join(root, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ schema: 1, wallets: [], myNodes: { mainnet: [{ address: 'https://ok.example.com' }, { address: 'file:///etc/passwd' }], floonet: 7 } }));
  const s = createSettingsStore({ fs, pathMod: path, file, now: NOW }).load();
  assert.equal(s.readOnly, false);
  assert.deepEqual(s.myNodes('mainnet').map(e => e.address), ['https://ok.example.com']);
  s.addMyNode('mainnet', { address: 'https://two.example.com' });
  assert.deepEqual(readJson(file).myNodes, { mainnet: [
    { address: 'https://ok.example.com', label: '', addedAt: '' },
    { address: 'https://two.example.com', label: '', addedAt: NOW() },
  ] });
  fs.rmSync(root, { recursive: true, force: true });
});
