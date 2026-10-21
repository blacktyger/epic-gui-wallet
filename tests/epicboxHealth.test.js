// Tests for src/shared/epicboxHealth.js (npm test): the one Epicbox status of the Modern screens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epicboxHealth, healthiestOther, NO_ANSWER_MS } from '../src/shared/epicboxHealth.js';

const NOW = 1_000_000_000_000;
const A = 'epicbox.epiccash.com';

test('listening: the listener says so', () => {
  const h = epicboxHealth({ epicbox: { state: 'listening', server: 'wss://' + A + ':443', since: NOW - 5000 }, on: true, domain: A, now: NOW });
  assert.deepEqual(h, { state: 'listening', server: A, why: '', since: NOW - 5000 });
});

test('connecting for less than 45 s is just connecting', () => {
  const h = epicboxHealth({ epicbox: { state: 'connecting', server: 'wss://' + A + ':443', since: NOW - (NO_ANSWER_MS - 1000) }, on: false, domain: A, now: NOW });
  assert.equal(h.state, 'connecting');
  assert.equal(h.why, '');
  assert.equal(h.server, A);
});

test('connecting for 45 s or more: not responding, no answer', () => {
  const h = epicboxHealth({ epicbox: { state: 'connecting', server: 'wss://' + A + ':443', since: NOW - NO_ANSWER_MS }, on: false, domain: A, now: NOW });
  assert.equal(h.state, 'down');
  assert.equal(h.why, 'no_answer');
  //connecting without a known start never counts as down by time alone
  assert.equal(epicboxHealth({ epicbox: { state: 'connecting', server: A }, on: false, domain: A, now: NOW }).state, 'connecting');
});

test('stopped after its retries (off while it was still connecting): not responding, stopped', () => {
  const h = epicboxHealth({ epicbox: { state: 'off', failed: true, since: NOW - 1000 }, on: false, domain: A, now: NOW });
  assert.equal(h.state, 'down');
  assert.equal(h.why, 'stopped');
  assert.equal(h.server, A);
});

test('the status site lists the server as down: not responding, status_down', () => {
  const servers = [{ domain: A, state: 'down', latencyMs: null }];
  const h = epicboxHealth({ epicbox: { state: 'connecting', server: A, since: NOW - 1000 }, on: false, domain: A, servers, now: NOW });
  assert.equal(h.state, 'down');
  assert.equal(h.why, 'status_down');
  //a listener that really listens wins over the status site
  assert.equal(epicboxHealth({ epicbox: { state: 'listening', server: A }, on: true, domain: A, servers, now: NOW }).state, 'listening');
});

test('paused (node not synced): its own state, never connecting or down', () => {
  const h = epicboxHealth({ epicbox: { state: 'paused', server: 'wss://' + A + ':443', since: NOW - 10 * NO_ANSWER_MS }, on: true, domain: A, now: NOW });
  assert.deepEqual(h, { state: 'paused', server: A, why: 'node', since: NOW - 10 * NO_ANSWER_MS });
  //the status site doesn't turn a paused listener into "not responding": it is connected
  const servers = [{ domain: A, state: 'down', latencyMs: null }];
  assert.equal(epicboxHealth({ epicbox: { state: 'paused', server: A }, on: true, domain: A, servers, now: NOW }).state, 'paused');
  //listening again after the pause
  assert.equal(epicboxHealth({ epicbox: { state: 'listening', server: A }, on: true, domain: A, now: NOW }).state, 'listening');
});

test('off: not started, not failed', () => {
  const h = epicboxHealth({ epicbox: { state: 'off' }, on: false, domain: A, now: NOW });
  assert.equal(h.state, 'off');
  assert.equal(h.why, '');
  assert.equal(epicboxHealth({}).state, 'off');
});

test('healthiestOther: a healthy server with the lowest latency, never the current one', () => {
  const servers = [
    { domain: A, state: 'healthy', latencyMs: 10 },
    { domain: 'slow.example', state: 'healthy', latencyMs: 300 },
    { domain: 'fast.example', state: 'healthy', latencyMs: 40 },
    { domain: 'bad.example', state: 'down', latencyMs: 5 },
    { domain: 'unknown.example', state: 'healthy', latencyMs: null },
  ];
  assert.equal(healthiestOther(servers, A).domain, 'fast.example');
});

test('healthiestOther: healthy before degraded, and nothing when nothing is up', () => {
  const servers = [
    { domain: 'deg.example', state: 'degraded', latencyMs: 1 },
    { domain: 'ok.example', state: 'healthy', latencyMs: 200 },
  ];
  assert.equal(healthiestOther(servers, A).domain, 'ok.example');
  assert.equal(healthiestOther([{ domain: 'x.example', state: 'down', latencyMs: 1 }, { domain: A, state: 'healthy', latencyMs: 1 }], A), null);
  assert.equal(healthiestOther([], A), null);
  assert.equal(healthiestOther(null, A), null);
});
