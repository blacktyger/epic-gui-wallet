// The node as one icon in the Modern main views (src/components/modern/nodeBadge.js). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeBadge } from '../src/components/modern/nodeBadge.js';

const pick = (b) => [b.state, b.tone, b.key];

test('online, syncing, behind, offline, not an Epic node, connecting', () => {
  const up = { user_agent: 'MW/Epic 4.1.0', sync_status: 'synced', tip: { height: 5 }, node_behind: 0 };
  assert.deepEqual(pick(nodeBadge(up)), ['online', 'ok', 'node_tip_ok']);
  assert.deepEqual(pick(nodeBadge({ ...up, sync_status: 'Body sync' })), ['syncing', 'warn', 'node_tip_syncing']);
  const behind = nodeBadge({ ...up, node_behind: 120 });
  assert.deepEqual([...pick(behind), behind.n, behind.behind], ['syncing', 'warn', 'node_tip_behind', 120, true]);
  assert.deepEqual(pick(nodeBadge({ error: true })), ['offline', 'risk', 'node_tip_down']);
  assert.deepEqual(pick(nodeBadge({ error: true }, { kind: 'not_epic' })), ['not_epic', 'risk', 'node_tip_not_epic']);
  assert.deepEqual(pick(nodeBadge({}, null)), ['connecting', 'busy', 'node_tip_connecting']);
  //a status without a version still shows once it has a height
  assert.equal(nodeBadge({ sync_status: 'synced', tip: { height: 9 } }).state, 'online');
});

test('no height, peers, version or ms in what the badge gives', () => {
  const b = nodeBadge({ user_agent: 'MW/Epic 4.1.0', sync_status: 'synced', tip: { height: 5 }, connections: 8, response_ms: 40 });
  assert.deepEqual(Object.keys(b).sort(), ['behind', 'icon', 'key', 'n', 'state', 'tone']);
});
