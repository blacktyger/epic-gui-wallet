// Tests for src/shared/nodeLoad.js, when the "heavy action" toast shows: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeLoadWarning, savedNode } from '../src/shared/nodeLoad.js';

test('a heavy action with the built-in node warns', () => {
  assert.equal(nodeLoadWarning('check', { internal: true }), true);
  assert.equal(nodeLoadWarning('restore', { internal: true, address: 'http://127.0.0.1:3413' }), true);
});

test('a heavy action with a node on this computer warns', () => {
  assert.equal(nodeLoadWarning('check', { internal: false, address: 'http://localhost:3413' }), true);
});

test('an external node never warns', () => {
  assert.equal(nodeLoadWarning('check', { internal: false, address: 'https://node.example.org:3413' }), false);
  assert.equal(nodeLoadWarning('restore', { internal: false, address: '' }), false);
  assert.equal(nodeLoadWarning('check', null), false);
});

test('normal actions never warn', () => {
  for (const a of ['send', 'receive', 'open', 'settings', undefined]) {
    assert.equal(nodeLoadWarning(a, { internal: true }), false);
  }
});

test('savedNode reads the store user and the config', () => {
  assert.deepEqual(savedNode({ nodeInternal: 1 }, { check_node_api_http_addr: 'x' }), { internal: true, address: 'x' });
  assert.deepEqual(savedNode(null, null), { internal: false, address: '' });
});
