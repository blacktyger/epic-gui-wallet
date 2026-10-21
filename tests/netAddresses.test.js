// Receive from the internet: the LAN and public address (shared/netAddresses.js). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lanAddresses, parsePublicIp, httpUrl, createAddressLookup } from '../src/shared/netAddresses.js';

test('LAN addresses: IPv4, not loopback or link-local, home ranges first', () => {
  const ifaces = {
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    docker0: [{ family: 'IPv4', address: '172.17.0.1', internal: false }],
    wlan0: [{ family: 'IPv6', address: 'fe80::1', internal: false }, { family: 'IPv4', address: '192.168.1.23', internal: false }],
    x: [{ family: 4, address: '169.254.3.4', internal: false }, { family: 4, address: '10.0.0.5', internal: false }],
  };
  assert.deepEqual(lanAddresses(ifaces), ['192.168.1.23', '10.0.0.5', '172.17.0.1']);
  assert.deepEqual(lanAddresses(null), []);
});

test('public address: an IPv4 only', () => {
  assert.equal(parsePublicIp(' 203.0.113.42\n'), '203.0.113.42');
  assert.equal(parsePublicIp('<html>'), '');
  assert.equal(parsePublicIp('999.1.1.1'), '');
  assert.equal(httpUrl('203.0.113.42', 3415), 'http://203.0.113.42:3415');
  assert.equal(httpUrl('', 3415), '');
});

test('lookup: cached; a failure is empty, not an error', async () => {
  let calls = 0;
  const ok = createAddressLookup({ fetch: async () => { calls++; return { ok: true, text: async () => '203.0.113.42' }; }, interfaces: () => ({}) });
  assert.deepEqual(await ok.get(), { lan: [], public: '203.0.113.42' });
  await ok.get();
  assert.equal(calls, 1);
  const bad = createAddressLookup({ fetch: async () => { throw new Error('offline'); }, interfaces: () => ({}) });
  assert.deepEqual(await bad.get(), { lan: [], public: '' });
});
