// Tests for src/shared/nodeHealth.js: run with `npm test` (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  directoryReferenceHeight, assessNodeStatus, createBehindTracker, NODE_TIP_TOLERANCE, BEHIND_CONFIRMATIONS,
} from '../src/shared/nodeHealth.js';

const listed = (height, state = 'healthy') => ({ state, height, endpoint: 'https://n' + height + '.example.org' });
const dir = (nodes, tipHeight = null) => ({ chain: 'mainnet', tipHeight, nodes });
const status = (height, sync_status = 'awaiting_peers', connections = 30, extra = {}) => ({
  tip: { height }, connections, sync_status, user_agent: 'MW/Epic 4.1.0-1', ...extra,
});

/* the reference from the node list */

test('reference: the median of the 3 highest healthy nodes', () => {
  assert.equal(directoryReferenceHeight(dir([listed(1000), listed(1002), listed(1001), listed(990)])), 1001);
});

test('reference: one bad entry far ahead does not move it', () => {
  assert.equal(directoryReferenceHeight(dir([listed(9999999), listed(1000), listed(1001), listed(999)])), 1001);
});

test('reference: degraded and down nodes, and missing heights, are left out', () => {
  assert.equal(directoryReferenceHeight(dir([listed(5000, 'degraded'), listed(6000, 'down'), listed(1000), listed(null)])), 1000);
});

test('reference: of two healthy nodes the lower one; one node: its height', () => {
  assert.equal(directoryReferenceHeight(dir([listed(1000), listed(1010)])), 1000);
  assert.equal(directoryReferenceHeight(dir([listed(1000)])), 1000);
});

test('reference: no healthy node with a height: the list\'s network tip, else 0', () => {
  assert.equal(directoryReferenceHeight(dir([listed(5000, 'degraded')], 1234)), 1234);
  assert.equal(directoryReferenceHeight(dir([], null)), 0);
  assert.equal(directoryReferenceHeight(null), 0);
  assert.equal(directoryReferenceHeight({}), 0);
});

/* the status against the reference */

test('awaiting_peers at the tip: no_sync, the reported state kept', () => {
  const s = status(1000);
  const out = assessNodeStatus(s, { referenceHeight: 1000 });
  assert.equal(out.sync_status, 'no_sync');
  assert.equal(out.reported_sync_status, 'awaiting_peers');
  assert.equal(out.behind_blocks, undefined);
  assert.equal(s.sync_status, 'awaiting_peers'); //input unchanged
});

test('within the tolerance (2 behind) or ahead: no_sync', () => {
  assert.equal(NODE_TIP_TOLERANCE, 2);
  assert.equal(assessNodeStatus(status(998), { referenceHeight: 1000 }).sync_status, 'no_sync');
  assert.equal(assessNodeStatus(status(1003), { referenceHeight: 1000 }).sync_status, 'no_sync');
});

test('any sync status at the tip is synced', () => {
  assert.equal(assessNodeStatus(status(1000, 'body_sync'), { referenceHeight: 1000 }).sync_status, 'no_sync');
  const ok = status(1000, 'no_sync');
  assert.equal(assessNodeStatus(ok, { referenceHeight: 1000 }), ok);
});

test('awaiting_peers clearly behind: behind_blocks, sync_status unchanged', () => {
  const out = assessNodeStatus(status(997), { referenceHeight: 1000 });
  assert.equal(out.sync_status, 'awaiting_peers');
  assert.equal(out.behind_blocks, 3);
});

test('no_sync clearly behind: behind_blocks, still no_sync (sending is not stopped)', () => {
  const out = assessNodeStatus(status(500, 'no_sync'), { referenceHeight: 1000 });
  assert.equal(out.sync_status, 'no_sync');
  assert.equal(out.behind_blocks, 500);
});

test('a syncing node behind the tip: as it is (it shows its own progress)', () => {
  for (const st of ['header_sync', 'body_sync', 'txhashset_download', 'syncing']) {
    const s = status(500, st);
    assert.equal(assessNodeStatus(s, { referenceHeight: 1000 }), s);
  }
});

/* no list */

test('no list: awaiting_peers with peers and a tip is usable', () => {
  const out = assessNodeStatus(status(1000), { referenceHeight: 0 });
  assert.equal(out.sync_status, 'no_sync');
  assert.equal(out.reported_sync_status, 'awaiting_peers');
  assert.equal(assessNodeStatus(status(1000)).sync_status, 'no_sync');
});

test('no list: 0 peers, unknown peers or no tip: awaiting_peers', () => {
  assert.equal(assessNodeStatus(status(1000, 'awaiting_peers', 0)).sync_status, 'awaiting_peers');
  assert.equal(assessNodeStatus(status(1000, 'awaiting_peers', null)).sync_status, 'awaiting_peers');
  assert.equal(assessNodeStatus(status(0)).sync_status, 'awaiting_peers');
});

test('no list: other states as they are', () => {
  for (const st of ['no_sync', 'header_sync', 'body_sync']) {
    const s = status(1000, st);
    assert.equal(assessNodeStatus(s), s);
  }
});

test('no status, an error, or no tip: as it is', () => {
  assert.equal(assessNodeStatus(false, { referenceHeight: 1000 }), false);
  assert.equal(assessNodeStatus(null, { referenceHeight: 1000 }), null);
  const err = { error: true };
  assert.equal(assessNodeStatus(err, { referenceHeight: 1000 }), err);
  const noTip = { sync_status: 'awaiting_peers', connections: 5 };
  assert.equal(assessNodeStatus(noTip, { referenceHeight: 1000 }), noTip);
});

/* the debounce */

test('behind: shown from the second check in a row', () => {
  assert.equal(BEHIND_CONFIRMATIONS, 2);
  const t = createBehindTracker();
  assert.equal(t.update(10), 0);
  assert.equal(t.update(12), 12);
  assert.equal(t.update(15), 15);
});

test('behind: one check not behind clears it, and the count starts again', () => {
  const t = createBehindTracker();
  t.update(10);
  t.update(10);
  assert.equal(t.update(0), 0);
  assert.equal(t.update(10), 0);
  assert.equal(t.update(undefined), 0);
  assert.equal(t.update(10), 0);
  assert.equal(t.update(10), 10);
});
