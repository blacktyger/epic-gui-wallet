// Tests for src/shared/appPaths.js and src/shared/settingsStore.js: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultRoot, resolveRoot, layout, legacyPaths, netShort, netFromShort, ENV_ROOT } from '../src/shared/appPaths.js';
import { createSettingsStore, WALLET_DEFAULTS, APP_DEFAULTS, cleanLabel, normalizeWallet } from '../src/shared/settingsStore.js';

const W = path.win32, P = path.posix;
const winEnv = { LOCALAPPDATA: 'C:\\Users\\Jane Doe\\AppData\\Local', APPDATA: 'C:\\Users\\Jane Doe\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\Jane Doe' };

test('default root per platform', () => {
  assert.equal(defaultRoot({ platform: 'linux', home: '/home/jane', pathMod: P }), '/home/jane/.epic-gui');
  assert.equal(defaultRoot({ platform: 'darwin', home: '/Users/jane', pathMod: P }), '/Users/jane/.epic-gui');
  assert.equal(defaultRoot({ platform: 'win32', env: winEnv, home: 'C:\\Users\\Jane Doe', pathMod: W }),
    'C:\\Users\\Jane Doe\\AppData\\Local\\EpicCash\\Wallet');
  //no LOCALAPPDATA (unusual shells): the same place, built from the home dir
  assert.equal(defaultRoot({ platform: 'win32', env: {}, home: 'C:\\Users\\jane', pathMod: W }),
    'C:\\Users\\jane\\AppData\\Local\\EpicCash\\Wallet');
});

test('root: env, then location.json, then the default; bad values fall back to the default', () => {
  const home = '/home/jane', def = '/home/jane/.epic-gui';
  const files = {};
  const readFile = (f) => { if (!(f in files)) throw new Error('ENOENT'); return files[f]; };
  const r = (env = {}) => resolveRoot({ platform: 'linux', env, home, pathMod: P, readFile });
  assert.deepEqual(r(), { root: def, source: 'default', defaultRoot: def });
  files[def + '/location.json'] = JSON.stringify({ root: '/media/usb/epic' });
  assert.equal(r().root, '/media/usb/epic');
  assert.equal(r().source, 'location');
  assert.equal(r({ [ENV_ROOT]: '/tmp/t1/' }).root, '/tmp/t1/');
  assert.equal(r({ [ENV_ROOT]: 'relative/dir' }).source, 'location');
  for (const bad of ['{', JSON.stringify({ root: 'rel' }), JSON.stringify({ root: 5 }), 'null']) {
    files[def + '/location.json'] = bad;
    assert.equal(r().root, def, bad);
  }
  //Windows location file
  const wdef = 'C:\\Users\\Jane Doe\\AppData\\Local\\EpicCash\\Wallet';
  const wf = { [wdef + '\\location.json']: JSON.stringify({ root: 'D:\\Epic GUI' }) };
  assert.equal(resolveRoot({ platform: 'win32', env: winEnv, home: winEnv.USERPROFILE, pathMod: W, readFile: (f) => wf[f] }).root, 'D:\\Epic GUI');
});

test('layout under a root', () => {
  const l = layout('C:\\Users\\Jane Doe\\AppData\\Local\\EpicCash\\Wallet', W);
  assert.equal(l.settingsFile, 'C:\\Users\\Jane Doe\\AppData\\Local\\EpicCash\\Wallet\\settings.json');
  assert.equal(l.walletDir('w2'), 'C:\\Users\\Jane Doe\\AppData\\Local\\EpicCash\\Wallet\\wallets\\w2');
  assert.equal(l.nodeDir('floonet'), 'C:\\Users\\Jane Doe\\AppData\\Local\\EpicCash\\Wallet\\node\\floo');
  assert.equal(l.userData, 'C:\\Users\\Jane Doe\\AppData\\Local\\EpicCash\\Wallet\\app');
  const u = layout('/home/jane/.epic-gui', P);
  assert.equal(u.nodeDir('mainnet'), '/home/jane/.epic-gui/node/main');
  assert.equal(u.processesFile, '/home/jane/.epic-gui/gui_processes.json');
  assert.equal(netShort('usernet'), 'user');
  assert.equal(netFromShort('floo'), 'floonet');
  assert.equal(netFromShort('chain_data'), '');
});

test('legacy paths: the old app config and both old Electron profiles', () => {
  const lw = legacyPaths({ platform: 'win32', env: winEnv, home: winEnv.USERPROFILE, pathMod: W });
  assert.equal(lw.appConfigFile, 'C:\\Users\\Jane Doe\\.epic\\epic_3-0-0_config.json');
  assert.deepEqual(lw.profiles.map(p => p.dir), ['C:\\Users\\Jane Doe\\AppData\\Roaming\\EpicWallet', 'C:\\Users\\Jane Doe\\AppData\\Roaming\\epic-desktop-wallet']);
  const ll = legacyPaths({ platform: 'linux', home: '/home/jane', pathMod: P });
  assert.equal(ll.epicDir, '/home/jane/.epic');
  assert.deepEqual(ll.profiles.map(p => p.dir), ['/home/jane/.config/EpicWallet', '/home/jane/.config/epic-desktop-wallet']);
  const lm = legacyPaths({ platform: 'darwin', home: '/Users/jane', pathMod: P });
  assert.equal(lm.profiles[0].dir, '/Users/jane/Library/Application Support/EpicWallet');
  //Electron's own appData wins when given
  assert.equal(legacyPaths({ platform: 'linux', home: '/home/jane', appData: '/x/cfg', pathMod: P }).profiles[1].dir, '/x/cfg/epic-desktop-wallet');
});

function tmpRoot(t) {
  const d = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'settings-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

test('settings: a fresh root is a first run with defaults, and nothing is written by reading', (t) => {
  const root = tmpRoot(t);
  const s = createSettingsStore({ fs, pathMod: path, file: path.join(root, 'settings.json') }).load();
  assert.equal(s.exists, false);
  assert.equal(s.isFirstRun(), true);
  assert.deepEqual(s.app(), { ...APP_DEFAULTS });
  assert.deepEqual(s.wallets(), []);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('settings: wallets, defaults, ids, save with backup, reload', (t) => {
  const root = tmpRoot(t);
  const file = path.join(root, 'sub', 'settings.json');
  const s = createSettingsStore({ fs, pathMod: path, file, now: () => '2026-10-19T00:00:00.000Z' }).load();
  assert.equal(s.nextWalletId(), 'w1');
  const w1 = s.addWallet({ id: 'w1', network: 'mainnet', configDir: '/r/wallets/w1', dataDir: '/r/wallets/w1' });
  assert.deepEqual(w1.settings, { ...WALLET_DEFAULTS });
  assert.equal(w1.origin, 'created');
  assert.equal(s.defaultWalletId(), 'w1');
  s.addWallet({ id: s.nextWalletId(), label: 'Savings', network: 'floonet', configDir: '/r/wallets/w2', dataDir: '/old/alpha/floo',
    origin: 'imported', importedFrom: { app: '5.3.1', account: 'alpha', dir: '/old/alpha/floo' }, settings: { nodeInternal: true } });
  assert.throws(() => s.addWallet({ id: 'w1', network: 'mainnet', configDir: 'a', dataDir: 'b' }), /exists/);
  assert.throws(() => s.addWallet({ id: 'W 3', network: 'mainnet', configDir: 'a', dataDir: 'b' }), /bad id/);
  assert.throws(() => s.addWallet({ id: 'w3', network: 'testnet', configDir: 'a', dataDir: 'b' }), /bad network/);
  s.updateWalletSettings('w2', { epicbox_domain: 'epicbox.example.org' });
  s.markScanned(1);
  s.setLegacyDecision('/old/alpha/floo', 'imported');
  assert.ok(fs.existsSync(file + '.bak'));
  assert.ok(!fs.existsSync(file + '.tmp'));

  const r = createSettingsStore({ fs, pathMod: path, file }).load();
  assert.equal(r.isFirstRun(), false);
  assert.deepEqual(r.wallets().map(w => [w.id, w.label, w.network, w.dataDir]), [['w1', '', 'mainnet', '/r/wallets/w1'], ['w2', 'Savings', 'floonet', '/old/alpha/floo']]);
  assert.equal(r.wallet('w2').settings.nodeInternal, true);
  assert.equal(r.wallet('w2').settings.epicbox_domain, 'epicbox.example.org');
  assert.equal(r.legacyDecisions()['/old/alpha/floo'], 'imported');
  assert.equal(r.nextWalletId(), 'w3');

  r.removeWallet('w1');
  assert.equal(r.defaultWalletId(), 'w2');
  assert.equal(r.nextWalletId(), 'w3');
  r.removeWallet('w2');
  assert.equal(r.defaultWalletId(), '');
});

test('labels: trimmed, any characters, at most 32, never a path', () => {
  assert.equal(cleanLabel('  Savings  '), 'Savings');
  assert.equal(cleanLabel('../../etc ✨ "x"'), '../../etc ✨ "x"');
  assert.equal(cleanLabel('x'.repeat(40)), 'x'.repeat(32));
  assert.equal(Array.from(cleanLabel('😀'.repeat(40))).length, 32);
  assert.equal(cleanLabel(null), '');
  assert.equal(cleanLabel('a\nb\tc'), 'a b c');
  const n = normalizeWallet({ id: 'w2', network: 'mainnet', configDir: '/r/wallets/w2', dataDir: '/r/wallets/w2', label: ' A/B ' });
  assert.equal(n.label, 'A/B');
  assert.equal(n.configDir, '/r/wallets/w2');
});

test('settings: an unreadable or newer file is never overwritten, unknown keys are kept', (t) => {
  const root = tmpRoot(t);
  const file = path.join(root, 'settings.json');
  fs.writeFileSync(file, '{"schema":1, "wallets": [ oops');
  const s = createSettingsStore({ fs, pathMod: path, file }).load();
  assert.equal(s.readOnly, true);
  assert.match(s.loadError, /JSON|Unexpected|token/i);
  assert.equal(s.setApp({ theme: 'light' }), false);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"schema":1, "wallets": [ oops');

  fs.writeFileSync(file, JSON.stringify({ schema: 2, wallets: [] }));
  assert.equal(createSettingsStore({ fs, pathMod: path, file }).load().readOnly, true);

  fs.writeFileSync(file, JSON.stringify({ schema: 1, future: { x: 1 }, app: { ui: 'classic', extra: true },
    wallets: [{ id: 'w1', network: 'mainnet', configDir: 'a', dataDir: 'b', future: 2 }, { id: 'bad' }] }));
  const k = createSettingsStore({ fs, pathMod: path, file }).load();
  assert.equal(k.readOnly, false);
  assert.equal(k.wallets().length, 1);
  k.setApp({ theme: 'light' });
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(saved.future, { x: 1 });
  assert.equal(saved.app.ui, 'classic');
  assert.equal(saved.app.extra, true);
  assert.equal(saved.app.theme, 'light');
  assert.equal(saved.wallets[0].future, 2);
  assert.deepEqual(saved.wallets[1], { id: 'bad' });
});

test('B1: wallet defaults per network: public node on mainnet, the local node on floonet and usernet', async () => {
  const { walletDefaults } = await import('../src/shared/settingsStore.js');
  assert.deepEqual(walletDefaults('mainnet'), { ...WALLET_DEFAULTS });
  assert.equal(walletDefaults('floonet').check_node_api_http_addr, 'http://127.0.0.1:13413');
  assert.equal(walletDefaults('usernet').check_node_api_http_addr, 'http://127.0.0.1:23413');
  const n = normalizeWallet({ id: 'w2', network: 'floonet', configDir: '/r/w2', dataDir: '/r/w2' });
  assert.equal(n.settings.check_node_api_http_addr, 'http://127.0.0.1:13413');
  //a stored address is kept
  assert.equal(normalizeWallet({ id: 'w2', network: 'usernet', configDir: '/r/w2', dataDir: '/r/w2',
    settings: { check_node_api_http_addr: 'http://10.0.0.5:23413' } }).settings.check_node_api_http_addr, 'http://10.0.0.5:23413');
});

test('S5: wallet ids are never reused: removed ids, broken records kept on disk, nextId only grows', (t) => {
  const root = tmpRoot(t);
  const file = path.join(root, 'settings.json');
  const rec = (id, network = 'mainnet') => ({ id, network, configDir: '/r/wallets/' + id, dataDir: '/r/wallets/' + id });
  const s = createSettingsStore({ fs, pathMod: path, file }).load();
  assert.equal(s.nextWalletId(), 'w1');
  s.addWallet(rec('w1'));
  s.addWallet(rec(s.nextWalletId()));
  assert.equal(s.nextWalletId(), 'w3');
  s.removeWallet('w2');
  assert.equal(s.nextWalletId(), 'w3', 'a removed id is not given out again');
  s.removeWallet('w1');
  assert.equal(s.nextWalletId(), 'w3');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).nextId, 3);
  assert.equal(createSettingsStore({ fs, pathMod: path, file }).load().nextWalletId(), 'w3', 'kept in settings.json');

  //an older file without nextId and with a broken record (kept on disk): past both
  fs.writeFileSync(file, JSON.stringify({ schema: 1, wallets: [rec('w2'), { id: 'w7', network: 'nonet' }] }));
  const r = createSettingsStore({ fs, pathMod: path, file }).load();
  assert.deepEqual(r.wallets().map(w => w.id), ['w2']);
  assert.equal(r.nextWalletId(), 'w8');
  assert.throws(() => r.addWallet(rec('w7')), /exists/, 'not over a broken record');
  //a stored nextId lower than the ids (a hand edit) never wins
  fs.writeFileSync(file, JSON.stringify({ schema: 1, nextId: 1, wallets: [rec('w4')] }));
  assert.equal(createSettingsStore({ fs, pathMod: path, file }).load().nextWalletId(), 'w5');
  fs.writeFileSync(file, JSON.stringify({ schema: 1, nextId: 'x', wallets: [] }));
  assert.equal(createSettingsStore({ fs, pathMod: path, file }).load().nextWalletId(), 'w1');
  //an id given explicitly past nextId moves it on
  const q = createSettingsStore({ fs, pathMod: path, file }).load();
  q.addWallet(rec('w9'));
  assert.equal(q.nextWalletId(), 'w10');
});

test('S7: save tries the rename again while Windows holds the file, and returns false instead of throwing', (t) => {
  const root = tmpRoot(t);
  const file = path.join(root, 'settings.json');
  const busy = (code) => Object.assign(new Error(code), { code });
  let fails = 2, renames = 0;
  const waits = [];
  const flaky = { ...fs, renameSync: (a, b) => { renames++; if (fails-- > 0) throw busy('EPERM'); return fs.renameSync(a, b); } };
  const s = createSettingsStore({ fs: flaky, pathMod: path, file, wait: (ms) => waits.push(ms) }).load();
  assert.equal(s.setApp({ theme: 'light' }), true);
  assert.equal(renames, 3, 'failed twice, then worked');
  assert.deepEqual(waits, [10, 20]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).app.theme, 'light');
  assert.equal(s.saveError, '');

  //always busy: false, the file as it was, no temp file left, no throw from any setter
  const before = fs.readFileSync(file, 'utf8');
  const locked = { ...fs, renameSync: () => { throw busy('EBUSY'); } };
  const l = createSettingsStore({ fs: locked, pathMod: path, file, wait: () => {} }).load();
  assert.equal(l.setApp({ theme: 'dark' }), false);
  assert.equal(l.markScanned(0), false);
  assert.equal(l.setLegacyDecision('/old', 'fresh'), false);
  assert.equal(l.saveError, 'EBUSY');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.ok(!fs.existsSync(file + '.tmp'));
  //a wallet that can't be saved is not listed (registerWallet reports it)
  assert.throws(() => l.addWallet({ id: 'w1', network: 'mainnet', configDir: '/r/w1', dataDir: '/r/w1' }), /settings not saved \(EBUSY\)/);
  assert.deepEqual(l.wallets(), []);
  assert.equal(l.defaultWalletId(), '');
  assert.equal(l.nextWalletId(), 'w1');
  //another error is not retried
  let n = 0;
  const denied = { ...fs, renameSync: () => { n++; throw busy('ENOSPC'); } };
  assert.equal(createSettingsStore({ fs: denied, pathMod: path, file, wait: () => {} }).load().setApp({ scale: 110 }), false);
  assert.equal(n, 1);
  //a write that throws (a full disk): false too
  const full = { ...fs, writeFileSync: () => { throw busy('ENOSPC'); } };
  assert.equal(createSettingsStore({ fs: full, pathMod: path, file }).load().setApp({ scale: 120 }), false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
