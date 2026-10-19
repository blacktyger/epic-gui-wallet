// Tests for src/shared/tmpCleanup.js (the importer's temp copy removal): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { removeTmpDir, cleanLeftoverImport, isInsideTmp, importTmpDir } from '../src/shared/tmpCleanup.js';

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

test('leftover <root>/tmp/import is removed at start; absent is fine', async () => {
  const imp = importTmpDir(ROOT, P);
  const fs = fakeFs(new Set([imp]), ['EBUSY']);
  const logs = [];
  assert.equal(await cleanLeftoverImport({ fs, path: P, root: ROOT, sleep: noSleep, log: (m) => logs.push(m) }), true);
  assert.deepEqual(fs.calls, [imp, imp]);
  assert.equal(fs.existsSync(imp), false);
  const none = fakeFs(new Set());
  assert.equal(await cleanLeftoverImport({ fs: none, path: P, root: ROOT, sleep: noSleep }), true);
  assert.equal(none.calls.length, 0);
});
