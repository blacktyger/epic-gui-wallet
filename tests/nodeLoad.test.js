// Tests for src/shared/nodeLoad.js, when the built-in node's "heavy" toast shows: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeLoadWarning } from '../src/shared/nodeLoad.js';

test('switching the built-in node on warns', () => {
  assert.equal(nodeLoadWarning({ internal: false, background: false }, { internal: true, background: false }), true);
  assert.equal(nodeLoadWarning({ internal: false, background: false }, { internal: true, background: true }), true);
});

test('switching background sync on while the built-in node is used warns', () => {
  assert.equal(nodeLoadWarning({ internal: true, background: false }, { internal: true, background: true }), true);
});

test('an external node never warns', () => {
  assert.equal(nodeLoadWarning({ internal: true, background: true }, { internal: false, background: false }), false);
  assert.equal(nodeLoadWarning({ internal: false, background: false }, { internal: false, background: true }), false);
  assert.equal(nodeLoadWarning({ internal: false }, null), false);
});

test('a save that changes neither does not warn again', () => {
  assert.equal(nodeLoadWarning({ internal: true, background: false }, { internal: true, background: false }), false);
  assert.equal(nodeLoadWarning({ internal: true, background: true }, { internal: true, background: true }), false);
  assert.equal(nodeLoadWarning({ internal: true, background: true }, { internal: true, background: false }), false);
});

test('an unknown earlier state counts as external', () => {
  assert.equal(nodeLoadWarning(undefined, { internal: true }), true);
});
