// Direct transactions (Settings › Receiving): settings migration, the chip rules, the plan and the
// steps to it, the listen interface. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECT_DEFAULTS, migrateDirect, setChip, chipLocked, listenInterface, directPlan, directAtUnlock, directSteps, directState, httpOffered, torOffered, epicboxDomainLabel } from '../src/shared/directTx.js';
import { normalizeWallet } from '../src/shared/settingsStore.js';

const W = { id: 'w1', network: 'mainnet', configDir: '/c', dataDir: '/d' };

test('migration: HTTP on -> Direct on + HTTP; Tor on -> Direct on + Tor; both -> both; neither -> off (Tor chosen)', () => {
  assert.deepEqual(migrateDirect({ http_listener_autostart: true }), { ...DIRECT_DEFAULTS, direct_on: true, direct_http: true, direct_tor: false });
  assert.deepEqual(migrateDirect({ tor_enabled: true }), { ...DIRECT_DEFAULTS, direct_on: true, direct_http: false, direct_tor: true });
  assert.deepEqual(migrateDirect({ http_listener_autostart: true, tor_enabled: true }), { ...DIRECT_DEFAULTS, direct_on: true, direct_http: true, direct_tor: true });
  assert.deepEqual(migrateDirect({ http_listener_autostart: false, tor_enabled: false }), DIRECT_DEFAULTS);
  assert.deepEqual(migrateDirect(undefined), DIRECT_DEFAULTS);
  assert.equal(DIRECT_DEFAULTS.direct_on, false);
});

test('migration runs once: saved direct_* settings win over leftover old keys; no chip on reads as Tor', () => {
  const saved = { direct_on: false, direct_http: true, direct_tor: false, direct_autostart: false, direct_public: true, tor_enabled: true };
  assert.deepEqual(migrateDirect(saved), { direct_on: false, direct_http: true, direct_tor: false, direct_autostart: false, direct_public: true });
  assert.equal(migrateDirect({ direct_on: true, direct_http: false, direct_tor: false }).direct_tor, true);
  assert.equal(migrateDirect({ direct_on: true, direct_http: 'yes' }).direct_http, false);
});

test('settings.json: the old keys are migrated and dropped on load', () => {
  const s = normalizeWallet({ ...W, settings: { http_listener_autostart: true } }).settings;
  assert.equal(s.direct_on, true);
  assert.equal(s.direct_http, true);
  assert.equal('http_listener_autostart' in s, false);
  assert.equal('tor_enabled' in s, false);
  //loaded again (saved and read back): unchanged
  assert.deepEqual(normalizeWallet({ ...W, settings: s }).settings, s);
});

test('chips: each one on its own, at least one stays on', () => {
  assert.deepEqual(setChip({ http: false, tor: true }, 'http', true), { http: true, tor: true });
  assert.deepEqual(setChip({ http: true, tor: true }, 'tor', false), { http: true, tor: false });
  assert.deepEqual(setChip({ http: true, tor: false }, 'http', false), { http: true, tor: false });
  assert.deepEqual(setChip({ http: false, tor: true }, 'tor', false), { http: false, tor: true });
  assert.deepEqual(setChip({ http: true, tor: false }, 'both', true), { http: true, tor: false });
  assert.equal(chipLocked({ http: true, tor: false }, 'http'), true);
  assert.equal(chipLocked({ http: true, tor: true }, 'http'), false);
  assert.equal(chipLocked({ http: false, tor: true }, 'http'), false);
});

test('listen interface: public only with Public mode AND the HTTP chip (Tor alone stays on 127.0.0.1)', () => {
  assert.equal(listenInterface({ direct_public: true, direct_http: true }), '0.0.0.0');
  assert.equal(listenInterface({ direct_public: true, direct_http: false, direct_tor: true }), '127.0.0.1');
  assert.equal(listenInterface({ direct_public: false, direct_http: true }), '127.0.0.1');
  assert.equal(listenInterface({}), '127.0.0.1');
});

test('plan: the listener runs for HTTP and for Tor; tor only with its chip; nothing while off', () => {
  assert.deepEqual(directPlan({ direct_http: false, direct_tor: true }, true), { listener: true, tor: true, iface: '127.0.0.1' });
  assert.deepEqual(directPlan({ direct_http: true, direct_tor: false, direct_public: true }, true), { listener: true, tor: false, iface: '0.0.0.0' });
  assert.deepEqual(directPlan({ direct_http: true, direct_tor: true }, false), { listener: false, tor: false, iface: '127.0.0.1' });
  assert.equal(directAtUnlock({ direct_on: true, direct_autostart: true, direct_tor: true }), true);
  assert.equal(directAtUnlock({ direct_on: true, direct_autostart: false, direct_tor: true }), false);
  assert.equal(directAtUnlock({ direct_on: false, direct_autostart: true, direct_tor: true }), false);
});

test('steps: from what runs to the plan', () => {
  const L = '127.0.0.1', P = '0.0.0.0';
  const off = { listener: false, tor: false, iface: L };
  //on with Tor only: startTor brings the listener
  assert.deepEqual(directSteps(off, { listener: true, tor: true, iface: L }), ['writeToml', 'startTor']);
  //on with HTTP only
  assert.deepEqual(directSteps(off, { listener: true, tor: false, iface: L }), ['writeToml', 'startListener']);
  //HTTP chip added under a running tor: nothing to start
  assert.deepEqual(directSteps({ listener: true, tor: true, iface: L }, { listener: true, tor: true, iface: L }), []);
  //Tor chip removed, HTTP stays
  assert.deepEqual(directSteps({ listener: true, tor: true, iface: L }, { listener: true, tor: false, iface: L }), ['stopTor']);
  //Direct off: tor and the listener
  assert.deepEqual(directSteps({ listener: true, tor: true, iface: L }, { listener: false, tor: false, iface: L }), ['stopTor', 'stopListener']);
  //made public while HTTP runs: the listener restarts on the new interface; tor keeps running
  assert.deepEqual(directSteps({ listener: true, tor: true, iface: L }, { listener: true, tor: true, iface: P }), ['stopListener', 'writeToml', 'startListener']);
  //HTTP chip off in Public mode with Tor on: back to 127.0.0.1
  assert.deepEqual(directSteps({ listener: true, tor: true, iface: P }, { listener: true, tor: true, iface: L }), ['stopListener', 'writeToml', 'startListener']);
  //the listener had failed (port busy): Try again starts it
  assert.deepEqual(directSteps({ listener: false, tor: false, iface: L }, { listener: true, tor: false, iface: L }), ['writeToml', 'startListener']);
  //off and public saved: only the toml
  assert.deepEqual(directSteps({ listener: false, tor: false, iface: L }, { listener: false, tor: false, iface: P }), ['writeToml']);
});

test('state for the screens: HTTP offered only with Direct on and the HTTP chip', () => {
  const d = directState({ direct_http: true, direct_tor: false, direct_public: true }, true);
  assert.deepEqual(d, { on: true, http: true, tor: false, public: true, wantPublic: true });
  assert.equal(httpOffered(d), true);
  assert.equal(torOffered(d), false);
  assert.equal(httpOffered({ ...d, on: false }), false);
  assert.equal(directState({ direct_http: false, direct_tor: true, direct_public: true }, true).public, false);
});

test('Epicbox shown by its domain', () => {
  assert.equal(epicboxDomainLabel('epicbox.stackwallet.com'), 'stackwallet.com');
  assert.equal(epicboxDomainLabel('wss://epicbox.epicnet.us:443/'), 'epicnet.us');
  assert.equal(epicboxDomainLabel('box.example.org'), 'box.example.org');
  assert.equal(epicboxDomainLabel('epicbox.io'), 'epicbox.io');
  assert.equal(epicboxDomainLabel('127.0.0.1'), '127.0.0.1');
  assert.equal(epicboxDomainLabel(''), '');
});

test('the toml writer: api_listen_interface 127.0.0.1 by default, 0.0.0.0 in Public mode; Tor keys stay local', async () => {
  const { renderWalletToml, renderTorKeysToml } = await import('../src/shared/walletToml.js');
  const fs = await import('node:fs');
  const template = fs.readFileSync(new URL('../resources/epic-wallet.toml', import.meta.url), 'utf8');
  const base = { template, network: 'mainnet', configDir: '/w/c', dataDir: '/w/d', nodeUrl: 'https://node.btlabs.uk' };
  const line = (t) => t.split('\n').filter((l) => /^\s*api_listen_interface\s*=/.test(l));
  assert.deepEqual(line(renderWalletToml(base)), ['api_listen_interface = "127.0.0.1"']);
  const pub = renderWalletToml({ ...base, listenInterface: listenInterface({ direct_public: true, direct_http: true }) });
  assert.deepEqual(line(pub), ['api_listen_interface = "0.0.0.0"']);
  assert.deepEqual(line(renderWalletToml({ ...base, listenInterface: 'anything' })), ['api_listen_interface = "127.0.0.1"']);
  //the owner API keeps its own interface
  assert.doesNotMatch(pub, /owner_api_interface\s*=\s*"0\.0\.0\.0"/);
  assert.deepEqual(line(renderTorKeysToml({ template, network: 'mainnet', keysDir: '/w/c/tor-keys', dataDir: '/w/d', nodeUrl: 'https://node.btlabs.uk', socksPort: 9150, listenPort: 41000 })), ['api_listen_interface = "127.0.0.1"']);
});
