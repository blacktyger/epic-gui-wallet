// Tests for src/shared/walletSync.js: run with `npm test` (node --test, no extra dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  walletSyncAfterSummary, needsNodeRefresh, nextRefreshDelay, nodeStatusKnown,
  REFRESH_INTERVAL, REFRESH_RETRY_INTERVAL, REFRESH_HIDDEN_INTERVAL, NODE_RETRY_MAX, NODE_REFRESH_MAX_AGE,
  refreshFromNode,
} from '../src/shared/walletSync.js';

//store nodeStatus as App.vue commits it
const synced = { sync_status: 'synced', tip: { height: 100 } };
const syncing = { sync_status: 'Body sync', tip: { height: 50 } };
const unreachable = { error: true };
const checking = {}; //App.nodeStart while it checks the node again (Settings / Setup Assistant saved)

test('a refresh from the node marks the balance synced', () => {
  assert.equal(walletSyncAfterSummary('local', true, true, synced), 'synced');
  assert.equal(walletSyncAfterSummary('loading', true, true, synced), 'synced');
});

test('regression: saving Settings does not turn a synced balance into "could not update from the node"', () => {
  //the save resets the node status, so the refresh it starts reads the wallet without the node
  assert.equal(nodeStatusKnown(checking), false);
  const after = walletSyncAfterSummary('synced', false, false, checking);
  assert.equal(after, 'synced');
});

test('the wallet could not use a synced node: last known balance, retried soon', () => {
  const after = walletSyncAfterSummary('synced', false, true, synced);
  assert.equal(after, 'local');
  assert.equal(needsNodeRefresh(after, synced), true);
  assert.equal(nextRefreshDelay({ walletSync: after, node: synced, failed: false, pendingTx: false }), REFRESH_RETRY_INTERVAL);
});

test('a local read while the node is syncing or unreachable is the last known balance', () => {
  assert.equal(walletSyncAfterSummary('synced', false, false, syncing), 'local');
  assert.equal(walletSyncAfterSummary('synced', false, false, unreachable), 'local');
  assert.equal(walletSyncAfterSummary('loading', false, false, checking), 'local');
  //nothing to gain from retrying soon: the node status poll refreshes once the node has synced
  assert.equal(needsNodeRefresh('local', syncing), false);
  assert.equal(needsNodeRefresh('local', unreachable), false);
  assert.equal(nextRefreshDelay({ walletSync: 'local', node: syncing, failed: false, pendingTx: false }), REFRESH_INTERVAL);
});

test('regression: a refresh the wallet did not answer is retried soon, not left for good', () => {
  assert.equal(nextRefreshDelay({ walletSync: 'synced', node: synced, failed: true, pendingTx: false }), REFRESH_RETRY_INTERVAL);
  assert.equal(nextRefreshDelay({ walletSync: 'error', node: synced, failed: true, pendingTx: false }), REFRESH_RETRY_INTERVAL);
});

test('normal cadence: a minute, faster while a transaction is pending', () => {
  assert.equal(nextRefreshDelay({ walletSync: 'synced', node: synced, failed: false, pendingTx: false }), REFRESH_INTERVAL);
  assert.equal(nextRefreshDelay({ walletSync: 'synced', node: synced, failed: false, pendingTx: true }), REFRESH_RETRY_INTERVAL);
});

test('the 15 s retries of a wallet the node could not update back off to every 2 min', () => {
  const d = [0, 1, 2, 3, 4, 5, 30].map((nodeRetries) =>
    nextRefreshDelay({ walletSync: 'local', node: synced, failed: false, pendingTx: false, nodeRetries }));
  assert.deepEqual(d, [15e3, 15e3, 30e3, 60e3, 120e3, NODE_RETRY_MAX, NODE_RETRY_MAX]);
  //a pending transaction does not undo the backoff: each of these retries asks the node
  assert.equal(nextRefreshDelay({ walletSync: 'local', node: synced, failed: false, pendingTx: true, nodeRetries: 4 }), 120e3);
});

test('a hidden window refreshes every 5 min (a new block still refreshes it at once)', () => {
  assert.equal(nextRefreshDelay({ walletSync: 'synced', node: synced, failed: false, pendingTx: false, hidden: true }), REFRESH_HIDDEN_INTERVAL);
  assert.equal(REFRESH_HIDDEN_INTERVAL, 5 * 60 * 1000);
  //a wallet API that does not answer is local: still retried soon
  assert.equal(nextRefreshDelay({ walletSync: 'synced', node: synced, failed: true, pendingTx: false, hidden: true }), REFRESH_RETRY_INTERVAL);
});

test('the node is asked once per tip: a refresh at the same tip reads the wallet only', () => {
  const now = 1_000_000;
  //nothing asked yet, or a new block: ask the node
  assert.equal(refreshFromNode({ node: synced, last: null, now }), true);
  assert.equal(refreshFromNode({ node: synced, last: { tip: 99, at: now - 5000 }, now }), true);
  //regression: 6.1.5 asked the node on the 60 s timer and on each new block, and every 15 s with a
  //pending transaction: each one a full get_outputs of the wallet, mostly at an unchanged tip
  assert.equal(refreshFromNode({ node: synced, last: { tip: 100, at: now - 5000 }, now }), false);
  assert.equal(refreshFromNode({ node: synced, last: { tip: 100, at: now - NODE_REFRESH_MAX_AGE + 1 }, now }), false);
  //the same tip for 10 min, or the user asked: ask anyway
  assert.equal(refreshFromNode({ node: synced, last: { tip: 100, at: now - NODE_REFRESH_MAX_AGE }, now }), true);
  assert.equal(refreshFromNode({ node: synced, last: { tip: 100, at: now - 5000 }, now, force: true }), true);
});

test('a node that is not synced, unreachable or being checked again is never asked', () => {
  for (const node of [syncing, unreachable, checking, null, undefined]) {
    assert.equal(refreshFromNode({ node, last: null }), false);
    assert.equal(refreshFromNode({ node, last: null, force: true }), false);
  }
  //a synced node without a tip height (not seen yet): asked
  assert.equal(refreshFromNode({ node: { sync_status: 'synced' }, last: { tip: 0, at: Date.now() } }), true);
});
