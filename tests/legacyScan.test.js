// Tests for src/shared/legacyScan.js and mergeProfiles (src/legacyProfile.js): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanLegacy } from '../src/shared/legacyScan.js';
import { legacyPaths } from '../src/shared/appPaths.js';
import { mergeProfiles, PROFILE_NAMES } from '../src/legacyProfile.js';
import { fakeWinFs } from './fixtures/fakeWinFs.js';

const P = path.posix, W = path.win32;

function tmpHome() {
  return fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'legacyscan-'));
}

/* an old wallet folder as the GUIs leave it; no real seed, only a marker file */
function wallet(dir, { config, toml, db = 'sqlite', chain = 0, tor = false } = {}) {
  fs.mkdirSync(path.join(dir, 'wallet_data', 'db', db), { recursive: true });
  fs.writeFileSync(path.join(dir, 'wallet_data', 'wallet.seed'), 'not a seed');
  if (config) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
  if (toml) fs.writeFileSync(path.join(dir, 'epic-wallet.toml'), toml);
  if (tor) fs.mkdirSync(path.join(dir, 'wallet_tor'));
  if (chain) {
    fs.mkdirSync(path.join(dir, 'chain_data', 'lmdb'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'chain_data', 'txhashset', 'kernel'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'chain_data', 'lmdb', 'data.mdb'), Buffer.alloc(chain));
    fs.writeFileSync(path.join(dir, 'chain_data', 'txhashset', 'kernel', 'pmmr_data.bin'), Buffer.alloc(100));
    fs.writeFileSync(path.join(dir, 'chain_data', 'peer.txt'), 'not counted');
  }
}

function legacyFor(home) {
  return legacyPaths({ platform: 'linux', home, pathMod: P });
}

function writeAccounts(home, list) {
  fs.mkdirSync(path.join(home, '.epic'), { recursive: true });
  fs.writeFileSync(path.join(home, '.epic', 'epic_3-0-0_config.json'), JSON.stringify({ account_dirs: list }));
}

const byAccount = (r) => Object.fromEntries(r.wallets.map(w => [w.account + '/' + w.network, w]));

test('scan: 3.0, 4.x–5.x and 6.x layouts, default account, another drive, stale entry', (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const usb = tmpHome();
  t.after(() => fs.rmSync(usb, { recursive: true, force: true }));
  const e = (...p) => path.join(home, '.epic', ...p);

  wallet(e('main', 'old30'), { config: { version: '3.0.0' }, db: 'lmdb' });          //3.0 layout, only in the folder
  wallet(e('alpha', 'main'), { config: { version: '5.0.4' }, chain: 1000 });          //4.x layout
  wallet(e('six', 'floo'), { config: { version: '5.0.4' }, toml: 'owner_api_interface = "127.0.0.1"\n' });
  wallet(e('main'), { db: 'lmdb', chain: 500 });                                     //the CLI's / account 'default'
  wallet(path.join(usb, 'beta', 'floo'), { config: { version: '4.0.1' }, db: 'lmdb' });  //another drive, in the list only
  wallet(path.join(home, 'My Wallets', 'main', 'gamma'), { config: { version: '3.0.0' }, db: 'lmdb' });
  writeAccounts(home, [
    { account: 'alpha', userhomedir: e('alpha'), network: 'mainnet', isdefault: false },
    { account: 'beta', userhomedir: path.join(usb, 'beta'), network: 'floonet', isdefault: false },
    { account: 'gamma', userhomedir: path.join(home, 'My Wallets'), network: 'mainnet', isdefault: false },
    { account: 'gone', userhomedir: e('gone'), network: 'mainnet', isdefault: false },   //stale: folder deleted
    { account: 'rel', userhomedir: 'relative/path', network: 'mainnet' },              //never resolved against cwd
    null, { account: 'x' },
  ]);

  const started = Date.now();
  const r = scanLegacy({ fs, pathMod: path, legacy: legacyFor(home) });
  assert.ok(Date.now() - started < 1000);
  const w = byAccount(r);
  assert.deepEqual(Object.keys(w).sort(),
    ['alpha/mainnet', 'beta/floonet', 'default/mainnet', 'gamma/mainnet', 'old30/mainnet', 'six/floonet']);

  assert.equal(w['alpha/mainnet'].app, '4.x–5.x');
  assert.equal(w['alpha/mainnet'].legacyDb, false);
  assert.equal(w['alpha/mainnet'].key, fs.realpathSync(e('alpha', 'main')));
  assert.equal(w['alpha/mainnet'].chainDir, fs.realpathSync(e('alpha', 'main', 'chain_data')));
  assert.equal(w['alpha/mainnet'].label, '');
  assert.match(w['alpha/mainnet'].lastUsed, /^\d{4}-\d\d-\d\dT/);
  assert.equal(w['six/floonet'].app, '6.x');
  assert.equal(w['old30/mainnet'].app, '3.0.x');
  assert.equal(w['old30/mainnet'].legacyDb, true);
  assert.equal(w['gamma/mainnet'].app, '3.0.x');
  assert.equal(w['beta/floonet'].legacyDb, true);
  assert.equal(w['beta/floonet'].dir, path.join(usb, 'beta', 'floo'));
  assert.equal(w['default/mainnet'].dir, e('main'));
  assert.equal(w['default/mainnet'].chainDir, fs.realpathSync(e('main', 'chain_data')));

  //chains: each once (~/.epic/main/chain_data is a wallet's and the CLI's), lmdb + txhashset only
  assert.equal(r.chains.length, 2);
  const alphaChain = r.chains.find(c => c.dir === w['alpha/mainnet'].chainDir);
  assert.deepEqual(alphaChain, { dir: w['alpha/mainnet'].chainDir, network: 'mainnet', bytes: 1100 });
});

test('scan: duplicates through a symlink and known dirs are listed once / not at all', (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const e = (...p) => path.join(home, '.epic', ...p);
  wallet(path.join(home, 'real', 'main'));
  fs.mkdirSync(e(), { recursive: true });
  fs.symlinkSync(path.join(home, 'real'), e('linked'));
  wallet(e('beta', 'floo'));
  writeAccounts(home, [
    { account: 'linked', userhomedir: e('linked'), network: 'mainnet' },
    { account: 'real', userhomedir: path.join(home, 'real'), network: 'mainnet' },
  ]);
  let r = scanLegacy({ fs, pathMod: path, legacy: legacyFor(home) });
  assert.equal(r.wallets.length, 2);
  const linked = r.wallets.find(w => w.network === 'mainnet');
  assert.equal(linked.key, fs.realpathSync(path.join(home, 'real', 'main')));
  assert.equal(linked.account, 'linked');   //the first entry names it

  //known: 6.1's list holds the symlinked path, the decision the real one
  r = scanLegacy({ fs, pathMod: path, legacy: legacyFor(home), known: [e('linked', 'main')] });
  assert.deepEqual(r.wallets.map(w => w.account), ['beta']);
  r = scanLegacy({ fs, pathMod: path, legacy: legacyFor(home), known: new Set([e('beta', 'floo'), linked.key]) });
  assert.equal(r.wallets.length, 0);
});

test('scan: missing or broken account list, empty home, entry without a network', (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  assert.deepEqual(scanLegacy({ fs, pathMod: path, legacy: legacyFor(home) }), { wallets: [], chains: [] });
  fs.mkdirSync(path.join(home, '.epic'));
  for (const bad of ['{', '[]', 'null', '{"account_dirs": 5}', '{"account_dirs": [5, "x"]}']) {
    fs.writeFileSync(path.join(home, '.epic', 'epic_3-0-0_config.json'), bad);
    assert.deepEqual(scanLegacy({ fs, pathMod: path, legacy: legacyFor(home) }).wallets, [], bad);
  }
  //an entry without a network: any network folder, named by the folder
  wallet(path.join(home, 'W', 'odd', 'floo'));
  writeAccounts(home, [{ account: 'odd', userhomedir: path.join(home, 'W', 'odd') }]);
  const r = scanLegacy({ fs, pathMod: path, legacy: legacyFor(home) });
  assert.deepEqual(r.wallets.map(w => [w.account, w.network]), [['odd', 'floonet']]);
});
test('scan: Windows paths (path.win32), %USERPROFILE%\\.epic, another drive, case-only duplicates', () => {
  const env = { USERPROFILE: 'C:\\Users\\Jane Doe', APPDATA: 'C:\\Users\\Jane Doe\\AppData\\Roaming' };
  const legacy = legacyPaths({ platform: 'win32', env, home: 'C:\\Users\\Jane Doe', pathMod: W });
  const epic = 'C:\\Users\\Jane Doe\\.epic';
  const seed = 'wallet_data\\wallet.seed';
  const fsW = fakeWinFs({
    [epic + '\\epic_3-0-0_config.json']: JSON.stringify({ account_dirs: [
      { account: 'alpha', userhomedir: 'c:\\users\\jane doe\\.EPIC\\alpha', network: 'mainnet' },
      { account: 'beta', userhomedir: 'D:\\Epic Wallets\\beta', network: 'floonet' },
      { account: 'old', userhomedir: 'E:\\', network: 'usernet' },
    ] }),
    [epic + '\\alpha\\main\\' + seed]: 'x',
    [epic + '\\alpha\\main\\wallet_data\\db\\sqlite\\epic.db']: 'x',
    ['D:\\Epic Wallets\\beta\\floo\\' + seed]: 'x',
    ['D:\\Epic Wallets\\beta\\floo\\chain_data\\lmdb\\data.mdb']: '12345',
    ['E:\\user\\old\\' + seed]: 'x',
    [epic + '\\main\\chain_data\\lmdb\\data.mdb']: '1234567890',
  });
  const r = scanLegacy({ fs: fsW, pathMod: W, legacy });
  assert.deepEqual(r.wallets.map(w => [w.account, w.network, w.dir, w.app]), [
    ['alpha', 'mainnet', 'c:\\users\\jane doe\\.EPIC\\alpha\\main', '4.x–5.x'],
    ['beta', 'floonet', 'D:\\Epic Wallets\\beta\\floo', '4.x–5.x'],
    ['old', 'usernet', 'E:\\user\\old', '3.0.x'],
  ]);
  assert.equal(r.wallets[2].legacyDb, true);
  assert.equal(r.wallets[0].legacyDb, false);
  assert.equal(r.wallets[1].chainDir, 'D:\\Epic Wallets\\beta\\floo\\chain_data');
  assert.equal(r.wallets[0].lastUsed, '2025-01-02T00:00:00.000Z');
  assert.deepEqual(r.chains, [
    { dir: 'D:\\Epic Wallets\\beta\\floo\\chain_data', network: 'floonet', bytes: 5 },
    { dir: epic + '\\main\\chain_data', network: 'mainnet', bytes: 10 },
  ]);
  //known in another case
  const r2 = scanLegacy({ fs: fsW, pathMod: W, legacy, known: ['d:\\epic wallets\\BETA\\floo'] });
  assert.deepEqual(r2.wallets.map(w => w.account), ['alpha', 'old']);
});

/* mergeProfiles: the two old Electron profiles → one record per account */
const user = (id, account, extra = {}) => ({ id, account, name: account + ' name', language: 'en', nodeInternal: false, epicbox_domain: 'epicbox.epiccash.com', ...extra });
const contact = (id, user_id, name, onion) => ({ id, user_id, name, onion, country: '', city: '', proofaddr: '', externalOne: '', externalTwo: '', notice: '', keybase: '' });

test('mergeProfiles: newer profile wins for the user row, contacts merged without duplicates', () => {
  const old = { app: PROFILE_NAMES[0].app, dir: '/h/.config/EpicWallet',
    users: [user(1, 'alpha', { name: 'Old Alpha', language: 'de' }), user(2, 'beta')],
    contacts: [contact(1, 1, 'Carol', 'c@epicbox'), contact(2, 1, 'Dan', 'd@epicbox'), contact(3, 2, 'Eve', 'e@epicbox'), contact(4, 9, 'Orphan', 'o@x')] };
  const neu = { app: PROFILE_NAMES[1].app, dir: '/h/.config/epic-desktop-wallet',
    users: [user(7, 'alpha', { name: 'New Alpha' }), user(8, 'gamma')],
    contacts: [contact(1, 7, 'Carol', 'c@epicbox'), contact(2, 7, 'Carol', 'c2@epicbox'), contact(3, 8, 'Finn', 'f@x')] };
  for (const order of [[old, neu], [neu, old]]) {
    const m = mergeProfiles(order);
    assert.deepEqual([...m.keys()].sort(), ['alpha', 'beta', 'gamma']);
    assert.equal(m.get('alpha').user.name, 'New Alpha');
    assert.equal(m.get('alpha').app, '6.0+');
    assert.deepEqual(m.get('alpha').contacts.map(c => c.name + ' ' + c.onion).sort(),
      ['Carol c2@epicbox', 'Carol c@epicbox', 'Dan d@epicbox']);
    assert.equal(m.get('beta').user.name, 'beta name');
    assert.equal(m.get('beta').app, '≤5.3.1');
    assert.deepEqual(m.get('beta').contacts.map(c => c.name), ['Eve']);
    assert.deepEqual(m.get('gamma').contacts.map(c => c.name), ['Finn']);
  }
  assert.equal(mergeProfiles([]).size, 0);
  assert.equal(mergeProfiles([{ app: '6.0+', users: [null, { account: 5 }], contacts: 'x' }]).size, 0);
  //an account named like an Object key is just a key
  assert.equal(mergeProfiles([{ app: '6.0+', users: [user(1, '__proto__')], contacts: [] }]).get('__proto__').user.id, 1);
});
