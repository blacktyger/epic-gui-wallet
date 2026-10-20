// Tests for src/shared/folderLock.js: is another program using a folder, by trying its lock. `npm test`.
// The decision logic runs on fakes everywhere; on Linux real locks are taken by a child process
// (python3: flock, and fcntl byte-range locks as LMDB and SQLite take them) and the real probe
// (perl, and /proc/locks) has to see each, take none and create nothing.
/* global BigInt */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { lockFiles, overall, parseProbe, parseProcLocks, devParts, procLocked, createFolderLock, PERL_PROBE, PS_PROBE }
  from '../src/shared/folderLock.js';

/* a fake fs: files (path → true), dirs (path → 'dir') */
function fakeFs(entries) {
  const has = (p) => Object.prototype.hasOwnProperty.call(entries, p);
  return {
    existsSync: (p) => has(p),
    statSync: (p) => {
      if (!has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return { isFile: () => entries[p] !== 'dir' };
    },
    readFileSync: () => { throw new Error('no /proc here'); },
  };
}

test('lockFiles: the files and ranges per kind', () => {
  const P = path.posix;
  assert.deepEqual(lockFiles('chain', '/c', P), [
    { file: '/c/epic.lock', how: 'flock', range: [0, 1] },
    { file: '/c/lmdb/lock.mdb', how: 'fcntl', range: [0, 1] },
    { file: '/c/peer/lock.mdb', how: 'fcntl', range: [0, 1] },
  ]);
  const w = lockFiles('wallet', '/w', P);
  assert.deepEqual(w.slice(0, 3), [
    { file: '/w/wallet_data/db/sqlite/epic.db', how: 'fcntl', range: [0x40000002, 510] },
    { file: '/w/wallet_data/db/sqlite/epic.db-shm', how: 'fcntl', range: [128, 1] },
    { file: '/w/wallet_data/db/lmdb/lock.mdb', how: 'fcntl', range: [0, 1] },
  ]);
  //a chain_data in the wallet folder is not asked about: the app's own node may run on it (review)
  assert.equal(w.length, 3);
  assert.ok(!w.some(t => t.file.includes('chain_data')));
  assert.equal(lockFiles('chain', 'C:\\x\\chain_data', path.win32)[0].file, 'C:\\x\\chain_data\\epic.lock');
  assert.throws(() => lockFiles('home', '/h', P));
});

test('overall: locked wins, then unknown', () => {
  assert.equal(overall([]), 'free');
  assert.equal(overall(['free', 'free']), 'free');
  assert.equal(overall(['free', 'unknown']), 'unknown');
  assert.equal(overall(['unknown', 'locked', 'free']), 'locked');
});

test('parseProbe: per file; missing is free, error and anything unreadable unknown', () => {
  assert.deepEqual(parseProbe('0 free\n1 locked\n2 missing\n3 error 13\n', 5), ['free', 'locked', 'free', 'unknown', 'unknown']);
  assert.deepEqual(parseProbe('0 locked\r\n', 1), ['locked']);
  assert.deepEqual(parseProbe('garbage\n7 locked\n0 freely', 2), ['unknown', 'unknown']);
  assert.deepEqual(parseProbe(undefined, 1), ['unknown']);
});

test('the helper scripts: no shell, paths never in the script text', () => {
  assert.ok(!PERL_PROBE.includes('${'));
  assert.match(PERL_PROBE, /LOCK_EX \| LOCK_NB/);
  assert.match(PERL_PROBE, /flock\(\$fh, LOCK_UN\)/, 'a flock that was taken is released at once');
  assert.match(PERL_PROBE, /F_GETLK/);
  assert.doesNotMatch(PERL_PROBE, /O_CREAT|O_TRUNC|unlink|F_SETLK\b/);
  assert.match(PS_PROBE, /\$env:EPIC_FOLDER_LOCK/);
  assert.match(PS_PROBE, /FileMode\]::Open,/);
  assert.match(PS_PROBE, /\.Unlock\(/);
  assert.doesNotMatch(PS_PROBE, /OpenOrCreate|Create\b|Delete\(|Truncate/);
});

test('/proc/locks: parsed by device and inode; waiters skipped; device 0:x matched by inode', () => {
  const text = [
    '94: FLOCK  ADVISORY  WRITE 211763 103:0a:13641998 0 EOF',
    '93: POSIX  ADVISORY  READ 211763 103:0a:13642000 0 0',
    '93: -> POSIX  ADVISORY  WRITE 5 103:0a:777 0 0',
    '12: OFDLCK ADVISORY  READ -1 00:2f:55 128 128',
  ].join('\n');
  const e = parseProcLocks(text);
  assert.deepEqual(e.map(x => [x.type, x.major, x.minor, x.ino]), [['FLOCK', 0x103, 0x0a, 13641998n], ['POSIX', 0x103, 0x0a, 13642000n], ['OFDLCK', 0, 0x2f, 55n]]);
  assert.deepEqual(devParts(0x1030a), { major: 0x103, minor: 0x0a });
  assert.deepEqual(devParts(0x0001200000034567n), { major: 0x12345, minor: 0x67 }, 'large majors (glibc encoding)');
  const st = (dev, ino) => ({ dev: BigInt(dev), ino: BigInt(ino) });
  assert.equal(procLocked(e, st(0x1030a, 13641998), 'flock'), true);
  assert.equal(procLocked(e, st(0x1030a, 13641998), 'fcntl'), false, 'a flock is not an fcntl lock');
  assert.equal(procLocked(e, st(0x1030a, 13642000), 'fcntl'), true);
  assert.equal(procLocked(e, st(0x1030b, 13642000), 'fcntl'), false, 'another device');
  assert.equal(procLocked(e, st(0x1030a, 777), 'fcntl'), false, 'a waiter holds nothing');
  assert.equal(procLocked(e, st(0x31, 55), 'fcntl'), true, 'btrfs/overlay: inode only');
});

const run = (file, args, opts) => new Promise((resolve, reject) => {
  execFile(file, args, opts, (err, stdout) => err ? reject(err) : resolve({ stdout }));
});

test('check: a lock file that can\'t be read (EACCES) is unknown, not missing (review)', async () => {
  const db = '/w/wallet_data/db/sqlite/epic.db';
  const fs = { existsSync: () => false,
    statSync: (p) => { throw Object.assign(new Error(p === db ? 'EACCES' : 'ENOENT'), { code: p === db ? 'EACCES' : 'ENOENT' }); } };
  const fl = createFolderLock({ fs, pathMod: path.posix, platform: 'linux', run: async () => ({ stdout: '' }) });
  assert.deepEqual(await fl.check('wallet', '/w'), { state: 'unknown', files: [{ file: db, state: 'unknown' }], via: 'none' });
});

test('check: nothing to ask about → free without running anything; bad input → unknown', async () => {
  const calls = [];
  const fl = createFolderLock({ fs: fakeFs({}), pathMod: path.posix, platform: 'linux', run: async (...a) => { calls.push(a); return { stdout: '' }; } });
  assert.deepEqual(await fl.check('wallet', '/w'), { state: 'free', files: [], via: 'none' });
  assert.equal((await fl.check('wallet', 'relative')).state, 'unknown');
  assert.equal((await fl.check('elsewhere', '/w')).state, 'unknown');
  assert.equal((await fl.check('chain', '')).state, 'unknown');
  assert.equal(calls.length, 0);
});

test('check on Linux/macOS: perl with flock:/fcntl: arguments; answers mapped per file', async () => {
  const calls = [];
  const files = { '/usr/bin/perl': true, '/c/epic.lock': true, '/c/lmdb/lock.mdb': true };
  const fl = createFolderLock({ fs: fakeFs(files), pathMod: path.posix, platform: 'darwin', env: { PATH: '/usr/bin', SECRET: 'x' },
    run: async (file, args, opts) => { calls.push({ file, args, opts }); return { stdout: '0 locked\n1 free\n' }; } });
  const r = await fl.check('chain', '/c');
  assert.equal(r.state, 'locked');
  assert.equal(r.via, 'perl');
  assert.deepEqual(r.files, [{ file: '/c/epic.lock', state: 'locked' }, { file: '/c/lmdb/lock.mdb', state: 'free' }]);
  assert.equal(calls[0].file, '/usr/bin/perl');
  assert.deepEqual(calls[0].args.slice(0, 2), ['-e', PERL_PROBE]);
  assert.deepEqual(calls[0].args.slice(2), ['--', 'flock:/c/epic.lock', 'fcntl:/c/lmdb/lock.mdb']);
  assert.deepEqual(calls[0].opts.env, { PATH: '/usr/bin', LC_ALL: 'C' }, 'the environment is not passed on');
  assert.ok(calls[0].opts.timeout > 0);
});

test('check: the helper fails → /proc/locks on Linux, unknown elsewhere (fail safe)', async () => {
  const files = { '/c/epic.lock': true };
  const fail = async () => { throw Object.assign(new Error('spawn perl ENOENT'), { code: 'ENOENT' }); };
  const logs = [];
  let fl = createFolderLock({ fs: fakeFs(files), pathMod: path.posix, platform: 'darwin', run: fail, log: (m) => logs.push(m) });
  assert.deepEqual(await fl.check('chain', '/c'), { state: 'unknown', files: [{ file: '/c/epic.lock', state: 'unknown' }], via: 'none' });
  assert.match(logs[0], /ENOENT/);
  //Linux: /proc/locks (here: unreadable too) → unknown
  fl = createFolderLock({ fs: fakeFs(files), pathMod: path.posix, platform: 'linux', run: fail });
  assert.equal((await fl.check('chain', '/c')).state, 'unknown');
  //Linux: /proc/locks readable
  const procFs = { ...fakeFs(files), readFileSync: () => '1: FLOCK  ADVISORY  WRITE 9 103:0a:42 0 EOF\n',
    statSync: (p, o) => { if (p !== '/c/epic.lock') throw new Error('ENOENT'); return o && o.bigint ? { dev: 0x1030an, ino: 42n } : { isFile: () => true }; } };
  fl = createFolderLock({ fs: procFs, pathMod: path.posix, platform: 'linux', run: fail });
  assert.deepEqual(await fl.check('chain', '/c'), { state: 'locked', files: [{ file: '/c/epic.lock', state: 'locked' }], via: 'proc' });
  //garbled output: unknown, not free
  fl = createFolderLock({ fs: fakeFs(files), pathMod: path.posix, platform: 'darwin', run: async () => ({ stdout: 'Can\'t locate Fcntl.pm' }) });
  assert.equal((await fl.check('chain', '/c')).state, 'unknown');
});

test('check: a lock file that is a folder, or can\'t be read: unknown', async () => {
  const fl = createFolderLock({ fs: fakeFs({ '/c/epic.lock': 'dir' }), pathMod: path.posix, platform: 'linux', run: async () => ({ stdout: '' }) });
  assert.deepEqual(await fl.check('chain', '/c'), { state: 'unknown', files: [{ file: '/c/epic.lock', state: 'unknown' }], via: 'none' });
});

test('check on Windows: PowerShell by its full path, the files and ranges as JSON in the environment', async () => {
  const W = path.win32;
  const dir = 'D:\\Old Wallet\'s; $(evil)';
  const db = W.join(dir, 'wallet_data', 'db', 'sqlite', 'epic.db');
  const calls = [];
  const fl = createFolderLock({ fs: fakeFs({ [db]: true, [db + '-shm']: true }), pathMod: W, platform: 'win32', env: { SystemRoot: 'C:\\Windows', PATH: 'x' },
    run: async (file, args, opts) => { calls.push({ file, args, opts }); return { stdout: '0 free\r\n1 locked\r\n' }; } });
  const r = await fl.check('wallet', dir);
  assert.equal(r.state, 'locked');
  assert.equal(r.via, 'powershell');
  const c = calls[0];
  assert.equal(c.file, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(c.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
  assert.ok(!c.args.includes('Bypass'), 'no execution policy bypass (it is for script files only)');
  assert.equal(Buffer.from(c.args[3], 'base64').toString('utf16le'), PS_PROBE, 'the script is fixed: no path in it');
  assert.deepEqual(JSON.parse(c.opts.env.EPIC_FOLDER_LOCK), { items: [{ f: db, s: 0x40000002, n: 510 }, { f: db + '-shm', s: 128, n: 1 }] });
  assert.ok(c.opts.timeout >= 10000, 'PowerShell can be slow to start');
});

/* --- Linux: real locks --- */

const linux = process.platform === 'linux';
const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
const real = linux && has('python3') && has('perl');
const realRun = (file, args, opts) => run(file, args, opts);

/* a child process holding a lock until released: how 'flock' | [start, length] (an fcntl read lock) */
async function hold(t, file, how) {
  const py = [
    'import fcntl, sys',
    'f = open(sys.argv[1], "rb")',
    'how = sys.argv[2]',
    'fcntl.flock(f, fcntl.LOCK_EX) if how == "flock" else fcntl.lockf(f, fcntl.LOCK_SH, int(sys.argv[3]), int(sys.argv[2]), 0)',
    'print("ready", flush=True)',
    'sys.stdin.read()',
  ].join('\n');
  const args = how === 'flock' ? ['-c', py, file, 'flock'] : ['-c', py, file, String(how[0]), String(how[1])];
  const p = spawn('python3', args, { stdio: ['pipe', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => { if (String(d).includes('ready')) resolve(); });
    p.on('exit', (code) => reject(new Error('holder exited ' + code)));
  });
  const release = () => new Promise((resolve) => { if (p.exitCode !== null) return resolve(); p.on('exit', resolve); p.stdin.end(); });
  t.after(release);
  return { pid: p.pid, release };
}

function tmpDir(t) {
  const d = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'folderlock-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}
const touch = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ''); };
const listing = (d) => fs.readdirSync(d, { recursive: true }).sort();
const procLocksOf = (f) => { const ino = String(fs.statSync(f).ino); return fs.readFileSync('/proc/locks', 'utf8').split('\n').filter(l => l.includes(':' + ino + ' ')); };

for (const via of ['perl', 'proc']) {
  const mk = () => createFolderLock({ fs, pathMod: path, platform: 'linux', env: process.env,
    run: via === 'perl' ? realRun : async () => { throw new Error('no perl'); } });

  test(`Linux (${via}): a node's chain_data: the flock on epic.lock, LMDB's fcntl lock on lock.mdb; free after; nothing created or kept`, { skip: !real && 'Linux with python3 and perl only' }, async (t) => {
    const chain = path.join(tmpDir(t), 'chain_data');
    const lock = path.join(chain, 'epic.lock'), mdb = path.join(chain, 'lmdb', 'lock.mdb');
    touch(lock); touch(mdb);
    const before = listing(chain);
    const fl = mk();
    assert.deepEqual(await fl.check('chain', chain), { state: 'free', files: [{ file: lock, state: 'free' }, { file: mdb, state: 'free' }], via });

    const node = await hold(t, lock, 'flock');
    let r = await fl.check('chain', chain);
    assert.equal(r.state, 'locked');
    assert.deepEqual(r.files.map(f => f.state), ['locked', 'free'], 'a flock is not seen as an fcntl lock, nor the other way');
    //the probe took nothing from the holder: still its lock, and still seen the second time
    assert.equal((await fl.check('chain', chain)).state, 'locked');
    assert.equal(procLocksOf(lock).length, 1);
    await node.release();
    assert.equal((await fl.check('chain', chain)).state, 'free');

    const lmdb = await hold(t, mdb, [0, 1]);
    r = await fl.check('chain', chain);
    assert.deepEqual(r.files.map(f => f.state), ['free', 'locked']);
    await lmdb.release();
    assert.equal((await fl.check('chain', chain)).state, 'free');

    //no lock left behind: none on either file, and an exclusive flock can be taken
    assert.deepEqual([...procLocksOf(lock), ...procLocksOf(mdb)], []);
    assert.equal(spawnSync('python3', ['-c', 'import fcntl,sys; fcntl.flock(open(sys.argv[1],"rb"), fcntl.LOCK_EX|fcntl.LOCK_NB)', lock]).status, 0);
    //nothing created (peer/lock.mdb was never there), nothing removed: the lock files stay
    assert.deepEqual(listing(chain), before);
  });

  test(`Linux (${via}): a wallet's SQLite database: the SHARED range of epic.db and the -shm DMS byte`, { skip: !real && 'Linux with python3 and perl only' }, async (t) => {
    const w = tmpDir(t);
    const db = path.join(w, 'wallet_data', 'db', 'sqlite', 'epic.db');
    touch(db); touch(db + '-shm');
    const before = listing(w);
    const fl = mk();
    assert.equal((await fl.check('wallet', w)).state, 'free');
    let h = await hold(t, db, [0x40000002, 510]);
    assert.deepEqual((await fl.check('wallet', w)).files.map(f => f.state), ['locked', 'free']);
    await h.release();
    h = await hold(t, db + '-shm', [128, 1]);
    assert.deepEqual((await fl.check('wallet', w)).files.map(f => f.state), ['free', 'locked']);
    await h.release();
    assert.equal((await fl.check('wallet', w)).state, 'free');
    assert.deepEqual(listing(w), before);
  });
}
