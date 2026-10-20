import test from 'node:test';
import assert from 'node:assert/strict';
import { heightMeter, relativeAge, exactTime, createBlockTimeCache, fetchBlockTime } from '../src/shared/nodeTip.js';

test('heightMeter: level up to 2 blocks, a little behind 3-30, far behind above 30, unknown without a tip', () => {
  assert.deepEqual(heightMeter(0), { level: 'level', steps: 3, tone: 'ok' });
  assert.equal(heightMeter(2).level, 'level');
  assert.deepEqual(heightMeter(3), { level: 'near', steps: 2, tone: 'warn' });
  assert.equal(heightMeter(30).level, 'near');
  assert.deepEqual(heightMeter(31), { level: 'far', steps: 1, tone: 'risk' });
  assert.equal(heightMeter(100000).level, 'far');
  for (const v of [null, undefined, NaN, -1]) assert.deepEqual(heightMeter(v), { level: 'unknown', steps: 0, tone: '' });
});

test('relativeAge: seconds, minutes, hours in the locale; never in the future', () => {
  assert.equal(relativeAge(40000, 'en'), '40 sec. ago');
  assert.equal(relativeAge(3 * 60000 + 5000, 'en'), '3 min. ago');
  assert.equal(relativeAge(2 * 3600000, 'en'), '2 hr. ago');
  assert.equal(relativeAge(-5000, 'en'), '0 sec. ago');
  assert.notEqual(relativeAge(40000, 'de'), relativeAge(40000, 'en'));
  assert.equal(relativeAge(40000, 'not a locale!!'), '40 sec. ago');
});

test('exactTime: the date and time in the locale', () => {
  const ms = Date.parse('2026-10-20T10:30:00Z');
  assert.equal(exactTime(ms, 'en'), new Date(ms).toLocaleString('en'));
});

function fakeFetch(timestamp, calls){
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ result: { Ok: { timestamp } } }) };
  };
}

test('fetchBlockTime: get_header [height, null, null], once per address and height', async () => {
  const calls = [];
  const cache = createBlockTimeCache();
  const f = fakeFetch('2026-10-20T10:30:00Z', calls);
  const ms = Date.parse('2026-10-20T10:30:00Z');
  assert.equal(await fetchBlockTime('https://n:3413/', 100, { fetch: f, cache }), ms);
  assert.equal(await fetchBlockTime('https://n:3413', 100, { fetch: f, cache }), ms);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://n:3413/v2/foreign');
  assert.deepEqual(calls[0].body, { jsonrpc: '2.0', id: 1, method: 'get_header', params: [100, null, null] });
  await fetchBlockTime('https://n:3413', 101, { fetch: f, cache });
  await fetchBlockTime('https://other:3413', 101, { fetch: f, cache });
  assert.equal(calls.length, 3);
});

test('fetchBlockTime: null for a bad height, a failure or a reply without a time (and not cached)', async () => {
  const calls = [];
  const cache = createBlockTimeCache();
  assert.equal(await fetchBlockTime('https://n', -1, { fetch: fakeFetch('x', calls), cache }), null);
  assert.equal(await fetchBlockTime('https://n', 1.5, { fetch: fakeFetch('x', calls), cache }), null);
  assert.equal(calls.length, 0);
  assert.equal(await fetchBlockTime('https://n', 5, { fetch: fakeFetch('nonsense', calls), cache }), null);
  assert.equal(await fetchBlockTime('https://n', 5, { fetch: async () => { throw new Error('down'); }, cache }), null);
  assert.equal(cache.get('https://n', 5), undefined);
});
