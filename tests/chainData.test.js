// Tests for scanChains (src/shared/legacyScan.js) and the one-time chain data offer
// (src/shared/chainOffer.js, settingsStore chainOffer): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanChains } from '../src/shared/legacyScan.js';
import { legacyPaths } from '../src/shared/appPaths.js';
import { shouldCheck, pickOffer, offerRecord, usableChain, MIN_MAINNET_TXHASHSET } from '../src/shared/chainOffer.js';
import { createSettingsStore } from '../src/shared/settingsStore.js';
import { fakeWinFs } from './fixtures/fakeWinFs.js';

const P = path.posix, W = path.win32;

function tmpHome(t) {
  const home = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'chaindata-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

/* chain data as a node leaves it: lmdb/data.mdb and a txhashset of txBytes */
function chain(dir, { txBytes = 100, lmdb = 10, txhashset = true } = {}) {
  fs.mkdirSync(path.join(dir, 'chain_data', 'lmdb'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'chain_data', 'lmdb', 'data.mdb'), Buffer.alloc(lmdb));
  if (txhashset) {
    fs.mkdirSync(path.join(dir, 'chain_data', 'txhashset', 'kernel'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'chain_data', 'txhashset', 'kernel', 'pmmr_data.bin'), Buffer.alloc(txBytes));
  }
}

const legacyFor = (home) => legacyPaths({ platform: 'linux', home, pathMod: P });

test('scanChains: every older wallet folder and the CLI, with or without a seed, each once', (t) => {
  const home = tmpHome(t);
  const e = (...p) => path.join(home, '.epic', ...p);
  chain(e('main'));                                  //the CLI's (and account default)
  chain(e('alpha', 'main'), { txBytes: 300 });       //4.x layout
  chain(e('floo', 'old30'));                         //3.0 layout
  chain(e('beta', 'user'));
  chain(e('nolmdb', 'main'), { txhashset: false });  //lmdb without txhashset: not a chain
  const usb = path.join(home, 'usb');
  chain(path.join(usb, 'gamma', 'main'), { txBytes: 50 });
  fs.writeFileSync(e('epic_3-0-0_config.json'), JSON.stringify({ account_dirs: [
    { account: 'gamma', userhomedir: path.join(usb, 'gamma'), network: 'mainnet' },
    { account: 'alpha', userhomedir: e('alpha'), network: 'mainnet' },   //also found in ~/.epic: once
  ] }));
  const r = scanChains({ fs, pathMod: path, legacy: legacyFor(home) });
  const byDir = Object.fromEntries(r.map(c => [c.dir, c]));
  const real = (d) => fs.realpathSync(path.join(d, 'chain_data'));
  assert.deepEqual(Object.keys(byDir).sort(), [
    real(e('main')), real(e('alpha', 'main')), real(e('floo', 'old30')), real(e('beta', 'user')), real(path.join(usb, 'gamma', 'main')),
  ].sort());
  assert.equal(r.length, 5);
  const alpha = byDir[real(e('alpha', 'main'))];
  assert.equal(alpha.network, 'mainnet');
  assert.equal(alpha.txhashsetBytes, 300);
  assert.equal(alpha.bytes, 310);
  assert.ok(alpha.modified > 0);
  assert.equal(byDir[real(e('floo', 'old30'))].network, 'floonet');
  assert.equal(byDir[real(e('beta', 'user'))].network, 'usernet');
  //the account list comes first
  assert.equal(r[0].dir, real(path.join(usb, 'gamma', 'main')));
});

test('scanChains: nothing at all, and an empty ~/.epic', (t) => {
  const home = tmpHome(t);
  assert.deepEqual(scanChains({ fs, pathMod: path, legacy: legacyFor(home) }), []);
  fs.mkdirSync(path.join(home, '.epic', 'main'), { recursive: true });
  assert.deepEqual(scanChains({ fs, pathMod: path, legacy: legacyFor(home) }), []);
});

test('scanChains: Windows paths (path.win32), another drive, case-only duplicates', () => {
  const env = { USERPROFILE: 'C:\\Users\\Jane Doe', APPDATA: 'C:\\Users\\Jane Doe\\AppData\\Roaming' };
  const legacy = legacyPaths({ platform: 'win32', env, home: 'C:\\Users\\Jane Doe', pathMod: W });
  const epic = 'C:\\Users\\Jane Doe\\.epic';
  const fsW = fakeWinFs({
    [epic + '\\epic_3-0-0_config.json']: JSON.stringify({ account_dirs: [
      { account: 'beta', userhomedir: 'D:\\Epic\\beta', network: 'floonet' },
      { account: 'alpha', userhomedir: 'c:\\users\\jane doe\\.EPIC\\alpha', network: 'mainnet' },
    ] }),
    ['D:\\Epic\\beta\\floo\\chain_data\\lmdb\\data.mdb']: '12345',
    ['D:\\Epic\\beta\\floo\\chain_data\\txhashset\\kernel\\pmmr_data.bin']: '12',
    [epic + '\\alpha\\main\\chain_data\\lmdb\\data.mdb']: '1',
    [epic + '\\alpha\\main\\chain_data\\txhashset\\x']: '1',
    [epic + '\\main\\chain_data\\lmdb\\data.mdb']: '1234567890',
    [epic + '\\main\\chain_data\\txhashset']: null,
  });
  const r = scanChains({ fs: fsW, pathMod: W, legacy });
  assert.deepEqual(r.map(c => [c.dir, c.network, c.bytes, c.txhashsetBytes]), [
    ['D:\\Epic\\beta\\floo\\chain_data', 'floonet', 7, 2],
    ['c:\\users\\jane doe\\.EPIC\\alpha\\main\\chain_data', 'mainnet', 2, 1],
    [epic + '\\main\\chain_data', 'mainnet', 10, 0],
  ]);
  assert.equal(r[0].modified, Date.UTC(2025, 0, 2));
});

const big = MIN_MAINNET_TXHASHSET;
const c = (dir, network, modified, bytes, txhashsetBytes = big) => ({ dir, network, modified, bytes, txhashsetBytes });

test('pickOffer: the most recently written usable chain of the network, larger as tie-break', () => {
  const chains = [
    c('/a', 'mainnet', 100, 5 * big), c('/b', 'mainnet', 300, 2 * big), c('/c', 'mainnet', 300, 3 * big),
    c('/f', 'floonet', 900, 10, 10), c('/tiny', 'mainnet', 999, 10, 10),
  ];
  assert.deepEqual(pickOffer(chains, 'mainnet'), { chain: chains[2], others: 2 });
  assert.deepEqual(pickOffer(chains, 'floonet'), { chain: chains[3], others: 0 });
  assert.equal(pickOffer(chains, 'usernet'), null);
  assert.equal(pickOffer([], 'mainnet'), null);
  assert.equal(pickOffer(undefined, 'mainnet'), null);
  //tiny or empty: never offered
  assert.equal(usableChain(c('/t', 'mainnet', 1, big - 1, big - 1), 'mainnet'), false);
  assert.equal(usableChain(c('/t', 'floonet', 1, 0, 0), 'floonet'), false);
  assert.equal(usableChain(c('', 'mainnet', 1, big), 'mainnet'), false);
});

/* the store on a file in a temp dir */
function store(t) {
  const home = tmpHome(t);
  return createSettingsStore({ fs, pathMod: path, file: path.join(home, 'settings.json') }).load();
}

test('shouldCheck: once per network, never with own data or a chainDir', (t) => {
  const s = store(t);
  assert.equal(shouldCheck(s, 'mainnet', false), true);
  assert.equal(shouldCheck(s, 'mainnet', true), false);    //the built-in node has data of its own
  assert.equal(shouldCheck(null, 'mainnet', false), false);
  s.setNodeChainDir('floonet', '/old/floo/chain_data');
  assert.equal(shouldCheck(s, 'floonet', false), false);

  //nothing found: 'none' is kept and the scan isn't repeated; no dir is kept
  assert.equal(s.setChainOffer('mainnet', offerRecord('none', '/x', new Date(Date.UTC(2026, 9, 19)))), true);
  assert.deepEqual(s.chainOffer('mainnet'), { checkedAt: '2026-10-19T00:00:00.000Z', answer: 'none', dir: '' });
  assert.equal(shouldCheck(s, 'mainnet', false), false);
  assert.equal(s.nodeChainDir('mainnet'), '');
  //other networks are asked on their own
  assert.equal(shouldCheck(s, 'usernet', false), true);

  //declined: not asked again, nothing reused
  s.setChainOffer('usernet', offerRecord('declined', '/old/user/chain_data'));
  assert.equal(shouldCheck(s, 'usernet', false), false);
  assert.equal(s.nodeChainDir('usernet'), '');
  assert.equal(s.chainOffer('usernet').dir, '/old/user/chain_data');
});

test('used: the chain dir is set with the answer and both survive a restart', (t) => {
  const home = tmpHome(t);
  const file = path.join(home, 'settings.json');
  let s = createSettingsStore({ fs, pathMod: path, file }).load();
  s.setChainOffer('mainnet', offerRecord('used', '/h/.epic/main/chain_data'));
  assert.equal(s.nodeChainDir('mainnet'), '/h/.epic/main/chain_data');
  s = createSettingsStore({ fs, pathMod: path, file }).load();
  assert.equal(s.nodeChainDir('mainnet'), '/h/.epic/main/chain_data');
  assert.equal(s.chainOffer('mainnet').answer, 'used');
  assert.equal(shouldCheck(s, 'mainnet', false), false);
  assert.throws(() => offerRecord('maybe'));
});

test('a broken chainOffer from a hand edit is asked again', (t) => {
  const home = tmpHome(t);
  const file = path.join(home, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ schema: 1, node: { mainnet: { chainOffer: { answer: 'later' } } }, wallets: [] }));
  const s = createSettingsStore({ fs, pathMod: path, file }).load();
  assert.equal(shouldCheck(s, 'mainnet', false), true);
});
