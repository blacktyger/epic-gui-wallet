// Tests for src/shared/nodePoll.js: run with `npm test` (node --test, no extra dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextNodePollDelay, NODE_POLL, NODE_POLL_MAX_BACKOFF } from '../src/shared/nodePoll.js';

test('a remote node is asked every 30 s, every 2 min while the window is hidden', () => {
  assert.equal(nextNodePollDelay({}), 30 * 1000);
  assert.equal(nextNodePollDelay({ hidden: true }), 2 * 60 * 1000);
  //regression: 6.1.5 asked every 10 s, visible or not (6 requests a minute per open wallet)
  assert.ok(nextNodePollDelay({}) >= 3 * 10 * 1000);
});

test('the built-in node keeps the 10 s poll while visible (sync progress, stall check), 1 min hidden', () => {
  assert.equal(nextNodePollDelay({ local: true }), 10 * 1000);
  assert.equal(nextNodePollDelay({ local: true, hidden: true }), 60 * 1000);
});

test('a node that does not answer is asked less and less often, up to 5 min', () => {
  const d = [1, 2, 3, 4, 5, 6, 20].map((failures) => nextNodePollDelay({ failures }));
  assert.deepEqual(d, [30e3, 60e3, 120e3, 240e3, 300e3, 300e3, 300e3]);
  assert.equal(nextNodePollDelay({ hidden: true, failures: 1 }), NODE_POLL.remote.hidden);
  assert.equal(nextNodePollDelay({ hidden: true, failures: 9 }), NODE_POLL_MAX_BACKOFF);
  assert.deepEqual([1, 2, 3, 5, 8].map((failures) => nextNodePollDelay({ local: true, failures })), [10e3, 20e3, 40e3, 160e3, 300e3]);
});

test('an answer resets the backoff; nonsense failure counts are no failures', () => {
  assert.equal(nextNodePollDelay({ failures: 0 }), 30e3);
  assert.equal(nextNodePollDelay({ failures: -3 }), 30e3);
  assert.equal(nextNodePollDelay({ failures: 'x' }), 30e3);
});
