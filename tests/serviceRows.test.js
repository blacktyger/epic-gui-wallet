// The Node and Receiving status rows of the sidebar and the Overview card (src/components/modern/serviceRows.js). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeRow, receivingRow, serviceRows, onionShort, epicboxGlyph, epicboxStateText } from '../src/components/modern/serviceRows.js';

//the key, and its parameters when there are any
const t = (k, a) => (a && Object.keys(a).length ? k + JSON.stringify(a) : k);
const up = { user_agent: 'MW/Epic 4.1.0', sync_status: 'synced', tip: { height: 3100000 }, ready_for_txs: true };
const health = (state, why = '') => ({ state, server: 'epicbox.epicnet.us', why, since: 0 });

test('node: online, the address and height in one line; the reason only when not online', () => {
  const r = nodeRow({ status: up, addr: 'node.example.org', locale: 'en-US' }, t);
  assert.deepEqual([r.state, r.glyph, r.word], ['online', 'ok', 'msg.mynodes.state_online']);
  assert.deepEqual(r.lines, ['node.example.org · 3,100,000']);
  const down = nodeRow({ status: { error: true, reason: 'no reply within 10 s' }, addr: 'node.example.org' }, t);
  assert.deepEqual([down.glyph, down.word], ['down', 'msg.mynodes.state_offline']);
  assert.equal(down.lines.length, 2);
  assert.equal(nodeRow({ status: up, internal: true }, t).lines[0].startsWith('msg.modern.settings.node_builtin'), true);
  //before the first answer
  assert.deepEqual([nodeRow({ status: {} }, t).glyph, nodeRow({ status: {} }, t).word], ['busy', 'msg.modern.eb_connecting']);
});

test('receiving: paused has its own dot and words, never connecting (final 6.1.6 QA bug 1)', () => {
  const r = receivingRow({ health: health('paused', 'node') }, t);
  assert.equal(r.glyph, 'pause');
  assert.equal(r.word, 'msg.modern.eb_paused');
  assert.ok(r.lines[0].includes('msg.modern.eb_paused (msg.modern.eb_why_node)'));
  assert.ok(!JSON.stringify(r).includes('connecting'));
  assert.equal(epicboxGlyph('paused'), 'pause');
  assert.equal(epicboxStateText(health('paused', 'node'), (k) => k), 'msg.modern.eb_paused (msg.modern.eb_why_node)');
});

test('receiving: listening is On, connecting and down keep their words', () => {
  const on = receivingRow({ health: health('listening') }, t);
  assert.deepEqual([on.glyph, on.word], ['ok', 'msg.modern.svc_on']);
  assert.deepEqual(on.lines.slice(1), ['msg.modern.svc_http_off']);
  assert.deepEqual([receivingRow({ health: health('connecting') }, t).glyph, receivingRow({ health: health('connecting') }, t).word], ['sync', 'msg.modern.eb_connecting']);
  const down = receivingRow({ health: health('down', 'no_answer') }, t);
  assert.deepEqual([down.glyph, down.word], ['down', 'msg.modern.eb_down']);
  //off, HTTP on: HTTP only
  const http = receivingRow({ health: health('off'), httpListener: { state: 'on', port: 3415, reason: '' } }, t);
  assert.deepEqual([http.glyph, http.word], ['ok', 'msg.modern.svc_http_only_word']);
  assert.deepEqual(http.lines, ['msg.modern.svc_epicbox_off', 'msg.modern.svc_http_on']);
  //the listener starting while Epicbox is still off
  assert.deepEqual([receivingRow({ health: health('off'), listenerStarting: true }, t).word], ['msg.modern.eb_connecting']);
});

test('receiving: a Tor line only while Tor is on', () => {
  assert.equal(receivingRow({ health: health('listening'), tor: { enabled: false } }, t).lines.length, 2);
  const tor = receivingRow({ health: health('listening'), tor: { enabled: true, state: 'ready' } }, t);
  assert.equal(tor.lines.length, 3);
  assert.ok(tor.lines[2].includes('msg.modern.settings.tor.card_ready'));
});

const rows = (o) => Object.fromEntries(serviceRows({ node: nodeRow({ status: up, addr: 'node.example.org', locale: 'en-US' }, t), health: health('listening'), ...o }, t).map((r) => [r.key, r]));

test('service rows: Node and Epicbox always, the domain only, the full host in the tip', () => {
  const r = rows({});
  assert.deepEqual(Object.keys(r), ['node', 'epicbox']);
  assert.equal(r.node.icon, 'svc-node');
  assert.equal(r.node.value, 'msg.modern.svc_synced · 3,100,000');
  assert.equal(r.epicbox.value, 'epicnet.us');
  assert.ok(r.epicbox.tip[0].includes('epicbox.epicnet.us'));
  assert.equal(r.epicbox.err, false);
  const down = rows({ health: health('down', 'no_answer') }).epicbox;
  assert.equal(down.value, 'epicnet.us · msg.modern.svc_no_answer');
  assert.deepEqual([down.glyph, down.err], ['down', true]);
});

test('service rows: HTTP only when offered, Tor only when offered; the short onion and the states', () => {
  assert.deepEqual(Object.keys(rows({ direct: { on: false, http: true, tor: true } })), ['node', 'epicbox']);
  const direct = { on: true, http: true, tor: true, public: false };
  const onion = 'mk7ca5' + 'x'.repeat(46) + 'luyd';
  const r = rows({ direct, httpListener: { state: 'on', port: 3415, reason: '' }, httpAddr: 'http://127.0.0.1:3415', tor: { enabled: true, state: 'ready', onion: onion + '.onion' } });
  assert.equal(r.http.value, '127.0.0.1:3415');
  assert.equal(r.tor.value, 'mk7ca5…luyd.onion');
  assert.equal(onionShort(onion + '.onion'), 'mk7ca5…luyd.onion');
  const s = rows({ direct, tor: { enabled: true, state: 'starting', progress: 62 } }).tor;
  assert.deepEqual([s.glyph, s.value], ['busy', 'msg.modern.svc_tor_starting{"n":62}']);
  const f = rows({ direct, tor: { enabled: true, state: 'failed', error: 'create' } }).tor;
  assert.deepEqual([f.glyph, f.err], ['down', true]);
});
