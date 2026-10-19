// Tests for src/shared/importer.js with fakes of configService, userService and the IPC bridge: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import realFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createImporter, fallbackNodeAddress, fallbackLocale, cleanEpicbox } from '../src/shared/importer.js';
import { createSettingsStore, WALLET_DEFAULTS } from '../src/shared/settingsStore.js';
import { scanLegacy } from '../src/shared/legacyScan.js';
import { legacyPaths } from '../src/shared/appPaths.js';
import ConfigService from '../src/shared/configService.js';

/* an fs that throws on any write under the old GUIs' folders (the test home minus 6.1's root) */
function guardedFs(home, root) {
  const writes = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'copyFileSync', 'rmSync', 'unlinkSync',
    'rmdirSync', 'cpSync', 'symlinkSync', 'truncateSync', 'utimesSync', 'chmodSync', 'openSync', 'createWriteStream'];
  const inLegacy = (p) => {
    const r = path.resolve(String(p));
    return (r === home || r.startsWith(home + path.sep)) && !(r === root || r.startsWith(root + path.sep));
  };
  return new Proxy(realFs, {
    get(target, prop) {
      const v = target[prop];
      if (typeof v !== 'function') return v;
      if (writes.includes(prop)) {
        return (...args) => {
          if (args.slice(0, 2).some(a => typeof a === 'string' && inLegacy(a))) throw new Error('WRITE TO OLD FILES: ' + prop + ' ' + args[0]);
          if (prop === 'openSync' && inLegacy(args[0])) throw new Error('open ' + args[0]);
          return v.apply(target, args);
        };
      }
      return v.bind(target);
    },
  });
}

function hashTree(dir) {
  const h = crypto.createHash('sha256');
  const walk = (d) => {
    for (const n of realFs.readdirSync(d).sort()) {
      const p = path.join(d, n), s = realFs.lstatSync(p);
      h.update(p + ':' + s.mtimeMs + ':');
      if (s.isDirectory()) walk(p); else if (s.isFile()) h.update(realFs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

function oldWallet(dir, config) {
  realFs.mkdirSync(path.join(dir, 'wallet_data', 'db', 'sqlite'), { recursive: true });
  realFs.writeFileSync(path.join(dir, 'wallet_data', 'wallet.seed'), 'not a seed');
  if (config) realFs.writeFileSync(path.join(dir, 'config.json'), typeof config === 'string' ? config : JSON.stringify(config));
}

const user = (id, account, extra = {}) => ({ id, account, name: '', email: '', keybase: '', ngrok: '', language: 'en', nodeInternal: false, epicbox_domain: 'epicbox.epiccash.com', ...extra });
const contact = (id, user_id, name, onion, extra = {}) => ({ id, user_id, name, onion, country: 'PL', city: '', proofaddr: '', externalOne: '', externalTwo: '', notice: '', keybase: '', gender: 'male', alwaysproof: false, ...extra });

/* a home with three old wallets (alpha mainnet + chain, beta floonet, gamma mainnet) */
function setup(t, { profiles, failUserFor = '', cleanNodeAddress, supportedLocale } = {}) {
  const home = realFs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'importer-'));
  t.after(() => realFs.rmSync(home, { recursive: true, force: true }));
  const e = (...p) => path.join(home, '.epic', ...p);
  oldWallet(e('alpha', 'main'), { version: '5.0.4', locale: 'de', check_node_api_http_addr: ' 127.0.0.1:3413 ', epicbox_domain: 'epicbox.epic.tech' });
  realFs.mkdirSync(e('alpha', 'main', 'chain_data', 'lmdb'), { recursive: true });
  realFs.writeFileSync(e('alpha', 'main', 'chain_data', 'lmdb', 'data.mdb'), 'chain');
  oldWallet(path.join(home, 'My Wallets', 'beta', 'floo'), { version: '5.0.4', locale: 'ru', check_node_api_http_addr: '', epicbox_domain: '' });
  oldWallet(e('gamma', 'main'), '{ broken');
  realFs.writeFileSync(e('epic_3-0-0_config.json'), JSON.stringify({ account_dirs: [
    { account: 'alpha', userhomedir: e('alpha'), network: 'mainnet' },
    { account: 'beta', userhomedir: path.join(home, 'My Wallets', 'beta'), network: 'floonet' },
  ] }));
  const before = hashTree(home);

  const root = path.join(home, '.epic-gui');
  const fs = guardedFs(home, root);
  const settings = createSettingsStore({ fs, pathMod: path, file: path.join(root, 'settings.json') }).load();
  const configService = {
    settings,
    newWalletDirs(network) {
      const id = settings.nextWalletId();
      const dir = path.join(root, 'wallets', id);
      return { id, configDir: dir, dataDir: dir, network };
    },
    async registerWallet(rec) {
      fs.mkdirSync(rec.configDir, { recursive: true });
      fs.writeFileSync(path.join(rec.configDir, 'epic-wallet.toml'), '# rendered');
      fs.writeFileSync(path.join(rec.configDir, 'WALLET.txt'), 'Epic Wallet: ...');
      return settings.addWallet(rec);
    },
    //the real one: only known file names, never a folder holding wallet_data
    discardWalletDirs(dirs) { return ConfigService.prototype.discardWalletDirs.call({ fs, path }, dirs); },
  };
  const users = [], book = [];
  const userService = {
    async ensureUser(walletId, cols) {
      if (failUserFor && cols.name === failUserFor) throw new Error('Null value is not allowed');
      let u = users.find(x => x.account === walletId);
      if (!u) { u = { id: users.length + 1, account: walletId, email: '', keybase: '', ngrok: '', ...cols }; users.push(u); }
      return u;
    },
  };
  const NOT_NULL = ['user_id', 'name', 'country', 'city', 'onion', 'keybase', 'proofaddr', 'externalOne', 'externalTwo', 'notice'];
  const addressbookService = {
    async getAddress(userId) { return book.filter(c => c.user_id === userId); },
    async addAddress(row) {
      for (const k of NOT_NULL) if (row[k] === undefined || row[k] === null) throw new Error('Null value is not allowed for column ' + k);
      if ('id' in row) throw new Error('id must be new');
      book.push({ id: book.length + 1, ...row });
      return [row];
    },
  };
  const legacy = legacyPaths({ platform: 'linux', home, appData: path.join(home, '.config'), pathMod: path });
  const bridgeCalls = [];
  const legacyBridge = {
    async scan({ known }) {
      bridgeCalls.push(known);
      return { ...scanLegacy({ fs, pathMod: path, legacy, known }), profiles: profiles || [] };
    },
  };
  const importer = createImporter({ configService, userService, addressbookService, legacyBridge, fs, pathMod: path, cleanNodeAddress, supportedLocale });
  return { home, root, e, importer, settings, users, book, bridgeCalls, unchanged: () => diffOutsideRoot(home, root, before) };
}

/* the hash of the home without 6.1's root must be what it was */
function diffOutsideRoot(home, root, before) {
  if (!realFs.existsSync(root)) return hashTree(home) === before;
  //moved out of the home while hashing (renaming the whole root doesn't change the files outside it)
  const tmp = path.join(path.dirname(home), path.basename(home) + '-root-away');
  realFs.renameSync(root, tmp);
  try { return hashTree(home) === before; } finally { realFs.renameSync(tmp, root); }
}

//dirs are informative only here (mergeProfiles uses app, users and contacts)
const PROFILES = (home) => [
  { app: '≤5.3.1', dir: path.join(home, '.config', 'EpicWallet'),
    users: [user(1, 'alpha', { name: 'Old Alpha', language: 'bg', nodeInternal: true }), user(2, 'beta', { name: 'Beta User', language: 'zh', epicbox_domain: 'epicbox.epic.tech' })],
    contacts: [contact(1, 1, 'Carol', 'c@epicbox'), contact(2, 1, 'Dan', 'd@epicbox', { alwaysproof: true, proofaddr: 'p' }), contact(3, 2, 'Eve', 'e@epicbox', { keybase: 'eve' })] },
  { app: '6.0+', dir: path.join(home, '.config', 'epic-desktop-wallet'),
    users: [user(5, 'alpha', { name: 'Alpha User', language: 'cz', nodeInternal: false })],
    contacts: [contact(1, 5, 'Carol', 'c@epicbox'), contact(2, 5, 'Finn', 'f@epicbox', { country: undefined, city: null })] },
];

test('scan: label, contacts count and cleaned settings preview per found wallet', async (t) => {
  const s2 = setup(t, { profiles: PROFILES('') });
  const r = await s2.importer.scan();
  const by = Object.fromEntries(r.wallets.map(w => [w.account, w]));
  assert.deepEqual(Object.keys(by).sort(), ['alpha', 'beta', 'gamma']);
  assert.equal(by.alpha.label, 'Alpha User');          //6.0+ profile wins
  assert.equal(by.alpha.contacts, 3);                  //Carol once, Dan, Finn
  assert.equal(by.alpha.language, 'de');               //the old config.json's locale wins over User.language (M1)
  assert.deepEqual(by.alpha.settings, {
    check_node_api_http_addr: 'http://127.0.0.1:3413', nodeInternal: false, epicbox_domain: 'epicbox.epiccash.com' });
  assert.equal(by.beta.label, 'Beta User');
  assert.equal(by.beta.language, 'en');                //config.json 'ru': no translation
  assert.equal(by.beta.settings.check_node_api_http_addr, 'http://127.0.0.1:13413');   //floonet: never the mainnet node
  assert.equal(by.beta.settings.epicbox_domain, 'epicbox.epiccash.com');
  assert.equal(by.gamma.label, 'gamma');               //no User row, broken config.json: account name, defaults
  assert.equal(by.gamma.contacts, 0);
  assert.equal(by.gamma.settings.check_node_api_http_addr, WALLET_DEFAULTS.check_node_api_http_addr);
  assert.equal(r.chains.length, 1);
  assert.ok(!('contactRows' in by.alpha) && !('user' in by.alpha), 'only the preview goes to the UI');
  assert.ok(s2.unchanged());
});

test('importWallets: list entries, User rows, linked contacts, decisions, chain, default; old files untouched', async (t) => {
  const b = setup(t, { profiles: PROFILES('') });
  const r = await b.importer.scan();
  const keyOf = (acc) => r.wallets.find(w => w.account === acc).key;
  const res = await b.importer.importWallets([keyOf('alpha'), keyOf('beta')], { reuseChain: true });
  assert.deepEqual(res.failed, []);
  assert.deepEqual(res.imported.map(i => i.walletId), ['w1', 'w2']);

  const w1 = b.settings.wallet('w1'), w2 = b.settings.wallet('w2');
  assert.equal(w1.origin, 'imported');
  assert.equal(w1.dataDir, keyOf('alpha'));
  assert.equal(w1.configDir, path.join(b.root, 'wallets', 'w1'));
  assert.equal(w1.label, 'Alpha User');
  assert.deepEqual(w1.importedFrom, { app: '4.x–5.x', account: 'alpha', dir: b.e('alpha', 'main') });
  assert.equal(w1.settings.check_node_api_http_addr, 'http://127.0.0.1:3413');
  assert.equal(w1.settings.epicbox_domain, 'epicbox.epiccash.com');
  assert.equal(w1.settings.walletlisten_on_startup, WALLET_DEFAULTS.walletlisten_on_startup);
  assert.equal(w2.network, 'floonet');
  assert.equal(b.settings.defaultWalletId(), 'w1');
  assert.equal(b.settings.app().locale, 'de');         //from the first imported wallet, app locale was empty
  assert.equal(b.settings.nodeChainDir('mainnet'), realFs.realpathSync(b.e('alpha', 'main', 'chain_data')));
  assert.equal(b.settings.nodeChainDir('floonet'), '');
  assert.deepEqual(b.settings.legacyDecisions(), { [b.e('alpha', 'main')]: 'imported', [path.join(b.home, 'My Wallets', 'beta', 'floo')]: 'imported' });

  //User rows keyed by the wallet id; contacts point at the new row ids, keybase blank
  assert.deepEqual(b.users.map(u => [u.id, u.account, u.name, u.language, u.nodeInternal, u.epicbox_domain]), [
    [1, 'w1', 'Alpha User', 'de', false, 'epicbox.epiccash.com'],
    [2, 'w2', 'Beta User', 'en', false, 'epicbox.epiccash.com'],
  ]);
  assert.deepEqual(b.book.map(c => [c.user_id, c.name, c.onion, c.keybase]), [
    [1, 'Carol', 'c@epicbox', ''], [1, 'Finn', 'f@epicbox', ''], [1, 'Dan', 'd@epicbox', ''], [2, 'Eve', 'e@epicbox', ''],
  ]);
  const finn = b.book.find(c => c.name === 'Finn');
  assert.equal(finn.country, '');
  assert.equal(finn.city, '');
  assert.equal(b.book.find(c => c.name === 'Dan').alwaysproof, true);

  //again (double click, retry): nothing added twice; next scan skips both
  const again = await b.importer.importWallets([keyOf('alpha')], { reuseChain: true });
  assert.deepEqual(again.imported, [{ key: keyOf('alpha'), walletId: 'w1' }]);
  assert.equal(b.settings.wallets().length, 2);
  assert.equal(b.book.length, 4);
  const r2 = await b.importer.scan();
  assert.deepEqual(r2.wallets.map(w => w.account), ['gamma']);
  assert.ok(b.bridgeCalls.at(-1).includes(b.e('alpha', 'main')));
  assert.ok(b.unchanged(), 'files outside 6.1\'s root changed');
});

test('importWallets: one failure does not stop the others and leaves no half entry', async (t) => {
  const b = setup(t, { profiles: PROFILES(''), failUserFor: 'Beta User' });
  const r = await b.importer.scan();
  const keys = ['alpha', 'beta', 'gamma'].map(acc => r.wallets.find(w => w.account === acc).key);
  const res = await b.importer.importWallets([...keys, '/no/such/wallet'], { reuseChain: false });
  //beta's entry was undone and its new config folder removed; its id is never given out again (S5)
  assert.deepEqual(res.imported.map(i => [i.key, i.walletId]), [[keys[0], 'w1'], [keys[2], 'w3']]);
  assert.ok(!realFs.existsSync(path.join(b.root, 'wallets', 'w2')), 'the failed import\'s config folder is gone');
  assert.deepEqual(res.failed, [
    { key: keys[1], reason: 'Null value is not allowed' },
    { key: '/no/such/wallet', reason: 'not found' },
  ]);
  assert.deepEqual(b.settings.wallets().map(w => [w.id, w.importedFrom.account]), [['w1', 'alpha'], ['w3', 'gamma']]);
  assert.ok(!(path.join(b.home, 'My Wallets', 'beta', 'floo') in b.settings.legacyDecisions()));
  assert.equal(b.settings.nodeChainDir('mainnet'), '');   //reuseChain off
  assert.ok(b.unchanged());
});

test('importWallets: keeps an existing default and app locale; injected cleaners are used', async (t) => {
  const calls = [];
  const b = setup(t, {
    profiles: PROFILES(''),
    cleanNodeAddress: (url, opt) => { calls.push([url, opt.network]); return { url: 'https://cleaned.example:3413', changed: true, reason: 'format' }; },
    supportedLocale: (l) => l === 'cz' ? 'cz' : 'de',
  });
  //not the first run, and a language the user chose: kept
  b.settings.markScanned(0);
  b.settings.setApp({ locale: 'hi' });
  b.settings.addWallet({ id: 'w1', network: 'mainnet', configDir: '/x/w1', dataDir: '/x/w1' });
  const r = await b.importer.scan();
  assert.deepEqual(calls.map(c => c[1]).sort(), ['floonet', 'mainnet', 'mainnet']);
  assert.ok(calls.some(c => c[0] === ' 127.0.0.1:3413 '));
  const beta = r.wallets.find(w => w.account === 'beta');
  assert.equal(beta.language, 'de');
  const res = await b.importer.importWallets([beta.key]);
  assert.deepEqual(res.imported.map(i => i.walletId), ['w2']);
  assert.equal(b.settings.defaultWalletId(), 'w1');
  assert.equal(b.settings.app().locale, 'hi');
  assert.equal(b.settings.wallet('w2').settings.check_node_api_http_addr, 'https://cleaned.example:3413');
});

test('markFresh: stores the decision only', async (t) => {
  const b = setup(t, { profiles: PROFILES('') });
  const r = await b.importer.scan();
  const beta = r.wallets.find(w => w.account === 'beta');
  assert.deepEqual(b.importer.markFresh([beta.key, '/unknown']), { marked: [beta.key] });
  assert.deepEqual(b.settings.legacyDecisions(), { [beta.dir]: 'fresh' });
  assert.equal(b.settings.wallets().length, 0);
  assert.equal(b.users.length + b.book.length, 0);
  assert.deepEqual((await b.importer.scan()).wallets.map(w => w.account).sort(), ['alpha', 'gamma']);
  assert.ok(b.unchanged());
});

test('cleaning fallbacks: node URL, Epicbox domain, locale', () => {
  const f = (u, network) => fallbackNodeAddress(u, { network });
  assert.equal(f(''), WALLET_DEFAULTS.check_node_api_http_addr);
  assert.equal(f(undefined), WALLET_DEFAULTS.check_node_api_http_addr);
  assert.equal(f('   ', 'floonet'), 'http://127.0.0.1:13413');
  assert.equal(f('', 'usernet'), 'http://127.0.0.1:23413');
  assert.equal(f(' node.example.com:3413 '), 'https://node.example.com:3413');
  assert.equal(f('127.0.0.1:3413'), 'http://127.0.0.1:3413');
  assert.equal(f('localhost:13413/', 'floonet'), 'http://localhost:13413');
  assert.equal(f('http://127.0.0.1:3413'), 'http://127.0.0.1:3413');
  assert.equal(f('http://my.node:3413'), 'http://my.node:3413');   //kept as given; nodeAddress.js decides about http
  assert.equal(f('ftp://x'), WALLET_DEFAULTS.check_node_api_http_addr);
  assert.equal(f('https://exa mple'), WALLET_DEFAULTS.check_node_api_http_addr);
  assert.equal(f(42), WALLET_DEFAULTS.check_node_api_http_addr);
  assert.equal(cleanEpicbox('epicbox.epic.tech'), 'epicbox.epiccash.com');
  assert.equal(cleanEpicbox(' EpicBox.Epic.Tech '), 'epicbox.epiccash.com');
  assert.equal(cleanEpicbox(''), 'epicbox.epiccash.com');
  assert.equal(cleanEpicbox(null), 'epicbox.epiccash.com');
  assert.equal(cleanEpicbox('my.box.org'), 'my.box.org');
  for (const l of ['bg', 'cz', 'de', 'en', 'fa', 'hi']) assert.equal(fallbackLocale(l), l);
  for (const l of ['ru', 'zh', '', null, 'DE ']) assert.equal(fallbackLocale(l), l === 'DE ' ? 'de' : 'en');
});

test('M1: the old app\'s language: config.json locale over User.language; sets the app language on the first run', async (t) => {
  //alpha: config.json locale "de", User row language "en" (the old Setup Assistant's), as on a 5.3.1 home
  const profiles = [{ app: '≤5.3.1', dir: '', users: [user(1, 'alpha', { name: 'Alpha', language: 'en' })], contacts: [] }];
  const b = setup(t, { profiles });
  //settings.json from the first start holds a locale already (an older build wrote "en"): the found screen still sets it
  b.settings.setApp({ locale: 'en' });
  assert.equal(b.settings.isFirstRun(), true);
  const r = await b.importer.scan();
  const alpha = r.wallets.find(w => w.account === 'alpha');
  assert.equal(alpha.language, 'de');
  await b.importer.importWallets([alpha.key]);
  assert.equal(b.settings.app().locale, 'de');
  assert.equal(b.users[0].language, 'de');

  //later (Settings › Import): a language the user chose stays
  const c = setup(t, { profiles });
  c.settings.markScanned(0);
  c.settings.setApp({ locale: 'hi' });
  await c.importer.importWallets([(await c.importer.scan()).wallets.find(w => w.account === 'alpha').key]);
  assert.equal(c.settings.app().locale, 'hi');
  //'' (the OS language, nobody chose): the import sets it
  const d = setup(t, { profiles });
  d.settings.markScanned(0);
  await d.importer.importWallets([(await d.importer.scan()).wallets.find(w => w.account === 'alpha').key]);
  assert.equal(d.settings.app().locale, 'de');
});

test('M1: no language known (gamma: broken config.json, no User row): the app language is left as it is', async (t) => {
  const b = setup(t, { profiles: [] });
  const r = await b.importer.scan();
  const gamma = r.wallets.find(w => w.account === 'gamma');
  assert.equal(gamma.language, '');
  const alpha = r.wallets.find(w => w.account === 'alpha');
  //the first wallet with a language decides
  await b.importer.importWallets([gamma.key, alpha.key]);
  assert.equal(b.settings.app().locale, 'de');
  assert.equal(b.users[0].language, undefined, 'no language passed: a new row gets the default');
});

test('nits: Windows: a wallet already imported under another spelling is not imported twice', async () => {
  const W = path.win32;
  const mem = new Map();
  const memFs = {
    existsSync: (f) => mem.has(f), readFileSync: (f) => { if (!mem.has(f)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return mem.get(f); },
    writeFileSync: (f, d) => mem.set(f, String(d)), mkdirSync: () => {}, copyFileSync: (a, b) => mem.set(b, mem.get(a)),
    renameSync: (a, b) => { mem.set(b, mem.get(a)); mem.delete(a); }, unlinkSync: (f) => mem.delete(f),
  };
  const settings = createSettingsStore({ fs: memFs, pathMod: W, file: 'C:\\R\\settings.json' }).load();
  settings.addWallet({ id: 'w1', network: 'mainnet', configDir: 'C:\\R\\wallets\\w1', dataDir: 'C:\\Users\\Jane\\.epic\\alpha\\main',
    origin: 'imported', importedFrom: { app: '5.3.1', account: 'alpha', dir: 'C:\\Users\\Jane\\.epic\\alpha\\main' } });
  let registered = 0;
  const importer = createImporter({
    configService: { settings, newWalletDirs: () => ({ id: 'w2', configDir: 'C:\\R\\wallets\\w2' }), registerWallet: async () => { registered++; } },
    userService: { ensureUser: async () => ({ id: 1 }) }, addressbookService: { getAddress: async () => [], addAddress: async () => {} },
    legacyBridge: { scan: async () => ({ wallets: [{ key: 'c:\\users\\jane\\.EPIC\\alpha\\main', dir: 'c:\\users\\jane\\.EPIC\\alpha\\main',
      network: 'mainnet', account: 'alpha', app: '5.3.1' }], chains: [], profiles: [] }) },
    fs: memFs, pathMod: W,
  });
  const r = await importer.scan();
  const res = await importer.importWallets([r.wallets[0].key]);
  assert.deepEqual(res.imported.map(i => i.walletId), ['w1']);
  assert.equal(registered, 0);
  assert.deepEqual(settings.wallets().map(w => w.id), ['w1']);
});
