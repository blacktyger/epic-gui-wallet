// Tests for src/shared/tmpCleanup.js (the importer's temp copy removal): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import realFs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import {
  removeTmpDir, cleanLeftoverImport, cleanImportNow, importCopyNames, isInsideTmp, importTmpDir, AFTER_EXIT_CLEANER, spawnAfterExitCleaner,
} from '../src/shared/tmpCleanup.js';

const P = path.posix, W = path.win32;
const ROOT = '/home/jane/.epic-gui';
const DIR = '/home/jane/.epic-gui/tmp/import/legacy-profile-x';
const noSleep = async () => {};

/* fake fs: dirs is the set of existing paths; failures: errors rmSync throws before it succeeds */
function fakeFs(dirs, failures = []) {
  const calls = [];
  return {
    calls,
    existsSync: (p) => dirs.has(p),
    rmSync: (p) => {
      calls.push(p);
      const code = failures.shift();
      if (code) throw Object.assign(new Error(code), { code });
      dirs.delete(p);
    },
  };
}

test('removes after EBUSY twice', async () => {
  const fs = fakeFs(new Set([DIR]), ['EBUSY', 'EBUSY']);
  assert.equal(await removeTmpDir({ fs, path: P, root: ROOT, dir: DIR, sleep: noSleep }), true);
  assert.equal(fs.calls.length, 3);
});

test('always failing: false after the retries, no throw, logged once', async () => {
  const fs = fakeFs(new Set([DIR]), Array(50).fill('EPERM'));
  const logs = [];
  assert.equal(await removeTmpDir({ fs, path: P, root: ROOT, dir: DIR, retries: 4, sleep: noSleep, log: (m) => logs.push(m) }), false);
  assert.equal(fs.calls.length, 5);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /not removed.*EPERM/);
});

test('a non-retryable error stops at once', async () => {
  const fs = fakeFs(new Set([DIR]), ['EIO']);
  assert.equal(await removeTmpDir({ fs, path: P, root: ROOT, dir: DIR, sleep: noSleep }), false);
  assert.equal(fs.calls.length, 1);
});

test('refuses paths outside <root>/tmp', async () => {
  const fs = fakeFs(new Set());
  for (const dir of [ROOT, ROOT + '/tmp', ROOT + '/wallets/a', '/home/jane', '/', ROOT + '/tmp/../wallets', ROOT + '/tmpx/a', 'tmp/import', '', undefined]) {
    assert.equal(await removeTmpDir({ fs, path: P, root: ROOT, dir, sleep: noSleep }), false, String(dir));
  }
  assert.equal(fs.calls.length, 0);
  assert.equal(isInsideTmp(ROOT, importTmpDir(ROOT, P), P), true);
  assert.equal(isInsideTmp('C:\\Users\\j\\.epic-gui', 'C:\\Users\\j\\.epic-gui\\tmp\\import', W), true);
  assert.equal(isInsideTmp('C:\\Users\\j\\.epic-gui', 'C:\\Users\\j\\Documents', W), false);
});

/* on a real folder: a root with the importer's copies, an empty tmp/import, and someone's own files */
function realRoot() {
  const root = realFs.mkdtempSync(path.join(os.tmpdir(), 'tmpcleanup-'));
  const imp = importTmpDir(root, path);
  realFs.mkdirSync(path.join(imp, 'legacy-profile-a', 'GPUCache'), { recursive: true });
  realFs.writeFileSync(path.join(imp, 'legacy-profile-a', 'GPUCache', 'index'), 'x');
  realFs.mkdirSync(path.join(imp, 'legacy-profile-b'));
  return { root, imp, done: () => realFs.rmSync(root, { recursive: true, force: true }) };
}

test('at start: the importer\'s copies go, then tmp/import and tmp once empty; absent is fine', async () => {
  const r = realRoot();
  try {
    const logs = [];
    assert.equal(await cleanLeftoverImport({ fs: realFs, path, root: r.root, sleep: noSleep, log: (m) => logs.push(m) }), true);
    assert.equal(realFs.existsSync(path.join(r.root, 'tmp')), false);
    assert.equal(logs.length, 2);
    assert.equal(await cleanLeftoverImport({ fs: realFs, path, root: r.root, sleep: noSleep }), true);
  } finally { r.done(); }
});

test('at start: nothing but legacy-profile-* is removed (a root that is someone\'s own folder)', async () => {
  const r = realRoot();
  try {
    realFs.writeFileSync(path.join(r.imp, 'mine.txt'), 'keep');
    assert.equal(await cleanLeftoverImport({ fs: realFs, path, root: r.root, sleep: noSleep }), true);
    assert.deepEqual(realFs.readdirSync(r.imp), ['mine.txt']);
    assert.equal(await cleanLeftoverImport({ fs: realFs, path, root: 'relative/root', sleep: noSleep }), false);
  } finally { r.done(); }
});

test('at quit: cleanImportNow removes the copies and the empty folders, true when none is left', () => {
  const r = realRoot();
  try {
    assert.equal(cleanImportNow({ fs: realFs, path, root: r.root }), true);
    assert.equal(realFs.existsSync(path.join(r.root, 'tmp')), false);
    assert.equal(cleanImportNow({ fs: realFs, path, root: r.root }), true);
  } finally { r.done(); }
  const locked = { ...fakeFs(new Set([importTmpDir(ROOT, P), DIR]), Array(5).fill('EBUSY')), readdirSync: () => ['legacy-profile-x'], rmdirSync: () => {} };
  assert.equal(cleanImportNow({ fs: locked, path: P, root: ROOT }), false);
});

test('after exit: the cleaner waits for the pid to go, then removes only the copies named to it', async () => {
  const r = realRoot();
  try {
    realFs.mkdirSync(path.join(r.imp, 'legacy-profile-next'));   //a next start's copy: not named, kept
    realFs.writeFileSync(path.join(r.imp, 'mine.txt'), 'keep');
    assert.deepEqual(importCopyNames({ fs: realFs, path, root: r.root }).sort(), ['legacy-profile-a', 'legacy-profile-b', 'legacy-profile-next']);
    //a process that lives about a second: the cleaner must wait for it
    const app = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1000)']);
    const started = Date.now();
    //run without blocking this process, so it reaps the app child when that exits
    const status = await new Promise((resolve) => {
      const c = spawn(process.execPath, ['-e', AFTER_EXIT_CLEANER, String(app.pid), r.root,
        'legacy-profile-a', 'legacy-profile-b', '../x', 'legacy-profile-../..', 'legacy-profile-a/..', 'mine.txt'], { timeout: 20000 });
      c.on('exit', resolve);
    });
    assert.equal(status, 0);
    assert.ok(Date.now() - started >= 700, 'waited for the app to exit');
    assert.deepEqual(realFs.readdirSync(r.imp).sort(), ['legacy-profile-next', 'mine.txt']);
    assert.ok(realFs.existsSync(r.root));
  } finally { r.done(); }
});

test('after exit: tmp/import and tmp go once empty; no names: nothing is done', () => {
  const r = realRoot();
  try {
    const gone = spawnSync(process.execPath, ['-e', '0']).pid;
    spawnSync(process.execPath, ['-e', AFTER_EXIT_CLEANER, String(gone), r.root], { timeout: 20000 });
    assert.equal(realFs.readdirSync(r.imp).length, 2);
    spawnSync(process.execPath, ['-e', AFTER_EXIT_CLEANER, String(gone), r.root, 'legacy-profile-a', 'legacy-profile-b'], { timeout: 20000 });
    assert.equal(realFs.existsSync(path.join(r.root, 'tmp')), false);
  } finally { r.done(); }
});

test('spawnAfterExitCleaner: detached, the app binary as node, the names passed; none: not started; never throws', () => {
  const calls = [];
  const spawnFn = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { on() {}, unref() {} }; };
  assert.equal(spawnAfterExitCleaner({ spawn: spawnFn, execPath: '/opt/app/epic', pid: 42, root: ROOT, names: ['legacy-profile-x'], env: { A: '1' } }), true);
  assert.equal(calls[0].cmd, '/opt/app/epic');
  assert.deepEqual(calls[0].args.slice(2), ['42', ROOT, 'legacy-profile-x']);
  assert.equal(calls[0].opts.detached, true);
  assert.equal(calls[0].opts.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(calls[0].opts.env.A, '1');
  assert.equal(spawnAfterExitCleaner({ spawn: spawnFn, execPath: 'x', pid: 1, root: ROOT }), false);
  assert.equal(calls.length, 1);
  assert.equal(spawnAfterExitCleaner({ spawn: () => { throw new Error('no'); }, execPath: 'x', pid: 1, root: ROOT, names: ['legacy-profile-x'] }), false);
});
