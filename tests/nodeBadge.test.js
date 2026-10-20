// The node as one icon in the Modern main views (src/components/modern/nodeBadge.js). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeBadge, nodeBadgeText, failWhy } from '../src/components/modern/nodeBadge.js';

const pick = (b) => [b.state, b.tone, b.key];
const up = { user_agent: 'MW/Epic 4.1.0', sync_status: 'synced', tip: { height: 5 } };

test('three states from ready_for_txs: green ready, yellow not ready, red no answer', () => {
  assert.deepEqual(pick(nodeBadge({ ...up, ready_for_txs: true })), ['online', 'ok', 'node_tip_ok']);
  assert.deepEqual(pick(nodeBadge({ ...up, sync_status: 'Body sync', ready_for_txs: false })), ['syncing', 'warn', 'node_tip_syncing']);
  //ready_for_txs decides, however far behind the height is (that is in Settings › Node only)
  assert.deepEqual(pick(nodeBadge({ ...up, ready_for_txs: true, node_behind: 120 })), ['online', 'ok', 'node_tip_ok']);
  assert.equal(nodeBadge({ ...up, ready_for_txs: false }).behind, true, 'Switch node offered while not ready');
  //an older node without ready_for_txs: the sync state its failover gave
  assert.equal(nodeBadge(up).state, 'online');
  assert.equal(nodeBadge({ ...up, sync_status: 'Header sync' }).state, 'syncing');
  assert.deepEqual(pick(nodeBadge({}, null)), ['connecting', 'busy', 'node_tip_connecting']);
});

test('red: any connection problem, with a short reason', () => {
  const r = (status, problem) => { const b = nodeBadge(status, problem); return [b.state, b.tone, b.key, b.why, b.code]; };
  assert.deepEqual(r({ error: true, reason: 'no reply within 10 s' }), ['offline', 'risk', 'node_tip_down', 'node_why_timeout', '']);
  assert.deepEqual(r({ error: true, reason: 'not reachable' }), ['offline', 'risk', 'node_tip_down', 'node_why_unreachable', '']);
  assert.deepEqual(r({ error: true, reason: 'status: HTTP 502' }), ['offline', 'risk', 'node_tip_down', 'node_why_http', '502']);
  assert.deepEqual(r({ error: true, reason: 'redirects elsewhere' }), ['offline', 'risk', 'node_tip_down', 'node_why_redirect', '']);
  assert.deepEqual(r({ error: true }, { kind: 'not_epic' }), ['offline', 'risk', 'node_tip_down', 'node_why_not_epic', '']);
  assert.deepEqual(r({ error: true }, { kind: 'too_old' }), ['offline', 'risk', 'node_tip_down', 'node_why_old', '']);
  assert.deepEqual(failWhy(''), ['node_why_unreachable', '']);
});

test('the tooltip text: the state, and for red ": <reason>"', () => {
  const t = (k, p) => k + (p && p.code ? '(' + p.code + ')' : '');
  assert.equal(nodeBadgeText(nodeBadge({ ...up, ready_for_txs: true }), t), 'msg.modern.node_tip_ok');
  assert.equal(nodeBadgeText(nodeBadge({ error: true, reason: 'HTTP 403' }), t), 'msg.modern.node_tip_down: msg.modern.node_why_http(403)');
});

test('no height, peers, version or ms in what the badge gives', () => {
  const b = nodeBadge({ ...up, ready_for_txs: true, connections: 8, response_ms: 40 });
  assert.deepEqual(Object.keys(b).sort(), ['behind', 'code', 'icon', 'key', 'state', 'tone', 'why']);
});
