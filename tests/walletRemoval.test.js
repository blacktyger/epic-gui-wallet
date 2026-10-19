// Tests for src/shared/walletRemoval.js, settingsStore.removeWallet and configService.removeWallet:
// a fake fs with symlinks (POSIX and Windows paths), and a real temp dir (TMPDIR) for real symlinks
// and the create / import → remove → create / scan round trips. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import realFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planRemoval, removeFiles, entryKind } from '../src/shared/walletRemoval.js';
import { createSettingsStore } from '../src/shared/settingsStore.js';
import { layout, legacyPaths } from '../src/shared/appPaths.js';
import { scanLegacy } from '../src/shared/legacyScan.js';
import { createImporter } from '../src/shared/importer.js';
import ConfigService from '../src/shared/configService.js';

const RESOURCES = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'resources');

/* an in-memory fs with folders, files and symlinks; P: path.posix or path.win32 (any case on Windows).
   fail: {path: code} makes unlinkSync / rmdirSync of that path throw */
function fakeFs(P) {
  const win = P.sep === '\\';
  const nodes = new Map();
  const key = (p) => { const r = P.resolve(String(p)); return win ? r.toLowerCase() : r; };
  const err = (code, p) => Object.assign(new Error(code + ': ' + p), { code });
  const rootOf = (p) => P.parse(P.resolve(p)).root;
  /* every symlink on the way resolved */
  const real = (p, depth = 0) => {
    if (depth > 20) throw err('ELOOP', p);
    const abs = P.resolve(String(p));
    let cur = rootOf(abs);
    for (const seg of abs.slice(cur.length).split(P.sep).filter(Boolean)) {
      cur = P.join(cur, seg);
      const n = nodes.get(key(cur));
      if (n && n.type === 'link') cur = real(P.resolve(P.dirname(cur), n.target), depth + 1);
    }
    return cur;
  };
  /* the entry itself (its parents resolved, the last segment not) */
  const entry = (p) => P.join(real(P.dirname(P.resolve(String(p)))), P.basename(P.resolve(String(p))));
  const stat = (n) => ({ isFile: () => n.type === 'file', isDirectory: () => n.type === 'dir', isSymbolicLink: () => n.type === 'link' });
  const fs = {
    nodes, fail: {}, calls: [],
    mkdir(p) { let d = P.resolve(p); const todo = []; while (!nodes.has(key(d))) { todo.push(d); if (P.dirname(d) === d) break; d = P.dirname(d); } for (const x of todo) nodes.set(key(x), { type: 'dir', path: x }); },
    put(p, data = '') { fs.mkdir(P.dirname(p)); nodes.set(key(p), { type: 'file', path: P.resolve(p), data }); },
    link(p, target) { fs.mkdir(P.dirname(p)); nodes.set(key(p), { type: 'link', path: P.resolve(p), target }); },
    has: (p) => nodes.has(key(p)),
    existsSync: (p) => { try { return nodes.has(key(real(p))); } catch (e) { return false; } },
    lstatSync: (p) => { const n = nodes.get(key(entry(p))); if (!n) throw err('ENOENT', p); return stat(n); },
    realpathSync: (p) => { const r = real(p); const n = nodes.get(key(r)); if (!n) throw err('ENOENT', p); return n.path; },
    readdirSync: (p) => {
      const r = key(real(p)); const n = nodes.get(r);
      if (!n) throw err('ENOENT', p);
      if (n.type !== 'dir') throw err('ENOTDIR', p);
      return [...nodes.values()].filter(x => key(P.dirname(x.path)) === r && key(x.path) !== r).map(x => P.basename(x.path));
    },
    unlinkSync: (p) => {
      fs.calls.push(['unlink', P.resolve(p)]);
      if (fs.fail[P.resolve(p)]) throw err(fs.fail[P.resolve(p)], p);
      const k = key(entry(p)), n = nodes.get(k);
      if (!n) throw err('ENOENT', p);
      if (n.type === 'dir') throw err(win ? 'EPERM' : 'EISDIR', p);
      nodes.delete(k);
    },
    rmdirSync: (p) => {
      fs.calls.push(['rmdir', P.resolve(p)]);
      if (fs.fail[P.resolve(p)]) throw err(fs.fail[P.resolve(p)], p);
      const k = key(entry(p)), n = nodes.get(k);
      if (!n) throw err('ENOENT', p);
      if (n.type === 'link' && win) { nodes.delete(k); return; }
      if (n.type !== 'dir') throw err('ENOTDIR', p);
      if (fs.readdirSync(p).length) throw err('ENOTEMPTY', p);
      nodes.delete(k);
    },
  };
  return fs;
}

const POSIX = { P: path.posix, home: '/home/jane' };
const WIN = { P: path.win32, home: 'C:\\Users\\Jane' };

/* a root with wallets: created w1 (seed + app files), imported w2 (old folder in ~/.epic) */
function world({ P, home } = POSIX) {
  const fs = fakeFs(P);
  const root = P.join(home, '.epic-gui');
  const l = layout(root, P);
  const paths = { root, walletsDir: l.walletsDir, legacy: { epicDir: P.join(home, '.epic') } };
  const w1dir = l.walletDir('w1');
  for (const f of ['epic-wallet.toml', '.owner_api_secret', '.api_secret', 'epic-wallet.log', 'WALLET.txt', 'epic-wallet.toml.tmp', 'epic-wallet.log.1']) fs.put(P.join(w1dir, f), f);
  fs.put(P.join(w1dir, 'wallet_data', 'wallet.seed'), 'seed');
  fs.put(P.join(w1dir, 'wallet_data', 'db', 'sqlite', 'epic.db'), 'db');
  fs.put(P.join(w1dir, 'wallet_tor', 'torrc'), 'tor');
  fs.put(P.join(w1dir, 'wallet_tor', 'data', 'state'), 'tor');
  const old = P.join(home, '.epic', 'alpha', 'main');
  fs.put(P.join(old, 'wallet_data', 'wallet.seed'), 'old seed');
  fs.put(P.join(old, 'epic-wallet.toml'), 'old toml');
  const w2dir = l.walletDir('w2');
  for (const f of ['epic-wallet.toml', 'WALLET.txt', 'epic-wallet.log']) fs.put(P.join(w2dir, f), f);
  const w1 = { id: 'w1', network: 'mainnet', configDir: w1dir, dataDir: w1dir, origin: 'created' };
  const w2 = { id: 'w2', network: 'mainnet', configDir: w2dir, dataDir: old, origin: 'imported', importedFrom: { app: '5.3.1', account: 'alpha', dir: P.join(home, '.epic', 'alpha') } };
  return { fs, P, root, l, paths, w1, w2, wallets: [w1, w2], old };
}

const plan = (w, wallet, extra = {}) => planRemoval({ wallet, wallets: w.wallets, paths: w.paths, fs: w.fs, pathMod: w.P, ...extra });

test('created and restored wallets: every choice; this app\'s files listed by exact path, never wallet_data', () => {
  for (const origin of ['created', 'restored']) {
    const w = world();
    const p = plan(w, { ...w.w1, origin });
    assert.equal(p.canList, true);
    assert.equal(p.canAppFiles, true);
    assert.equal(p.canEverything, true, origin);
    assert.deepEqual(p.reasons, { list: null, appFiles: null, everything: null });
    assert.equal(p.dir, w.w1.configDir);
    const names = p.appFiles.map(f => w.P.relative(p.dir, f)).sort();
    assert.deepEqual(names, ['.api_secret', '.owner_api_secret', 'WALLET.txt', 'epic-wallet.log', 'epic-wallet.log.1', 'epic-wallet.toml', 'epic-wallet.toml.tmp', 'wallet_tor']);
    assert.ok(!p.appFiles.some(f => f.includes('wallet_data')));
    assert.equal(p.seedFile, w.P.join(w.w1.configDir, 'wallet_data', 'wallet.seed'));
  }
});

test('imported and opened wallets: only this app\'s files in <root>/wallets/<id>; the old folder is never listed', () => {
  for (const origin of ['imported', 'opened']) {
    const w = world();
    const p = plan(w, { ...w.w2, origin });
    assert.equal(p.canAppFiles, true);
    assert.equal(p.canEverything, false);
    assert.deepEqual(p.reasons.everything, { key: 'imported', path: w.old });
    assert.ok(p.appFiles.every(f => f.startsWith(w.w2.configDir + '/')));
    assert.equal(p.appFiles.length, 3);
    assert.equal(p.seedFile, '');
  }
  //an imported wallet whose data dir is its config dir (never made by the importer): nothing but the list
  const w = world();
  const odd = { ...w.w2, dataDir: w.w2.configDir };
  assert.equal(plan(w, odd).canAppFiles, false);
  assert.equal(plan(w, odd).reasons.appFiles.key, 'separate');
  //an old folder inside 6.1's wallet folder, or around it
  assert.equal(plan(w, { ...w.w2, dataDir: w.P.join(w.w2.configDir, 'old') }).reasons.appFiles.key, 'separate');
  assert.equal(plan(w, { ...w.w1, dataDir: w.root, origin: 'opened' }).reasons.appFiles.key, 'separate');
});

test('a created wallet whose seed is elsewhere: this app\'s files only', () => {
  const w = world();
  const p = plan(w, { ...w.w1, dataDir: w.old });
  assert.equal(p.canAppFiles, true);
  assert.deepEqual(p.reasons.everything, { key: 'separate', path: w.old });
});

test('a folder this app didn\'t create: not under walletsDir, another name, a symlink, a file', () => {
  const w = world();
  const elsewhere = { ...w.w1, configDir: '/home/jane/wallets/w1', dataDir: '/home/jane/wallets/w1' };
  w.fs.put('/home/jane/wallets/w1/wallet_data/wallet.seed');
  let p = plan(w, elsewhere);
  assert.equal(p.canAppFiles, false);
  assert.equal(p.canEverything, false);
  assert.deepEqual(p.reasons.appFiles, { key: 'notours', path: '/home/jane/wallets/w1' });
  assert.equal(p.appFiles.length, 0);
  //a folder of another id's name, a nested one, a relative one
  assert.equal(plan(w, { ...w.w1, id: 'w7' }).reasons.appFiles.key, 'notours');
  assert.equal(plan(w, { ...w.w1, configDir: w.P.join(w.w1.configDir, 'x'), dataDir: w.P.join(w.w1.configDir, 'x') }).reasons.appFiles.key, 'notours');
  assert.equal(plan(w, { ...w.w1, configDir: 'wallets/w1' }).reasons.appFiles.key, 'notours');
  //<root>/wallets/w3 is a symlink to a folder elsewhere
  w.fs.put('/data/mine/wallet_data/wallet.seed');
  w.fs.link(w.l.walletDir('w3'), '/data/mine');
  const w3 = { id: 'w3', network: 'mainnet', configDir: w.l.walletDir('w3'), dataDir: w.l.walletDir('w3'), origin: 'created' };
  p = plan(w, w3, { wallets: [...w.wallets, w3] });
  assert.equal(p.canAppFiles, false);
  assert.equal(p.reasons.everything.key, 'notours');
  //a file named like the folder
  w.fs.put(w.l.walletDir('w4'), 'x');
  assert.equal(plan(w, { ...w3, id: 'w4', configDir: w.l.walletDir('w4'), dataDir: w.l.walletDir('w4') }).reasons.appFiles.key, 'notours');
});

test('the wallets folder itself behind a symlink: still ours when <id> sits directly in it', () => {
  const w = world();
  //~/.epic-gui → /srv/epic-gui (moved by hand): wallets/w1 resolves to /srv/epic-gui/wallets/w1
  const fs = fakeFs(path.posix);
  fs.put('/srv/epic-gui/wallets/w1/wallet_data/wallet.seed');
  fs.put('/srv/epic-gui/wallets/w1/epic-wallet.toml');
  fs.link('/home/jane/.epic-gui', '/srv/epic-gui');
  const wallet = { ...w.w1 };
  const p = planRemoval({ wallet, wallets: [wallet], paths: w.paths, fs, pathMod: path.posix });
  assert.equal(p.canEverything, true);
  assert.equal(p.dirReal, '/srv/epic-gui/wallets/w1');
});

test('shared folders: another wallet (also a broken record) equal to, inside or around the folder', () => {
  const w = world();
  const cases = [
    { id: 'w5', configDir: w.l.walletDir('w5'), dataDir: w.w1.configDir },
    { id: 'w5', configDir: w.l.walletDir('w5'), dataDir: w.P.join(w.w1.configDir, 'wallet_data', 'x') },
    { id: 'w5', configDir: w.l.walletDir('w5'), dataDir: w.root },
    { id: 'w5', configDir: w.w1.configDir, dataDir: w.old },
  ];
  for (const other of cases) {
    const p = plan(w, w.w1, { wallets: [w.w1, { ...other, network: 'mainnet', origin: 'opened' }] });
    assert.deepEqual(p.reasons.appFiles, { key: 'shared', path: w.w1.configDir }, JSON.stringify(other));
    assert.equal(p.canEverything, false);
    //the same as a record settingsStore could not read
    const q = plan(w, w.w1, { wallets: [w.w1], invalidWallets: [{ ...other, network: 'nonet' }] });
    assert.equal(q.reasons.appFiles.key, 'shared');
  }
  //a neighbour is fine
  assert.equal(plan(w, w.w1).canEverything, true);
});

test('the built-in node\'s chain data inside the folder, the folder inside ~/.epic: refused', () => {
  const w = world();
  let p = plan(w, w.w1, { chainDirs: [w.P.join(w.w1.configDir, 'chain_data')] });
  assert.equal(p.canAppFiles, true);
  assert.equal(p.canEverything, false);
  assert.equal(p.reasons.everything.key, 'chain');
  assert.equal(plan(w, w.w1, { chainDirs: [w.P.join(w.root, 'node', 'main', 'chain_data')] }).canEverything, true);
  //6.1's root moved into ~/.epic (location.json by hand)
  p = plan(w, w.w1, { paths: { ...w.paths, legacy: { epicDir: w.root } } });
  assert.equal(p.reasons.appFiles.key, 'legacy');
  assert.equal(p.canEverything, false);
});

test('the open wallet and a running process: nothing but the list, and not even that while open', () => {
  const w = world();
  let p = plan(w, w.w1, { openId: 'w1' });
  assert.equal(p.canList, false);
  assert.equal(p.reasons.list.key, 'open');
  assert.equal(p.reasons.appFiles.key, 'open');
  assert.equal(p.reasons.everything.key, 'open');
  p = plan(w, w.w1, { running: [{ pid: 42, role: 'listen' }] });
  assert.equal(p.canList, true);
  assert.equal(p.canAppFiles, false);
  assert.equal(p.reasons.everything.key, 'running');
  p = plan(w, w.w1, { openId: 'w2' });
  assert.equal(p.canEverything, true);
});

test('folder missing (Unlock): list and this app\'s files only', () => {
  const w = world();
  const gone = { ...w.w1, id: 'w9', configDir: w.l.walletDir('w9'), dataDir: w.l.walletDir('w9') };
  const p = plan(w, gone, { folderMissing: true });
  assert.equal(p.canAppFiles, true);
  assert.deepEqual(p.appFiles, []);
  assert.equal(p.reasons.everything.key, 'missing');
  const r = removeFiles(p, 'app', { fs: w.fs, pathMod: w.P });
  assert.deepEqual(r.failed, []);
  assert.equal(r.entrySafe, true);
});

test('Windows paths: any case, backslashes, a junction', () => {
  const w = world(WIN);
  const P = path.win32;
  const lower = { ...w.w1, configDir: w.w1.configDir.toLowerCase(), dataDir: w.w1.configDir.toUpperCase().replace('C:', 'c:') };
  let p = plan(w, lower);
  assert.equal(p.canEverything, true, JSON.stringify(p.reasons));
  const other = { id: 'w5', network: 'mainnet', origin: 'opened', configDir: w.l.walletDir('w5'), dataDir: 'c:\\USERS\\jane\\.EPIC-GUI\\wallets\\W1\\sub' };
  assert.equal(plan(w, w.w1, { wallets: [w.w1, other] }).reasons.appFiles.key, 'shared');
  assert.equal(plan(w, { ...w.w1, configDir: 'D:\\wallets\\w1', dataDir: 'D:\\wallets\\w1' }).reasons.appFiles.key, 'notours');
  //wallet_tor is a junction to a folder outside: the junction goes, its target stays
  w.fs.put('D:\\tor\\keep.txt', 'keep');
  w.fs.nodes.delete(w.P.join(w.w1.configDir, 'wallet_tor', 'torrc').toLowerCase());
  w.fs.nodes.delete(w.P.join(w.w1.configDir, 'wallet_tor', 'data', 'state').toLowerCase());
  w.fs.nodes.delete(w.P.join(w.w1.configDir, 'wallet_tor', 'data').toLowerCase());
  w.fs.nodes.delete(w.P.join(w.w1.configDir, 'wallet_tor').toLowerCase());
  w.fs.link(P.join(w.w1.configDir, 'wallet_tor'), 'D:\\tor');
  p = plan(w, w.w1);
  const r = removeFiles(p, 'everything', { fs: w.fs, pathMod: P });
  assert.deepEqual(r.failed, []);
  assert.equal(r.dirRemoved, true);
  assert.equal(w.fs.has(w.w1.configDir), false);
  assert.equal(w.fs.has('D:\\tor\\keep.txt'), true);
});

test('removeFiles app: exactly the listed files; wallet_data, other files and the folder stay', () => {
  const w = world();
  w.fs.put(w.P.join(w.w1.configDir, 'notes.txt'), 'mine');
  const p = plan(w, w.w1);
  const r = removeFiles(p, 'app', { fs: w.fs, pathMod: w.P });
  assert.deepEqual(r.failed, []);
  assert.equal(r.entrySafe, true);
  assert.equal(r.dirRemoved, false);
  assert.deepEqual(w.fs.readdirSync(w.w1.configDir).sort(), ['notes.txt', 'wallet_data']);
  assert.equal(w.fs.has(w.P.join(w.w1.configDir, 'wallet_data', 'wallet.seed')), true);
  assert.equal(w.fs.has(w.P.join(w.w1.configDir, 'wallet_data', 'db', 'sqlite', 'epic.db')), true);
  //every unlink/rmdir was inside the folder, and nothing in wallet_data
  for (const [, p2] of w.fs.calls) {
    assert.ok(p2.startsWith(w.w1.configDir + '/'), p2);
    assert.ok(!p2.includes('wallet_data'), p2);
  }
  //an imported wallet: its old folder is untouched, its own folder empty → gone
  const p2 = plan(w, w.w2);
  const r2 = removeFiles(p2, 'app', { fs: w.fs, pathMod: w.P });
  assert.equal(r2.dirRemoved, true);
  assert.equal(w.fs.has(w.w2.configDir), false);
  assert.equal(w.fs.has(w.P.join(w.old, 'wallet_data', 'wallet.seed')), true);
  assert.equal(w.fs.has(w.P.join(w.old, 'epic-wallet.toml')), true);
});

test('removeFiles everything: the folder is gone, the seed went last', () => {
  const w = world();
  const p = plan(w, w.w1);
  const r = removeFiles(p, 'everything', { fs: w.fs, pathMod: w.P });
  assert.deepEqual(r.failed, []);
  assert.equal(r.seedRemoved, true);
  assert.equal(r.entrySafe, true);
  assert.equal(r.dirRemoved, true);
  assert.equal(w.fs.has(w.w1.configDir), false);
  assert.equal(w.fs.has(w.l.walletsDir), true);
  const unlinks = w.fs.calls.filter(c => c[0] === 'unlink').map(c => c[1]);
  const seedAt = unlinks.indexOf(p.seedFile);
  assert.equal(seedAt, unlinks.length - 1, 'the seed is the last file');
  //the other wallet is untouched
  assert.equal(w.fs.has(w.P.join(w.w2.configDir, 'epic-wallet.toml')), true);
  assert.equal(w.fs.has(w.P.join(w.old, 'wallet_data', 'wallet.seed')), true);
});

test('partial failure: reported; this app\'s file failing keeps wallet_data, a db file failing keeps the seed', () => {
  let w = world();
  let p = plan(w, w.w1);
  w.fs.fail[w.P.join(w.w1.configDir, 'epic-wallet.log')] = 'EBUSY';
  let r = removeFiles(p, 'everything', { fs: w.fs, pathMod: w.P });
  assert.deepEqual(r.failed, [{ path: w.P.join(w.w1.configDir, 'epic-wallet.log'), error: 'EBUSY' }]);
  assert.equal(r.entrySafe, false);
  assert.equal(r.seedRemoved, false);
  assert.equal(w.fs.has(w.P.join(w.w1.configDir, 'wallet_data', 'db', 'sqlite', 'epic.db')), true);
  assert.ok(!w.fs.calls.some(c => c[1].includes('wallet_data')), 'wallet_data not touched');
  //'app' with a failure: not safe to drop the entry either
  w = world();
  p = plan(w, w.w1);
  w.fs.fail[w.P.join(w.w1.configDir, '.api_secret')] = 'EPERM';
  r = removeFiles(p, 'app', { fs: w.fs, pathMod: w.P });
  assert.equal(r.failed.length, 1);
  assert.equal(r.entrySafe, false);
  assert.ok(r.removed.length >= 5);
  //a database file that can't go: the seed stays, so the wallet is still whole
  w = world();
  p = plan(w, w.w1);
  w.fs.fail[w.P.join(w.w1.configDir, 'wallet_data', 'db', 'sqlite', 'epic.db')] = 'EBUSY';
  r = removeFiles(p, 'everything', { fs: w.fs, pathMod: w.P });
  assert.equal(r.failed.length, 1);
  assert.equal(r.seedRemoved, false);
  assert.equal(r.entrySafe, false);
  assert.equal(w.fs.has(p.seedFile), true);
  //the seed itself fails: reported, still listed
  w = world();
  p = plan(w, w.w1);
  w.fs.fail[p.seedFile] = 'EACCES';
  r = removeFiles(p, 'everything', { fs: w.fs, pathMod: w.P });
  assert.deepEqual(r.failed.map(f => f.error), ['EACCES']);
  assert.equal(r.entrySafe, false);
});

test('removeFiles refuses what the plan does not allow, and paths outside the folder', () => {
  const w = world();
  const p = plan(w, w.w2);
  assert.throws(() => removeFiles(p, 'everything', { fs: w.fs, pathMod: w.P }), /entirely/);
  assert.throws(() => removeFiles(plan(w, w.w1, { running: [{ pid: 1 }] }), 'app', { fs: w.fs, pathMod: w.P }), /may not/);
  assert.throws(() => removeFiles(p, 'nuke', { fs: w.fs, pathMod: w.P }), /unknown/);
  assert.deepEqual(removeFiles(p, 'list', { fs: w.fs, pathMod: w.P }), { removed: [], failed: [], dirRemoved: false, seedRemoved: false, entrySafe: true });
  //a plan changed by hand: a file outside and the folder itself are refused
  const bad = { ...plan(w, w.w1), appFiles: [w.P.join(w.old, 'wallet_data', 'wallet.seed'), w.w1.configDir, w.P.join(w.w1.configDir, '..', 'w2', 'WALLET.txt')] };
  const r = removeFiles(bad, 'app', { fs: w.fs, pathMod: w.P });
  assert.equal(r.failed.length, 3);
  assert.ok(r.failed.every(f => f.error.startsWith('outside')));
  assert.equal(w.fs.has(w.P.join(w.old, 'wallet_data', 'wallet.seed')), true);
  assert.equal(w.fs.has(w.P.join(w.w2.configDir, 'WALLET.txt')), true);
  assert.equal(w.fs.calls.length, 0);
});

/* --- a real folder (TMPDIR): real symlinks, configService and the importer --- */

function realWorld(t, fsUsed = realFs) {
  const home = realFs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'removal-'));
  t.after(() => realFs.rmSync(home, { recursive: true, force: true }));
  const root = path.join(home, '.epic-gui');
  const l = layout(root, path);
  const legacy = legacyPaths({ platform: 'linux', home, appData: path.join(home, '.config'), pathMod: path });
  const paths = { root, source: 'env', settingsFile: l.settingsFile, walletsDir: l.walletsDir, userData: l.userData, logsDir: l.logsDir, processesFile: l.processesFile, legacy };
  const nodeChildProcess = { owned: [], ownedProcesses: async (roles, opts) => { nodeChildProcess.last = { roles, opts }; if (nodeChildProcess.throws) throw new Error('ps failed'); return nodeChildProcess.owned; } };
  const cs = new ConfigService({ emit() {} }, { fs: fsUsed, pathMod: path, paths, resourcePath: RESOURCES, platform: 'linux', arch: 'x64', nodeChildProcess, isPortReachable: async () => false });
  /* what Create does: folders, epic-wallet init (the seed), registerWallet */
  const create = (origin = 'created', label = 'Savings') => {
    const dirs = cs.newWalletDirs('mainnet');
    realFs.mkdirSync(path.join(dirs.dataDir, 'wallet_data', 'db'), { recursive: true });
    realFs.writeFileSync(path.join(dirs.dataDir, 'wallet_data', 'wallet.seed'), 'seed');
    realFs.writeFileSync(path.join(dirs.dataDir, 'wallet_data', 'db', 'data.mdb'), 'db');
    realFs.writeFileSync(path.join(dirs.configDir, '.owner_api_secret'), 's');
    realFs.writeFileSync(path.join(dirs.configDir, 'epic-wallet.log'), 'log');
    return cs.registerWallet({ ...dirs, network: 'mainnet', origin, label });
  };
  return { home, root, l, cs, nodeChildProcess, create, legacy };
}

test('real fs: a symlink inside wallet_data is unlinked, its target untouched', async (t) => {
  const { home, cs, create } = realWorld(t);
  const w = create();
  const outside = path.join(home, 'precious');
  realFs.mkdirSync(outside);
  realFs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  realFs.symlinkSync(outside, path.join(w.dataDir, 'wallet_data', 'link-to-dir'));
  realFs.symlinkSync(path.join(outside, 'keep.txt'), path.join(w.configDir, 'x.tmp'));
  const r = await cs.removeWallet(w.id, 'everything');
  assert.deepEqual(r.failed, []);
  assert.equal(r.ok, true);
  assert.equal(realFs.existsSync(w.configDir), false);
  assert.equal(realFs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
});

test('configService.removeWallet: create → remove (everything / app / list) → create again gets a new id and a working folder', async (t) => {
  const { cs, create, nodeChildProcess, l } = realWorld(t);
  const w1 = create();
  assert.equal(w1.id, 'w1');
  let r = await cs.removeWallet('w1', 'everything');
  assert.equal(r.ok, true);
  assert.equal(r.entryRemoved, true);
  assert.equal(realFs.existsSync(l.walletDir('w1')), false);
  assert.deepEqual(cs.settings.wallets(), []);
  assert.equal(cs.settings.defaultWalletId(), '');
  //the process scan was for this wallet's folders
  assert.deepEqual(nodeChildProcess.last, { roles: ['owner_api', 'listen', 'scan', 'epicbox'], opts: { dir: w1.configDir, tor: true, torDirs: [w1.dataDir] } });
  //after a reload too: nothing left in settings.json, the id is not used again
  cs.settings.load();
  assert.deepEqual(cs.settings.wallets(), []);
  const w2 = create('restored', 'Savings');
  assert.equal(w2.id, 'w2');
  assert.equal(cs.startCheck('w2'), 'login');

  //'app': wallet_data stays (so the folder stays), the next wallet skips it
  r = await cs.removeWallet('w2', 'app');
  assert.equal(r.ok, true);
  assert.deepEqual(realFs.readdirSync(l.walletDir('w2')), ['wallet_data']);
  assert.deepEqual(cs.settings.wallets(), []);
  const w3 = create();
  assert.equal(w3.id, 'w3');
  assert.equal(cs.startCheck('w3'), 'login');
  //the kept folder opens again as a wallet
  const again = cs.openExistingWallet(l.walletDir('w2'), 'mainnet');
  assert.equal(again.ok, true);
  assert.equal(again.wallet.id, 'w4');

  //'list': every file stays
  r = await cs.removeWallet('w3', 'list');
  assert.equal(r.ok, true);
  assert.ok(realFs.existsSync(path.join(l.walletDir('w3'), 'wallet_data', 'wallet.seed')));
  assert.ok(realFs.existsSync(path.join(l.walletDir('w3'), 'epic-wallet.toml')));
  assert.deepEqual(cs.settings.wallets().map(w => w.id), ['w4']);
  assert.equal(cs.settings.defaultWalletId(), 'w4');
});

test('configService.removeWallet refuses while a process of ours uses the wallet, or when the scan fails', async (t) => {
  const { cs, create, nodeChildProcess } = realWorld(t);
  const w = create();
  nodeChildProcess.owned = [{ pid: 4242, role: 'listen', dir: w.configDir }];
  let r = await cs.removeWallet(w.id, 'everything');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'running');
  assert.ok(realFs.existsSync(path.join(w.dataDir, 'wallet_data', 'wallet.seed')));
  assert.equal(cs.settings.wallets().length, 1);
  nodeChildProcess.owned = [];
  nodeChildProcess.throws = true;
  r = await cs.removeWallet(w.id, 'app');
  assert.equal(r.reason, 'running');
  //the list only needs no scan
  r = await cs.removeWallet(w.id, 'list');
  assert.equal(r.ok, true);
  //the open wallet: refused
  nodeChildProcess.throws = false;
  const w2 = create();
  r = await cs.removeWallet(w2.id, 'list', { openId: w2.id });
  assert.equal(r.reason, 'open');
  assert.equal(cs.settings.wallets().length, 1);
});

test('settingsStore.removeWallet: drops the imported decision and moves defaultWallet; nextId stays; a failed save changes nothing', () => {
  const files = new Map();
  let failWrites = false;
  const fs = {
    existsSync: (p) => files.has(p),
    readFileSync: (p) => { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p); },
    writeFileSync: (p, d) => { if (failWrites) throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); files.set(p, String(d)); },
    copyFileSync: (a, b) => files.set(b, files.get(a)),
    renameSync: (a, b) => { files.set(b, files.get(a)); files.delete(a); },
    unlinkSync: (p) => files.delete(p),
    mkdirSync: () => {},
  };
  const s = createSettingsStore({ fs, pathMod: path.posix, file: '/r/settings.json', wait: () => {} }).load();
  const imp = (id, dir, key) => ({ id, network: 'mainnet', configDir: '/r/wallets/' + id, dataDir: key, origin: 'imported', importedFrom: { app: '5.3.1', account: 'a', dir } });
  s.addWallet(imp('w1', '/h/.epic/alpha', '/h/.epic/alpha/main'));
  s.addWallet({ id: 'w2', network: 'mainnet', configDir: '/r/wallets/w2', dataDir: '/data/cli', origin: 'opened' });
  s.addWallet(imp('w3', '/h/.epic/beta', '/h/.epic/beta/main'));
  s.setLegacyDecision('/h/.epic/alpha', 'imported');
  s.setLegacyDecision('/h/.epic/beta', 'imported');
  s.setLegacyDecision('/h/.epic/gamma', 'fresh');
  s.setLegacyDecision('/data/cli', 'imported');
  s.setDefaultWallet('w1');

  //a failed save: still listed, still decided, in memory too
  failWrites = true;
  assert.equal(s.removeWallet('w1'), false);
  assert.deepEqual(s.wallets().map(w => w.id), ['w1', 'w2', 'w3']);
  assert.equal(s.legacyDecisions()['/h/.epic/alpha'], 'imported');
  assert.equal(s.defaultWalletId(), 'w1');
  failWrites = false;

  assert.equal(s.removeWallet('w1'), true);
  assert.deepEqual(Object.keys(s.legacyDecisions()).sort(), ['/data/cli', '/h/.epic/beta', '/h/.epic/gamma']);
  assert.equal(s.defaultWalletId(), 'w2');
  //by dataDir when there is no importedFrom
  s.removeWallet('w2');
  assert.deepEqual(Object.keys(s.legacyDecisions()).sort(), ['/h/.epic/beta', '/h/.epic/gamma']);
  //a decision another listed wallet still has is kept
  s.addWallet(imp('w4', '/h/.epic/beta', '/h/.epic/beta/main'));
  s.removeWallet('w3');
  assert.equal(s.legacyDecisions()['/h/.epic/beta'], 'imported');
  s.removeWallet('w4');
  assert.deepEqual(s.legacyDecisions(), { '/h/.epic/gamma': 'fresh' });
  assert.equal(s.defaultWalletId(), '');
  assert.equal(s.nextWalletId(), 'w5');
  //on disk too
  const again = createSettingsStore({ fs, pathMod: path.posix, file: '/r/settings.json' }).load();
  assert.deepEqual(again.wallets(), []);
  assert.equal(again.nextWalletId(), 'w5');
  assert.deepEqual(again.legacyDecisions(), { '/h/.epic/gamma': 'fresh' });
});

test('import → remove (list or app) → the old folder is listed by the scan again and imports again', async (t) => {
  const { home, cs, legacy, l } = realWorld(t);
  const oldDir = path.join(home, '.epic', 'alpha', 'main');
  realFs.mkdirSync(path.join(oldDir, 'wallet_data', 'db'), { recursive: true });
  realFs.writeFileSync(path.join(oldDir, 'wallet_data', 'wallet.seed'), 'old seed');
  realFs.writeFileSync(path.join(oldDir, 'epic-wallet.toml'), 'old toml');
  const users = [];
  const userService = { async removeUser() {}, async ensureUser(walletId, cols) { const u = { id: users.length + 1, account: walletId, ...cols }; users.push(u); return u; } };
  const addressbookService = { async getAddress() { return []; }, async addAddress() { return []; } };
  const legacyBridge = { async scan({ known }) { return { ...scanLegacy({ fs: realFs, pathMod: path, legacy, known }), profiles: [] }; } };
  const importer = createImporter({ configService: cs, userService, addressbookService, legacyBridge, fs: realFs, pathMod: path });

  for (const mode of ['list', 'app']) {
    const found = await importer.scan();
    assert.deepEqual(found.wallets.map(w => w.key), [oldDir], mode);
    const res = await importer.importWallets([oldDir]);
    assert.equal(res.failed.length, 0);
    const id = res.imported[0].walletId;
    assert.equal((await importer.scan()).wallets.length, 0, 'listed: not offered');
    const r = await cs.removeWallet(id, mode);
    assert.equal(r.ok, true, mode);
    assert.equal(realFs.existsSync(l.walletDir(id)), mode === 'list', mode);
    //the old wallet's files are as they were
    assert.equal(realFs.readFileSync(path.join(oldDir, 'wallet_data', 'wallet.seed'), 'utf8'), 'old seed');
    assert.equal(realFs.readFileSync(path.join(oldDir, 'epic-wallet.toml'), 'utf8'), 'old toml');
    assert.deepEqual(cs.settings.legacyDecisions(), {});
  }
  //the same old folder through Open a wallet folder works too
  const opened = cs.openExistingWallet(oldDir, 'mainnet');
  assert.equal(opened.ok, true);
  assert.equal(opened.wallet.id, 'w3');
});

/* fs as the renderer gets it through contextBridge: a Stats copy keeps its fields (mode) and loses
   its methods (isDirectory, isSymbolicLink) */
const bridgedFs = { ...realFs, lstatSync: (p) => ({ ...realFs.lstatSync(p) }) };

test('entryKind: methods when there, else the mode bits of a bridged copy', (t) => {
  const dir = realFs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'kind-'));
  t.after(() => realFs.rmSync(dir, { recursive: true, force: true }));
  realFs.writeFileSync(path.join(dir, 'f'), 'x');
  realFs.symlinkSync(path.join(dir, 'f'), path.join(dir, 'l'));
  for (const [name, kind] of [['', 'dir'], ['f', 'file'], ['l', 'link']]) {
    const st = realFs.lstatSync(path.join(dir, name));
    assert.equal(entryKind(st), kind);
    assert.equal(entryKind(bridgedFs.lstatSync(path.join(dir, name))), kind);
    assert.equal(typeof bridgedFs.lstatSync(path.join(dir, name)).isDirectory, 'undefined');
  }
  assert.equal(entryKind(null), null);
  assert.equal(entryKind({}), null);
});

test('bridged fs (contextBridge): every choice is offered and everything is removed, symlink target untouched', async (t) => {
  const { home, cs, create } = realWorld(t, bridgedFs);
  const w = create();
  const plan = await cs.removalPlan(w.id);
  assert.equal(plan.canList, true);
  assert.equal(plan.canAppFiles, true);
  assert.equal(plan.canEverything, true);
  const outside = path.join(home, 'precious');
  realFs.mkdirSync(outside);
  realFs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  realFs.symlinkSync(outside, path.join(w.dataDir, 'wallet_data', 'link-to-dir'));
  const r = await cs.removeWallet(w.id, 'everything');
  assert.deepEqual(r.failed, []);
  assert.equal(r.ok, true);
  assert.equal(realFs.existsSync(w.configDir), false);
  assert.equal(realFs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
});
