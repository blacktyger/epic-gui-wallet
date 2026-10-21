// 6.1.6 Tor (tor-616 §7, D5): the per-wallet setting. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walletDefaults, normalizeWallet, WALLET_DEFAULTS } from '../src/shared/settingsStore.js';

test('tor_enabled: per wallet, off by default; a stored value is kept; older files without it read as off', () => {
  assert.equal(WALLET_DEFAULTS.tor_enabled, false);
  for (const n of ['mainnet', 'floonet', 'usernet']) assert.equal(walletDefaults(n).tor_enabled, false);
  const w = { id: 'w1', network: 'mainnet', configDir: '/c', dataDir: '/d' };
  assert.equal(normalizeWallet(w).settings.tor_enabled, false);
  assert.equal(normalizeWallet({ ...w, settings: { tor_enabled: true } }).settings.tor_enabled, true);
});

test('tor_onion: per wallet, empty by default (Tor asks the wallet once and saves it)', () => {
  assert.equal(WALLET_DEFAULTS.tor_onion, '');
  const w = { id: 'w1', network: 'mainnet', configDir: '/c', dataDir: '/d' };
  assert.equal(normalizeWallet(w).settings.tor_onion, '');
});
