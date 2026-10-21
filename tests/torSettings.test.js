// 6.1.6 Tor (tor-616 §7, D5): the per-wallet setting. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walletDefaults, normalizeWallet, WALLET_DEFAULTS } from '../src/shared/settingsStore.js';

test('tor_enabled (6.1.6 draft) became Direct transactions: Tor on -> Direct on with the Tor chip; the old key is dropped', () => {
  assert.equal('tor_enabled' in WALLET_DEFAULTS, false);
  for (const n of ['mainnet', 'floonet', 'usernet']) assert.equal(walletDefaults(n).direct_on, false);
  const w = { id: 'w1', network: 'mainnet', configDir: '/c', dataDir: '/d' };
  assert.equal(normalizeWallet(w).settings.direct_on, false);
  const on = normalizeWallet({ ...w, settings: { tor_enabled: true } }).settings;
  assert.equal(on.direct_on, true);
  assert.equal(on.direct_tor, true);
  assert.equal(on.direct_http, false);
  assert.equal('tor_enabled' in on, false);
});

test('tor_onion: per wallet, empty by default (Tor asks the wallet once and saves it)', () => {
  assert.equal(WALLET_DEFAULTS.tor_onion, '');
  const w = { id: 'w1', network: 'mainnet', configDir: '/c', dataDir: '/d' };
  assert.equal(normalizeWallet(w).settings.tor_onion, '');
});
