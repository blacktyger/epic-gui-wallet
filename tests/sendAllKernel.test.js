// Tests for src/shared/sendAllKernel.js and the send-all case of txConfirmationState (QA T03). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walletEmpty, needsKernelCheck, kernelsDue, minHeightFor, kernelHeight, fetchKernelHeight, KERNEL_RECHECK_MS } from '../src/shared/sendAllKernel.js';
import { txConfirmationState, MIN_CONFIRMATIONS } from '../src/shared/confirmations.js';

const EXCESS = '09' + 'ab'.repeat(32);
const now = Date.parse('2026-10-20T10:00:00Z');
const sendAll = (o) => Object.assign({ id: 7, tx_type: 'TxSentMempool', confirmed: false, kernel_excess: EXCESS, creation_ts: '2026-10-20T09:30:00Z' }, o);
//the send-all's inputs, as epic-wallet lists them before and after it sees them spent
const locked = [{ status: 'Locked', tx_log_entry: 3, height: 100 }];
const spent = [];

test('the wallet is empty when nothing is spendable or on its way (locked inputs of the send don\'t count)', () => {
  assert.equal(walletEmpty([]), true);
  assert.equal(walletEmpty(undefined), true);
  assert.equal(walletEmpty(locked), true);
  assert.equal(walletEmpty([{ status: 'Unspent', tx_log_entry: 1 }]), false);
  assert.equal(walletEmpty([{ status: 'Unconfirmed', tx_log_entry: 9 }]), false);
});

test('a posted send-all with a kernel, no change and an empty wallet is looked up', () => {
  assert.equal(needsKernelCheck(sendAll(), spent), true);
  assert.equal(needsKernelCheck(sendAll(), locked), true);
});

test('never for a send with change, or while the wallet still holds coins', () => {
  //its change output (tx_log_entry 7), waiting or mined: epic-wallet confirms it by that output
  assert.equal(needsKernelCheck(sendAll(), [{ status: 'Unconfirmed', tx_log_entry: 7 }]), false);
  assert.equal(needsKernelCheck(sendAll(), [{ status: 'Unspent', tx_log_entry: 7, height: 120 }]), false);
  //no change of its own, but other coins left: not the send-all case
  assert.equal(needsKernelCheck(sendAll(), [{ status: 'Unspent', tx_log_entry: 2 }]), false);
  assert.equal(needsKernelCheck(sendAll(), [{ status: 'Unconfirmed', tx_log_entry: 8 }]), false);
});

test('never for other txs: confirmed, not posted, received, cancelled, or without a kernel', () => {
  assert.equal(needsKernelCheck(sendAll({ confirmed: true }), spent), false);
  assert.equal(needsKernelCheck(sendAll({ tx_type: 'TxSent', confirmed: true }), spent), false);
  assert.equal(needsKernelCheck(sendAll({ tx_type: 'TxSentCreated' }), spent), false);
  assert.equal(needsKernelCheck(sendAll({ tx_type: 'TxReceived' }), spent), false);
  assert.equal(needsKernelCheck(sendAll({ tx_type: 'TxSentCancelled' }), spent), false);
  assert.equal(needsKernelCheck(sendAll({ kernel_excess: null }), spent), false);
  assert.equal(needsKernelCheck(sendAll({ kernel_excess: 'not hex' }), spent), false);
});

test('looked up at most once a minute per tx, and no more once found', () => {
  const txs = [sendAll(), sendAll({ id: 8 })];
  assert.deepEqual(kernelsDue(txs, spent, { now }).map(t => t.id), [7, 8]);
  assert.deepEqual(kernelsDue(txs, spent, { checked: { 7: now - 10000 }, now }).map(t => t.id), [8]);
  assert.deepEqual(kernelsDue(txs, spent, { checked: { 7: now - KERNEL_RECHECK_MS }, now }).map(t => t.id), [7, 8]);
  assert.deepEqual(kernelsDue(txs, spent, { found: { 8: 3761700 }, now }).map(t => t.id), [7]);
});

test('the search starts a day before the send, counted back from the tip', () => {
  //30 minutes ago: 30 blocks, then 1440 more
  assert.equal(minHeightFor(sendAll(), 3761730, now), 3761730 - 30 - 1440);
  assert.equal(minHeightFor(sendAll(), 0, now), null);
  assert.equal(minHeightFor(sendAll({ creation_ts: 'x' }), 3761730, now), null);
  assert.equal(minHeightFor(sendAll(), 100, now), 0);
});

test('get_kernel replies: the block height, 0 when not in a block, null when there is no answer', () => {
  assert.equal(kernelHeight({ result: { Ok: { height: 3761700, mmr_index: 8214574, tx_kernel: {} } } }), 3761700);
  assert.equal(kernelHeight({ result: { Err: 'NotFound' } }), 0);
  assert.equal(kernelHeight({ result: { Err: 'Internal' } }), null);
  assert.equal(kernelHeight({ error: { code: -32601 } }), null);
  assert.equal(kernelHeight(null), null);
});

test('fetchKernelHeight asks /v2/foreign get_kernel with the excess and the min height; errors keep it waiting', async () => {
  let req;
  const ok = async (url, opts) => { req = { url, ...opts }; return { ok: true, json: async () => ({ result: { Ok: { height: 42 } } }) }; };
  assert.equal(await fetchKernelHeight('https://node.epiccash.com:3413/', EXCESS, 100, { fetch: ok }), 42);
  assert.equal(req.url, 'https://node.epiccash.com:3413/v2/foreign');
  assert.deepEqual(JSON.parse(req.body), { jsonrpc: '2.0', id: 1, method: 'get_kernel', params: [EXCESS, 100, null] });
  assert.equal(await fetchKernelHeight('https://n', EXCESS, 1, { fetch: async () => ({ ok: false, status: 502 }) }), null);
  assert.equal(await fetchKernelHeight('https://n', EXCESS, 1, { fetch: async () => { throw new TypeError('Failed to fetch'); } }), null);
});

test('the status: a send-all in a block shows confirming, then confirmed, by the kernel\'s height', () => {
  const tx = sendAll({ status: 'unconfirmed' });
  //not found (or the node didn't answer): still waiting
  assert.deepEqual(txConfirmationState(tx, {}, 1000, {}), { state: 'waiting', confirmations: null });
  assert.deepEqual(txConfirmationState(tx, {}, 1000), { state: 'waiting', confirmations: null });
  //in block 999, tip 1000: 2 confirmations
  assert.deepEqual(txConfirmationState(tx, {}, 1000, { 7: 999 }), { state: 'confirming', confirmations: 2 });
  assert.deepEqual(txConfirmationState(tx, {}, 1000, { 7: 1000 - MIN_CONFIRMATIONS + 1 }), { state: 'confirmed', confirmations: MIN_CONFIRMATIONS });
  //another tx's kernel doesn't count
  assert.deepEqual(txConfirmationState(tx, {}, 1000, { 8: 900 }), { state: 'waiting', confirmations: null });
  //a cancelled tx stays cancelled
  assert.equal(txConfirmationState(sendAll({ status: 'cancelled' }), {}, 1000, { 7: 900 }).state, 'cancelled');
});
