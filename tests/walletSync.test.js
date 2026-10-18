// Tests for src/shared/walletSync.js: run with `npm test` (node --test, no extra dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  walletSyncAfterSummary, needsNodeRefresh, nextRefreshDelay, nodeStatusKnown,
  REFRESH_INTERVAL, REFRESH_RETRY_INTERVAL,
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
