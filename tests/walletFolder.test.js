// Tests for src/shared/walletFolder.js, Open a wallet folder: what a picked folder means. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveWalletFolder } from '../src/shared/walletFolder.js';
import { fakeWinFs } from './fixtures/fakeWinFs.js';

const W = path.win32;

function tmpHome(t) {
  const home = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'walletfolder-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

/* an old wallet folder; no real seed, only a marker file */
function wallet(dir, { chain = false, toml } = {}) {
  fs.mkdirSync(path.join(dir, 'wallet_data', 'db', 'sqlite'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'wallet_data', 'wallet.seed'), 'not a seed');
  fs.mkdirSync(path.join(dir, 'wallet_tor'), { recursive: true });
  if (toml) fs.writeFileSync(path.join(dir, 'epic-wallet.toml'), toml);
  if (chain) {
    fs.mkdirSync(path.join(dir, 'chain_data', 'lmdb'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'chain_data', 'txhashset'), { recursive: true });
  }
}

const pick = (picked) => resolveWalletFolder({ fs, pathMod: path, picked });
const dirs = (r) => r.wallets.map(w => [w.dir, w.network]);

test('the wallet folder itself, and folders inside it, open that wallet', (t) => {
  const home = tmpHome(t);
  const w = path.join(home, '.epic', 'alpha', 'main');
  wallet(w, { chain: true });
  for (const p of [w, path.join(w, 'wallet_data'), path.join(w, 'wallet_data', 'db', 'sqlite'), path.join(w, 'wallet_tor')]) {
    const r = pick(p);
    assert.deepEqual(dirs(r), [[w, 'mainnet']], p);
    assert.equal(r.chainOnly, false);
    assert.equal(r.canceled, false);
    assert.equal(r.picked, p);
  }
});

test('chain_data is blockchain data, not a wallet: the wallet next to it is offered', (t) => {
  const home = tmpHome(t);
  const w = path.join(home, '.epic', 'floo');
  wallet(w, { chain: true });
  let r = pick(path.join(w, 'chain_data'));
  assert.equal(r.chainOnly, true);
  assert.deepEqual(dirs(r), [[w, 'floonet']]);
  //the CLI's chain data alone, no wallet next to it
  const cli = path.join(home, 'cli', 'chain_data');
  fs.mkdirSync(path.join(cli, 'lmdb'), { recursive: true });
  r = pick(cli);
  assert.equal(r.chainOnly, true);
  assert.deepEqual(r.wallets, []);
  //a renamed chain folder is still told by its lmdb/
  fs.renameSync(cli, path.join(home, 'cli', 'blocks'));
  assert.equal(pick(path.join(home, 'cli', 'blocks')).chainOnly, true);
});

test('~/.epic or a userhomedir: every wallet in it, in the 3.0, 4.x–6.x and CLI layouts', (t) => {
  const home = tmpHome(t);
  const e = (...p) => path.join(home, '.epic', ...p);
  wallet(e('main'));                       //CLI / account default
  wallet(e('main', 'old30'));              //3.0 layout <net>/<account>
  wallet(e('alpha', 'main'));              //4.x layout <account>/<net>
  wallet(e('beta', 'user'));
  wallet(e('loose'), { toml: 'chain_type = "Floonet"\n' });   //a wallet folder by any name
  fs.mkdirSync(e('alpha', 'notes', 'deep'), { recursive: true });
  wallet(e('alpha', 'notes', 'deep', 'x'));                     //too deep and not a network folder
  const r = pick(e());
  assert.equal(r.chainOnly, false);
  assert.deepEqual(dirs(r).sort(), [
    [e('alpha', 'main'), 'mainnet'], [e('beta', 'user'), 'usernet'], [e('loose'), 'floonet'],
    [e('main'), 'mainnet'], [e('main', 'old30'), 'mainnet'],
  ].sort());
  //a userhomedir of an older app
  assert.deepEqual(dirs(pick(e('alpha'))), [[e('alpha', 'main'), 'mainnet']]);
});

test('nothing: an empty folder, a folder without wallets, a missing folder', (t) => {
  const home = tmpHome(t);
  fs.mkdirSync(path.join(home, 'Documents', 'stuff'), { recursive: true });
  for (const p of [home, path.join(home, 'Documents'), path.join(home, 'gone')]) {
    const r = pick(p);
    assert.deepEqual(r.wallets, [], p);
    assert.equal(r.chainOnly, false);
  }
});

test('one wallet through a symlink and its real path is listed once', (t) => {
  const home = tmpHome(t);
  wallet(path.join(home, 'real', 'main'));
  fs.symlinkSync(path.join(home, 'real', 'main'), path.join(home, 'real', 'floo'));
  assert.equal(pick(path.join(home, 'real')).wallets.length, 1);
});

test('Windows paths (path.win32): %USERPROFILE%\\.epic, wallet_data in another case, chain_data', () => {
  const epic = 'C:\\Users\\Jane Doe\\.epic';
  const seed = 'wallet_data\\wallet.seed';
  const fsW = fakeWinFs({
    [epic + '\\alpha\\main\\' + seed]: 'x',
    [epic + '\\main\\' + seed]: 'x',
    [epic + '\\main\\chain_data\\lmdb\\data.mdb']: '1',
    [epic + '\\floo\\beta\\' + seed]: 'x',
    ['D:\\Wallets\\mine\\' + seed]: 'x',
    ['D:\\Empty']: null,
  });
  const r = (picked) => resolveWalletFolder({ fs: fsW, pathMod: W, picked });
  assert.deepEqual(dirs(r(epic)).sort(), [
    [epic + '\\alpha\\main', 'mainnet'], [epic + '\\floo\\beta', 'floonet'], [epic + '\\main', 'mainnet'],
  ].sort());
  assert.deepEqual(dirs(r('d:\\wallets\\mine\\WALLET_DATA')), [['d:\\wallets\\mine', '']]);
  const c = r(epic + '\\main\\Chain_Data');
  assert.equal(c.chainOnly, true);
  assert.deepEqual(dirs(c), [[epic + '\\main', 'mainnet']]);
  assert.deepEqual(r('D:\\Empty').wallets, []);
  assert.deepEqual(r('D:\\').wallets.map(w => w.dir), []);   //two levels down only through a network folder
});
