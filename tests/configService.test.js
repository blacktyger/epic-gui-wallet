// Tests for src/shared/configService.js on a fake file system (POSIX and Windows paths): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import realFs from 'node:fs';
import path from 'node:path';
import ConfigService from '../src/shared/configService.js';
import { layout } from '../src/shared/appPaths.js';

const RES = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'resources');
const TEMPLATES = Object.fromEntries(['epic-wallet.toml', 'epic-server.toml', 'foundation.json'].map(f => [f, realFs.readFileSync(path.join(RES, f), 'utf8')]));

/* an in-memory fs with the sync calls configService and settingsStore use; writes need the parent dir */
function fakeFs(P) {
  const files = new Map(), dirs = new Set();
  const k = (p) => P.resolve(String(p));
  const err = (code, p) => Object.assign(new Error(code + ': ' + p), { code });
  const parentOk = (p) => dirs.has(P.dirname(k(p)));
  const fs = {
    files, dirs, writes: [],
    existsSync: (p) => files.has(k(p)) || dirs.has(k(p)),
    readFileSync: (p) => { if (!files.has(k(p))) throw err('ENOENT', p); return files.get(k(p)); },
    writeFileSync: (p, data) => { if (!parentOk(p)) throw err('ENOENT', p); files.set(k(p), String(data)); fs.writes.push(k(p)); },
    mkdirSync: (p) => { let d = k(p); while (!dirs.has(d)) { dirs.add(d); const up = P.dirname(d); if (up === d) break; d = up; } },
    renameSync: (a, b) => { if (!files.has(k(a))) throw err('ENOENT', a); files.set(k(b), files.get(k(a))); files.delete(k(a)); fs.writes.push(k(b)); },
    copyFileSync: (a, b) => fs.writeFileSync(b, fs.readFileSync(a)),
    unlinkSync: (p) => { if (!files.delete(k(p))) throw err('ENOENT', p); },
    readdirSync: (p) => {
      if (!dirs.has(k(p))) throw err('ENOENT', p);
      return [...files.keys(), ...dirs].filter(x => x !== k(p) && P.dirname(x) === k(p)).map(x => P.basename(x));
    },
    rmdirSync: (p) => { if (fs.readdirSync(p).length) throw err('ENOTEMPTY', p); dirs.delete(k(p)); },
    put(p, data = '') { fs.mkdirSync(P.dirname(p)); files.set(k(p), data); },
  };
  return fs;
}

function setup({ P = path.posix, root = '/home/jane/.epic-gui', resourcePath = '/opt/epic/resources', source = 'default', platform = 'linux' } = {}) {
  const fs = fakeFs(P);
  for (const [f, text] of Object.entries(TEMPLATES)) fs.put(P.join(resourcePath, f), text);
  const l = layout(root, P);
  const paths = { root, source, defaultRoot: source === 'env' ? undefined : root, settingsFile: l.settingsFile, walletsDir: l.walletsDir, userData: l.userData, logsDir: l.logsDir, processesFile: l.processesFile };
  const events = [];
  const emitter = { emit: (name, data) => events.push([name, data]) };
  const killed = [];
  const nodeChildProcess = {
    owned: [],
    ownedProcesses: async (roles, opts) => { nodeChildProcess.lastScan = { roles, opts }; return nodeChildProcess.owned; },
    stopPids: async (pids) => { killed.push(...pids); return pids.map(() => true); },
  };
  const cs = new ConfigService(emitter, { fs, pathMod: P, paths, resourcePath, platform, arch: 'x64', nodeChildProcess, isPortReachable: async () => false });
  return { cs, fs, P, root, events, nodeChildProcess, killed };
}

/* key = "value" of a rendered toml */
const tomlStr = (text, key) => { const m = new RegExp('^' + key + ' = (.*)$', 'm').exec(text); return m ? JSON.parse(m[1]) : undefined; };

test('a fresh root: nothing is written by starting, no wallet, binaries from resources', () => {
  const { cs, fs } = setup();
  assert.deepEqual(fs.writes, []);
  assert.equal(cs.settings.isFirstRun(), true);
  assert.equal(cs.walletId, '');
  assert.equal(cs.wallet, null);
  assert.deepEqual(cs.config, { locale: '' });
  assert.equal(cs.epicPath, '/opt/epic/resources/bin/linux/epic-wallet');
  assert.equal(cs.epicNodePath, '/opt/epic/resources/bin/linux/epic');
  assert.equal(cs.walletListenerPort, 3415);
  assert.ok(![...fs.dirs].some(d => d.includes('.epic/') || d.endsWith('.epic')), 'no ~/.epic');
});

test('a new wallet: folders, register, toml with every path in its own folder, startCheck', () => {
  const { cs, fs, root } = setup();
  const dirs = cs.newWalletDirs('usernet');
  assert.deepEqual(dirs, { id: 'w1', configDir: root + '/wallets/w1', dataDir: root + '/wallets/w1' });
  assert.ok(fs.dirs.has(dirs.configDir));
  assert.deepEqual(fs.readdirSync(dirs.configDir), []);
  //init would run here; then the seed exists
  fs.put(dirs.dataDir + '/wallet_data/wallet.seed', 'seed');
  const w = cs.registerWallet({ ...dirs, network: 'usernet', origin: 'created', label: '' });
  assert.equal(w.id, 'w1');
  assert.equal(cs.settings.defaultWalletId(), 'w1');
  const toml = fs.readFileSync(dirs.configDir + '/epic-wallet.toml');
  assert.equal(tomlStr(toml, 'chain_type'), 'UserTesting');
  assert.equal(tomlStr(toml, 'data_file_dir'), root + '/wallets/w1/wallet_data');
  assert.equal(tomlStr(toml, 'api_secret_path'), root + '/wallets/w1/.owner_api_secret');
  //usernet has no public node: its own local node (B1)
  assert.equal(tomlStr(toml, 'check_node_api_http_addr'), 'http://127.0.0.1:23413');
  //not the current wallet until startCheck
  assert.equal(cs.walletId, '');

  assert.equal(cs.startCheck('w1'), 'login');
  assert.equal(cs.walletId, 'w1');
  assert.equal(cs.defaultAccountNetwork, 'usernet');
  assert.equal(cs.walletListenerPort, 23415);
  assert.equal(cs.getNodeApiPort(), 23413);
  assert.equal(cs.walletConfigDir, dirs.configDir);
  assert.equal(cs.walletDataDir, dirs.dataDir);
  assert.equal(cs.walletTOMLPath, dirs.configDir + '/epic-wallet.toml');
  assert.equal(cs.walletNodeAddr, 'http://127.0.0.1:23413');
  //secrets are read when used: epic-wallet writes them at its first start
  assert.equal(cs.ownerApisecret, '');
  fs.put(dirs.configDir + '/.owner_api_secret', 'abc\n');
  assert.equal(cs.ownerApisecret, 'abc');
  assert.equal(cs.config.walletlisten_on_startup, true);

  //the next id; a folder left with files (a removed wallet) is skipped
  fs.put(root + '/wallets/w2/wallet_data/wallet.seed', 'old');
  assert.equal(cs.newWalletDirs('mainnet').id, 'w3');
  assert.throws(() => cs.newWalletDirs('testnet'));
  cs.resetConfig();
  assert.equal(cs.walletId, '');
  assert.equal(cs.walletListenerPort, 3415);
});

test('startCheck: missing seed, unknown id, toml not writable', () => {
  const { cs, fs, root } = setup();
  const d = cs.newWalletDirs('mainnet');
  fs.put(d.dataDir + '/wallet_data/wallet.seed');
  cs.registerWallet({ ...d, network: 'mainnet', origin: 'created' });
  assert.equal(cs.startCheck('w9'), 'missing');
  fs.unlinkSync(d.dataDir + '/wallet_data/wallet.seed');
  assert.equal(cs.startCheck('w1'), 'missing');
  assert.equal(cs.walletId, '');
  fs.put(d.dataDir + '/wallet_data/wallet.seed');
  const write = fs.writeFileSync;
  fs.writeFileSync = (p, data, o) => { if (String(p).includes('epic-wallet.toml')) throw new Error('EACCES'); return write(p, data, o); };
  assert.equal(cs.startCheck('w1'), 'toml');
  fs.writeFileSync = write;
  assert.equal(cs.startCheck('w1'), 'login');
  assert.ok(root);
});

test('updateConfig: locale to the app, wallet keys to the wallet, unknown keys dropped, toml rendered again', () => {
  const { cs, fs } = setup();
  const d = cs.newWalletDirs('mainnet');
  fs.put(d.dataDir + '/wallet_data/wallet.seed');
  cs.registerWallet({ ...d, network: 'mainnet', origin: 'created' });
  cs.startCheck('w1');
  assert.equal(cs.updateConfig({ locale: 'de', epicbox_domain: 'epicbox.example.org', check_node_api_http_addr: 'https://n.example:3413', firstTime: false, version: '6.0.0' }), true);
  assert.equal(cs.settings.app().locale, 'de');
  assert.equal(cs.config.locale, 'de');
  const s = cs.settings.wallet('w1').settings;
  assert.equal(s.epicbox_domain, 'epicbox.example.org');
  assert.ok(!('firstTime' in s) && !('version' in s) && !('locale' in s));
  const toml = fs.readFileSync(d.configDir + '/epic-wallet.toml');
  assert.equal(tomlStr(toml, 'epicbox_domain'), 'epicbox.example.org');
  assert.equal(tomlStr(toml, 'check_node_api_http_addr'), 'https://n.example:3413');
  //the built-in node, not synced yet: the wallet uses the public node meanwhile, never with the node's secret (S2)
  cs.updateConfig({ nodeInternal: true, nodesynced: false, check_node_api_http_addr: 'http://127.0.0.1:3413' });
  const t2 = fs.readFileSync(d.configDir + '/epic-wallet.toml');
  assert.equal(tomlStr(t2, 'check_node_api_http_addr'), 'https://node.epiccash.com:3413');
  assert.equal(tomlStr(t2, 'node_api_secret_path'), d.configDir + '/.api_secret');
  cs.updateConfig({ nodesynced: true });
  assert.equal(tomlStr(fs.readFileSync(d.configDir + '/epic-wallet.toml'), 'check_node_api_http_addr'), 'http://127.0.0.1:3413');
  assert.equal(cs.apiSecretPath, cs.nodeDir('mainnet') + '/.api_secret');
  assert.match(cs.apisecret, /^[A-Za-z0-9]{20}$/);
  //no current wallet: only the locale is stored
  cs.resetConfig();
  assert.equal(cs.updateConfig({ locale: 'en', epicbox_domain: 'x' }), true);
  assert.equal(cs.settings.wallet('w1').settings.epicbox_domain, 'epicbox.example.org');
});

test('built-in node: its folder, toml with absolute paths, foundation, secret; reused chain data', () => {
  const { cs, fs, root } = setup();
  const d = cs.newWalletDirs('floonet');
  fs.put(d.dataDir + '/wallet_data/wallet.seed');
  cs.registerWallet({ ...d, network: 'floonet', origin: 'created', settings: { nodeInternal: true } });
  assert.equal(cs.startCheck('w1'), 'login');
  assert.equal(cs.nodeTOMLPath, root + '/node/floo/epic-server.toml');
  const t = fs.readFileSync(cs.nodeTOMLPath);
  assert.equal(tomlStr(t, 'db_root'), root + '/node/floo/chain_data');
  assert.equal(tomlStr(t, 'chain_type'), 'Floonet');
  assert.equal(tomlStr(t, 'api_secret_path'), root + '/node/floo/.api_secret');
  assert.equal(tomlStr(t, 'foundation_path'), root + '/node/floo/foundation.json');
  assert.ok(fs.existsSync(root + '/node/floo/foundation.json'));
  const secret = fs.readFileSync(root + '/node/floo/.api_secret');
  assert.match(secret, /^[A-Za-z0-9]{20}$/);
  //written again: the secret stays
  assert.equal(cs.startCheckNode(), true);
  assert.equal(fs.readFileSync(root + '/node/floo/.api_secret'), secret);
  cs.settings.setNodeChainDir('floonet', '/home/jane/.epic/floo/chain_data');
  assert.equal(cs.nodeChainDir('floonet'), '/home/jane/.epic/floo/chain_data');
  cs.startCheckNode();
  assert.equal(tomlStr(fs.readFileSync(cs.nodeTOMLPath), 'db_root'), '/home/jane/.epic/floo/chain_data');
  assert.equal(cs.nodeChainDir('mainnet'), root + '/node/main/chain_data');
});

test('an imported wallet (the importer calls newWalletDirs + registerWallet): nothing written in the old folder', () => {
  const { cs, fs, root } = setup();
  const old = '/home/jane/.epic/alpha/main';
  fs.put(old + '/wallet_data/wallet.seed', 'seed');
  fs.put(old + '/epic-wallet.toml', 'old toml');
  fs.writes.length = 0;
  const d = cs.newWalletDirs('mainnet');
  const w = cs.registerWallet({ ...d, dataDir: old, network: 'mainnet', origin: 'imported', label: 'Alpha',
    importedFrom: { app: '5.3.1', account: 'alpha', dir: old } });
  assert.equal(w.dataDir, old);
  assert.equal(cs.startCheck(w.id), 'login');
  assert.equal(cs.walletDataDir, old);
  assert.equal(cs.walletConfigDir, root + '/wallets/w1');
  assert.ok(fs.writes.every(p => p.startsWith(root + '/')), fs.writes.join('\n'));
  assert.equal(fs.readFileSync(old + '/epic-wallet.toml'), 'old toml');
  assert.equal(tomlStr(fs.readFileSync(d.configDir + '/epic-wallet.toml'), 'data_file_dir'), old + '/wallet_data');
  assert.throws(() => cs.registerWallet({ ...d, dataDir: old, network: 'mainnet' }), /exists/);
});

test('openExistingWallet: seed needed, network from the arg, folder name or its toml, no duplicates', () => {
  const { cs, fs } = setup();
  assert.deepEqual(cs.openExistingWallet('/nowhere'), { ok: false, reason: 'noseed' });
  assert.deepEqual(cs.openExistingWallet('relative/dir'), { ok: false, reason: 'noseed' });
  fs.put('/media/usb/backup/floo/wallet_data/wallet.seed');
  const r = cs.openExistingWallet('/media/usb/backup/floo');
  assert.equal(r.ok, true);
  assert.equal(r.wallet.network, 'floonet');
  assert.equal(r.wallet.origin, 'opened');
  assert.equal(r.wallet.dataDir, '/media/usb/backup/floo');
  assert.deepEqual(cs.openExistingWallet('/media/usb/backup/floo/'), { ok: false, reason: 'listed' });
  fs.put('/media/usb/mine/wallet_data/wallet.seed');
  assert.deepEqual(cs.openExistingWallet('/media/usb/mine'), { ok: false, reason: 'network' });
  //no folder made for a wallet that wasn't listed
  assert.equal(fs.existsSync(cs.layout.walletDir('w2')), false);
  fs.put('/media/usb/mine/epic-wallet.toml', '[wallet]\nchain_type = "UserTesting"\n');
  assert.equal(cs.openExistingWallet('/media/usb/mine').wallet.network, 'usernet');
  fs.put('/media/usb/third/wallet_data/wallet.seed');
  assert.equal(cs.openExistingWallet('/media/usb/third', 'mainnet').wallet.network, 'mainnet');
  assert.deepEqual(cs.settings.wallets().map(w => w.id), ['w1', 'w2', 'w3']);
});

test('discardWalletDirs: only an empty new folder, never once wallet_data exists', () => {
  const { cs, fs } = setup();
  const a = cs.newWalletDirs('mainnet');
  fs.put(a.configDir + '/epic-wallet.toml');
  fs.put(a.configDir + '/.owner_api_secret');
  assert.equal(cs.discardWalletDirs(a), true);
  assert.equal(fs.existsSync(a.configDir), false);
  const b = cs.newWalletDirs('mainnet');
  fs.mkdirSync(b.configDir + '/wallet_data');
  fs.put(b.configDir + '/.api_secret');
  assert.equal(cs.discardWalletDirs(b), false);
  assert.ok(fs.existsSync(b.configDir + '/.api_secret'));
  const c = cs.newWalletDirs('mainnet');
  fs.put(c.configDir + '/someone-else.txt');
  assert.equal(cs.discardWalletDirs(c), false);
  assert.ok(fs.existsSync(c.configDir + '/someone-else.txt'));
});

test('setRoot / clearRoot: location.json in the default root, only while the list is empty', () => {
  const { cs, fs, root } = setup();
  assert.deepEqual(cs.setRoot('relative'), { ok: false, reason: 'notallowed' });
  assert.deepEqual(cs.setRoot('/media/usb/epic gui'), { ok: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(root + '/location.json')), { root: '/media/usb/epic gui' });
  assert.ok(!fs.existsSync(root + '/location.json.tmp'));
  assert.equal(cs.clearRoot(), true);
  assert.equal(fs.existsSync(root + '/location.json'), false);
  cs.setRoot('/media/usb/x');
  assert.deepEqual(cs.setRoot(root), { ok: true }, 'the default root: the file goes');
  assert.equal(fs.existsSync(root + '/location.json'), false);
  const d = cs.newWalletDirs('mainnet');
  cs.registerWallet({ ...d, network: 'mainnet' });
  assert.deepEqual(cs.setRoot('/media/usb/y'), { ok: false, reason: 'notallowed' });
  assert.equal(cs.clearRoot(), false);
  //EPIC_GUI_HOME wins over location.json: nothing to set
  assert.deepEqual(setup({ source: 'env' }).cs.setRoot('/media/usb/z'), { ok: false, reason: 'notallowed' });
});

test('S1: setRoot refuses older apps\' folders, wallet folders and folders with files', () => {
  const { cs, fs, root } = setup();
  cs.paths.legacy = { epicDir: '/home/jane/.epic', appConfigFile: '/home/jane/.epic/epic_3-0-0_config.json',
    profiles: [{ app: '≤5.3.1', dir: '/home/jane/.config/EpicWallet' }, { app: '6.0+', dir: '/home/jane/.config/epic-desktop-wallet' }] };
  for (const d of ['/home/jane/.epic', '/home/jane/.epic/', '/home/jane/.epic/main', '/home/jane/.epic/new-empty',
    '/home/jane/.config/EpicWallet', '/home/jane/.config/epic-desktop-wallet/x']) {
    assert.deepEqual(cs.setRoot(d), { ok: false, reason: 'legacy' }, d);
  }
  //a folder next to them is fine
  assert.deepEqual(cs.setRoot('/home/jane/.epic-other'), { ok: true });
  fs.put('/media/usb/old/wallet_data/wallet.seed');
  assert.deepEqual(cs.setRoot('/media/usb/old'), { ok: false, reason: 'wallet' });
  assert.deepEqual(cs.setRoot('/media/usb/old/sub'), { ok: false, reason: 'wallet' }, 'inside a wallet folder');
  fs.put('/media/usb/photos/a.jpg');
  assert.deepEqual(cs.setRoot('/media/usb/photos'), { ok: false, reason: 'notempty' });
  fs.mkdirSync('/media/usb/empty');
  assert.deepEqual(cs.setRoot('/media/usb/empty'), { ok: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(root + '/location.json')), { root: '/media/usb/empty' });
  //nothing was written in a refused folder
  assert.ok(!fs.existsSync('/home/jane/.epic/new-empty'));
  //location.json can't be written
  const write = fs.writeFileSync;
  fs.writeFileSync = () => { throw new Error('EACCES'); };
  assert.deepEqual(cs.setRoot('/media/usb/other'), { ok: false, reason: 'failed' });
  fs.writeFileSync = write;
});

test('S1: Windows: an older app\'s folder in any case', () => {
  const W = path.win32;
  const { cs } = setup({ P: W, root: 'C:\\Users\\Jane\\AppData\\Local\\EpicCash\\Wallet', resourcePath: 'C:\\Epic\\resources', platform: 'win' });
  cs.paths.legacy = { epicDir: 'C:\\Users\\Jane\\.epic', appConfigFile: 'C:\\Users\\Jane\\.epic\\epic_3-0-0_config.json',
    profiles: [{ dir: 'C:\\Users\\Jane\\AppData\\Roaming\\EpicWallet' }] };
  assert.deepEqual(cs.setRoot('c:\\users\\jane\\.EPIC\\x'), { ok: false, reason: 'legacy' });
  assert.deepEqual(cs.setRoot('c:\\users\\jane\\appdata\\roaming\\epicwallet'), { ok: false, reason: 'legacy' });
  assert.deepEqual(cs.setRoot('c:\\users\\jane\\appdata\\local\\epiccash\\wallet'), { ok: true }, 'the default root, any case');
  assert.deepEqual(cs.setRoot('D:\\Epic'), { ok: true });
});

test('a broken settings file: nothing is registered or written', () => {
  const P = path.posix;
  const fs0 = fakeFs(P);
  const { cs, fs } = (() => {
    const s = setup();
    s.fs.put(s.cs.paths.settingsFile, '{ broken');
    s.cs.settings.load();
    return s;
  })();
  assert.equal(cs.settings.readOnly, true);
  assert.throws(() => cs.newWalletDirs('mainnet'), /not readable/);
  assert.throws(() => cs.registerWallet({ id: 'w1', network: 'mainnet', configDir: '/a', dataDir: '/a' }), /not readable/);
  assert.deepEqual(cs.openExistingWallet('/x'), { ok: false, reason: 'readonly' });
  assert.deepEqual(cs.setRoot('/media/x'), { ok: false, reason: 'notallowed' });
  assert.equal(fs.readFileSync(cs.paths.settingsFile), '{ broken');
  assert.ok(fs0);
});

test('Windows: paths with spaces and quotes reach the tomls intact', () => {
  const W = path.win32;
  const root = 'C:\\Users\\Jane "JD" Doe\\.epic-gui';
  const { cs, fs } = setup({ P: W, root, resourcePath: 'C:\\Program Files\\Epic Wallet\\resources', platform: 'win' });
  assert.equal(cs.epicPath, 'C:\\Program Files\\Epic Wallet\\resources\\bin\\win\\epic-wallet.exe');
  const old = 'D:\\Old $& Epic\\.epic\\alpha\\main';
  fs.put(old + '\\wallet_data\\wallet.seed');
  const d = cs.newWalletDirs('mainnet');
  cs.registerWallet({ ...d, dataDir: old, network: 'mainnet', origin: 'imported',
    settings: { nodeInternal: true, nodesynced: true, check_node_api_http_addr: 'http://127.0.0.1:3413' } });
  assert.equal(cs.startCheck('w1'), 'login');
  const t = fs.readFileSync(root + '\\wallets\\w1\\epic-wallet.toml');
  assert.equal(tomlStr(t, 'data_file_dir'), old + '\\wallet_data');
  assert.equal(tomlStr(t, 'log_file_path'), root + '\\wallets\\w1\\epic-wallet.log');
  assert.equal(tomlStr(t, 'node_api_secret_path'), root + '\\node\\main\\.api_secret');
  assert.equal(tomlStr(fs.readFileSync(root + '\\node\\main\\epic-server.toml'), 'db_root'), root + '\\node\\main\\chain_data');
  //WALLET.txt with Windows line ends, the old folder named, nothing written there
  const m = fs.readFileSync(root + '\\wallets\\w1\\WALLET.txt');
  assert.ok(m.includes('\r\n') && m.includes('data: ' + old + '\r\n'), m);
  assert.ok(!fs.existsSync(old + '\\WALLET.txt'));
});

test('WALLET.txt: label, network, day, data folder; written on register, rename and start; one line per field', () => {
  const { cs, fs, root } = setup();
  const old = '/home/jane/.epic/alpha/main';
  fs.put(old + '/wallet_data/wallet.seed', 'seed');
  const d = cs.newWalletDirs('floonet');
  cs.registerWallet({ ...d, dataDir: old, network: 'floonet', origin: 'imported', label: 'Alpha', createdAt: '2026-10-19T10:00:00.000Z',
    importedFrom: { app: '5.3.1', account: 'alpha', dir: old } });
  const file = root + '/wallets/w1/WALLET.txt';
  const first = fs.readFileSync(file).split('\n');
  assert.equal(first[0], 'Epic Wallet: Alpha · floonet · created 2026-10-19 · data: ' + old);
  assert.ok(first.includes('Settings of this wallet in Epic Wallet 6.1: ' + root + '/wallets/w1'));
  assert.ok(first.some(l => l.startsWith('Imported from an older Epic Wallet (5.3.1)')));
  assert.equal(cs.renameWallet('w1', ' Savings\nfake line '), true);
  assert.match(fs.readFileSync(file).split('\n')[0], /^Epic Wallet: Savings fake line · floonet/);
  fs.unlinkSync(file);
  assert.equal(cs.startCheck('w1'), 'login');
  assert.ok(fs.existsSync(file));
  assert.ok(!fs.existsSync(old + '/WALLET.txt'));
  //a new wallet made in 6.1: no label, data and config the same folder
  const n = cs.newWalletDirs('mainnet');
  fs.put(n.configDir + '/wallet_data/wallet.seed', 'seed');
  cs.registerWallet({ ...n, network: 'mainnet', origin: 'created' });
  const t = fs.readFileSync(n.configDir + '/WALLET.txt');
  assert.match(t, /^Epic Wallet: \(no label\) · mainnet · created \d{4}-\d\d-\d\d · data: /);
  assert.ok(!t.includes('Settings of this wallet'));
});

test('killEpicProcess: our processes, Tor in the data dir, background roles kept; the ports to wait for', async () => {
  const { cs, fs, events, nodeChildProcess, killed } = setup();
  const old = '/home/jane/.epic/alpha/main';
  fs.put(old + '/wallet_data/wallet.seed');
  const d = cs.newWalletDirs('mainnet');
  cs.registerWallet({ ...d, dataDir: old, network: 'mainnet', settings: { epicbox_background: true, node_background: true } });
  //epicbox_background is gone: the Epicbox listener is always one of ours to stop
  assert.equal(cs.settings.wallet('w1').settings.epicbox_background, undefined);
  cs.startCheck('w1');
  assert.equal(await cs.killEpicProcess(), null);
  assert.deepEqual(nodeChildProcess.lastScan, { roles: ['owner_api', 'listen', 'scan', 'epicbox'],
    opts: { dir: cs.walletConfigDir, anyDirRoles: ['owner_api', 'listen'], tor: true, torDirs: [old] } });
  nodeChildProcess.owned = [{ pid: 5, role: 'owner_api' }, { pid: 6, role: 'listen' }];
  const p = cs.killEpicProcess();
  await new Promise(r => setTimeout(r, 0));
  const [name, data] = events.find(e => e[0] === 'killEpicProcess');
  assert.equal(name, 'killEpicProcess');
  await data.callback(true);
  assert.equal(await p, true);
  assert.deepEqual(killed, [5, 6]);
  assert.deepEqual(cs.killedPorts, [3420, 3415]);
  assert.equal(await cs.waitForKilledPorts(), true);
});

test('killEpicProcess: this wallet\'s listeners and Tor are stopped without asking (restarted on the pty)', async () => {
  const { cs, fs, events, nodeChildProcess, killed } = setup();
  const old = '/home/jane/.epic/alpha/main';
  fs.put(old + '/wallet_data/wallet.seed');
  const d = cs.newWalletDirs('mainnet');
  cs.registerWallet({ ...d, dataDir: old, network: 'mainnet' });
  cs.startCheck('w1');
  nodeChildProcess.owned = [{ pid: 7, role: 'listen', dir: d.configDir }, { pid: 8, role: 'epicbox', dir: d.configDir }, { pid: 9, role: 'tor' }];
  assert.equal(await cs.killEpicProcess(), true);
  assert.equal(events.filter(e => e[0] === 'killEpicProcess').length, 0, 'no prompt');
  assert.deepEqual(killed, [7, 8, 9]);
  assert.deepEqual(cs.killedPorts, [3415]);
  //with an owner API left as well: that one is asked about, the listener port is not doubled
  killed.length = 0;
  nodeChildProcess.owned = [{ pid: 7, role: 'listen', dir: d.configDir }, { pid: 5, role: 'owner_api', dir: d.configDir }];
  const p = cs.killEpicProcess();
  await new Promise(r => setTimeout(r, 0));
  await events.find(e => e[0] === 'killEpicProcess')[1].callback(true);
  assert.equal(await p, true);
  assert.deepEqual(killed, [7, 5]);
  assert.deepEqual(cs.killedPorts, [3415, 3420]);
});

test('B1: a new floonet/usernet wallet uses its own local node, mainnet the public node', () => {
  const { cs, fs } = setup();
  const nodeOf = (id) => tomlStr(fs.readFileSync(cs.settings.wallet(id).configDir + '/epic-wallet.toml'), 'check_node_api_http_addr');
  for (const [network, url] of [['mainnet', 'https://node.epiccash.com:3413'], ['floonet', 'http://127.0.0.1:13413'], ['usernet', 'http://127.0.0.1:23413']]) {
    const d = cs.newWalletDirs(network);
    fs.put(d.dataDir + '/wallet_data/wallet.seed');
    //as walletService.initWallet registers it: no settings
    const w = cs.registerWallet({ id: d.id, network, configDir: d.configDir, dataDir: d.dataDir, origin: 'created' });
    assert.equal(w.settings.check_node_api_http_addr, url, network);
    assert.equal(nodeOf(w.id), url, network);
    assert.equal(cs.startCheck(w.id), 'login');
    assert.equal(cs.walletNodeAddr, url, network);
    assert.equal(cs.localNodeUrl(), url.startsWith('http://') ? url : 'http://127.0.0.1:3413');
    assert.equal(cs.defaultEpicNode, cs.localNodeUrl());
    assert.equal(cs.getNodeFallBack(), network === 'mainnet' ? 'https://node.epiccash.com:3413' : url);
  }
  //the "not synced yet" fallback to the public node is mainnet's only
  assert.equal(cs.walletNodeUrl({ nodesynced: false, check_node_api_http_addr: 'http://127.0.0.1:3413' }, 'mainnet'), 'https://node.epiccash.com:3413');
  assert.equal(cs.walletNodeUrl({ nodesynced: false, check_node_api_http_addr: 'http://127.0.0.1:13413' }, 'floonet'), 'http://127.0.0.1:13413');
  assert.equal(cs.walletNodeUrl({ nodesynced: false, check_node_api_http_addr: '' }, 'usernet'), 'http://127.0.0.1:23413');
  assert.equal(cs.walletNodeUrl({ nodesynced: true, check_node_api_http_addr: 'http://127.0.0.1:3413' }, 'mainnet'), 'http://127.0.0.1:3413');
  //floonet built-in node, not synced: still the local floonet node (with its secret)
  cs.startCheck('w2');
  cs.updateConfig({ nodeInternal: true, nodesynced: false });
  const t = fs.readFileSync(cs.walletTOMLPath);
  assert.equal(tomlStr(t, 'check_node_api_http_addr'), 'http://127.0.0.1:13413');
  assert.equal(tomlStr(t, 'node_api_secret_path'), cs.nodeDir('floonet') + '/.api_secret');
});

test('S2: the built-in node\'s secret goes only to a node on this machine', () => {
  const { cs, fs } = setup();
  const d = cs.newWalletDirs('mainnet');
  fs.put(d.dataDir + '/wallet_data/wallet.seed');
  cs.registerWallet({ ...d, network: 'mainnet', origin: 'created' });
  cs.startCheck('w1');
  const secretPath = () => tomlStr(fs.readFileSync(cs.walletTOMLPath), 'node_api_secret_path');
  //built-in node on, not synced: the public node gets the wallet's own secret file
  cs.updateConfig({ nodeInternal: true, nodesynced: false, check_node_api_http_addr: 'http://127.0.0.1:3413' });
  assert.equal(tomlStr(fs.readFileSync(cs.walletTOMLPath), 'check_node_api_http_addr'), 'https://node.epiccash.com:3413');
  assert.equal(secretPath(), d.configDir + '/.api_secret');
  //synced: the local node and its secret
  cs.updateConfig({ nodesynced: true });
  assert.equal(secretPath(), cs.nodeDir('mainnet') + '/.api_secret');
  //a remote address with nodeInternal still on (hand edit): no node secret
  cs.updateConfig({ check_node_api_http_addr: 'https://node.example.org:3413' });
  assert.equal(secretPath(), d.configDir + '/.api_secret');
  for (const url of ['http://localhost:3413', 'http://[::1]:3413']) {
    cs.updateConfig({ check_node_api_http_addr: url });
    assert.equal(secretPath(), cs.nodeDir('mainnet') + '/.api_secret', url);
  }
});

test('nits: <root>/wallets and each wallet folder are made for this user only (0o700)', () => {
  const { cs, fs, root } = setup();
  const modes = [];
  const mk = fs.mkdirSync;
  fs.mkdirSync = (p, o) => { modes.push([p, o && o.mode]); return mk(p, o); };
  const d = cs.newWalletDirs('mainnet');
  assert.deepEqual(modes, [[root + '/wallets', 0o700], [d.configDir, 0o700]]);
});

test('nits: Windows: a folder already listed in another case is "listed"', () => {
  const W = path.win32;
  const { cs, fs } = setup({ P: W, root: 'C:\\Users\\Jane\\AppData\\Local\\EpicCash\\Wallet', resourcePath: 'C:\\Epic\\resources', platform: 'win' });
  fs.put('D:\\Backup\\Main\\wallet_data\\wallet.seed');
  assert.equal(cs.openExistingWallet('D:\\Backup\\Main', 'mainnet').ok, true);
  //the fake fs is case-sensitive, Windows' is not: the same seed under the other spelling
  fs.put('d:\\backup\\MAIN\\wallet_data\\wallet.seed');
  assert.deepEqual(cs.openExistingWallet('d:\\backup\\MAIN', 'mainnet'), { ok: false, reason: 'listed' });
});

test('S1: ~/.epic-gui is not "inside ~/.epic": whole path segments are compared (POSIX and Windows)', () => {
  //POSIX: the default root is ~/.epic-gui, next to ~/.epic
  const root = '/home/jane/.epic-gui';
  const p = setup({ root });
  p.cs.paths.legacy = { epicDir: '/home/jane/.epic', appConfigFile: '/home/jane/.epic/epic_3-0-0_config.json', profiles: [] };
  assert.equal(p.cs.isSameOrInside(root, '/home/jane/.epic'), false);
  assert.equal(p.cs.isSameOrInside(root + '/sub', '/home/jane/.epic'), false);
  assert.equal(p.cs.isSameOrInside('/home/jane/.epic/x', '/home/jane/.epic'), true);
  assert.deepEqual(p.cs.setRoot(root), { ok: true }, 'the default root');
  assert.deepEqual(p.cs.setRoot(root + '/elsewhere'), { ok: true }, 'a new folder under it');
  assert.deepEqual(p.cs.setRoot('/home/jane/.epic-guix'), { ok: true });
  assert.deepEqual(p.cs.setRoot('/home/jane/.epic'), { ok: false, reason: 'legacy' });
  assert.deepEqual(p.cs.setRoot('/home/jane/.epic/gui'), { ok: false, reason: 'legacy' });

  //Windows: %USERPROFILE%\.epic-gui next to %USERPROFILE%\.epic, any case
  const W = path.win32;
  const wroot = 'C:\\Users\\Jane\\.epic-gui';
  const w = setup({ P: W, root: wroot, resourcePath: 'C:\\Epic\\resources', platform: 'win' });
  w.cs.paths.legacy = { epicDir: 'C:\\Users\\Jane\\.epic', appConfigFile: 'C:\\Users\\Jane\\.epic\\epic_3-0-0_config.json', profiles: [] };
  assert.equal(w.cs.isSameOrInside('c:\\users\\jane\\.EPIC-GUI', 'C:\\Users\\Jane\\.epic'), false);
  assert.equal(w.cs.isSameOrInside('c:\\users\\jane\\.EPIC\\x', 'C:\\Users\\Jane\\.epic'), true);
  assert.deepEqual(w.cs.setRoot('c:\\users\\jane\\.EPIC-GUI'), { ok: true }, 'the default root in another case');
  assert.deepEqual(w.cs.setRoot('C:\\Users\\Jane\\.epic-gui\\data'), { ok: true });
  assert.deepEqual(w.cs.setRoot('c:\\USERS\\jane\\.Epic'), { ok: false, reason: 'legacy' });
  assert.deepEqual(w.cs.setRoot('C:\\Users\\Jane\\.epic\\gui'), { ok: false, reason: 'legacy' });
});
