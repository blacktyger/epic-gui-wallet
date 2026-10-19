// Tests for src/shared/txWaiting.js (npm test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitingForReply, REPLY_WAIT_MS } from '../src/shared/txWaiting.js';

const now = Date.parse('2026-10-19T10:00:00Z');
const ago = (ms) => new Date(now - ms).toISOString();
const sent = (o) => Object.assign({ tx_type: 'TxSent', confirmed: false, kernel_excess: null, creation_ts: ago(REPLY_WAIT_MS + 1000) }, o);

test('a send without the reply for a few minutes is waiting for the reply', () => {
  assert.equal(waitingForReply(sent({}), now), true);
  assert.equal(waitingForReply(sent({ tx_type: 'TxSentCreated' }), now), true);
});

test('not before a few minutes, not once finalized, confirmed, cancelled, received or a file send', () => {
  assert.equal(waitingForReply(sent({ creation_ts: ago(60 * 1000) }), now), false);
  assert.equal(waitingForReply(sent({ kernel_excess: '08ab' }), now), false);
  assert.equal(waitingForReply(sent({ confirmed: true }), now), false);
  assert.equal(waitingForReply(sent({ tx_type: 'TxSentCancelled' }), now), false);
  assert.equal(waitingForReply(sent({ tx_type: 'TxSentMempool' }), now), false);
  assert.equal(waitingForReply(sent({ tx_type: 'TxReceived' }), now), false);
  assert.equal(waitingForReply(sent({ address: { type: 'file' } }), now), false);
  assert.equal(waitingForReply(sent({ creation_ts: 'garbage' }), now), false);
  assert.equal(waitingForReply(null, now), false);
});
