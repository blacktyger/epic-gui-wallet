/*
 * Removes the importer's temp copy (<root>/tmp/import) reliably. On Windows a LevelDB/IndexedDB
 * copy can stay locked for a moment after its session is closed (EBUSY / EPERM / ENOTEMPTY), so
 * the removal is retried. Never throws; returns true when the dir is gone.
 * Only paths strictly inside <root>/tmp are accepted, so a bad argument can't touch anything else.
 * Plain ESM, every dependency passed in: tests/tmpCleanup.test.js.
 */

export const RETRY_CODES = ['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES'];

export function importTmpDir(root, pathMod) {
  return pathMod.join(root, 'tmp', 'import');
}

/* true only for a path below <root>/tmp (not <root>/tmp itself) */
export function isInsideTmp(root, dir, pathMod) {
  if (typeof root !== 'string' || typeof dir !== 'string' || !root || !dir) return false;
  if (!pathMod.isAbsolute(root) || !pathMod.isAbsolute(dir)) return false;
  const rel = pathMod.relative(pathMod.join(root, 'tmp'), pathMod.resolve(dir));
  return !!rel && rel !== '..' && !rel.startsWith('..' + pathMod.sep) && !pathMod.isAbsolute(rel);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* → true when removed (or already absent), false when it could not be removed */
export async function removeTmpDir({ fs, path, root, dir, retries = 8, delayMs = 250, sleep = wait, log = () => {} }) {
  if (!isInsideTmp(root, dir, path)) { log('temp cleanup refused, outside ' + root + '/tmp: ' + dir); return false; }
  let last = null;
  for (let i = 0; i <= retries; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      if (!fs.existsSync(dir)) return true;
      last = new Error('still exists');
    } catch (e) {
      last = e;
      if (!e || !RETRY_CODES.includes(e.code)) break;
    }
    if (i < retries) await sleep(delayMs * (i + 1));
  }
  log('temp copy not removed: ' + dir + ' (' + (last && (last.code || last.message)) + ')');
  return false;
}

//the importer's copies in <root>/tmp/import (legacyProfile.js); nothing else there is ever removed
export const PROFILE_PREFIX = 'legacy-profile-';

const rootOk = (root, pathMod) => typeof root === 'string' && !!root && pathMod.isAbsolute(root);

/* rmdir dir only when it is empty; never throws */
function removeIfEmpty(fs, dir) {
  try {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch (e) { /* in use or not empty: left */ }
}

/* <root>/tmp/import, then <root>/tmp, each only when empty: the importer leaves no empty folders */
export function removeEmptyImportDirs({ fs, path, root }) {
  if (!rootOk(root, path)) return;
  removeIfEmpty(fs, importTmpDir(root, path));
  removeIfEmpty(fs, path.join(root, 'tmp'));
}

/* the importer's copies now in <root>/tmp/import (legacy-profile-*), [] if none */
function leftoverCopies(fs, path, root) {
  const dir = importTmpDir(root, path);
  try {
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.startsWith(PROFILE_PREFIX)).map((n) => path.join(dir, n)) : [];
  } catch (e) {
    return [];
  }
}

/* at start: remove the importer's copies left by an earlier run, then the folders once empty.
   → true when no copy is left */
export async function cleanLeftoverImport({ fs, path, root, log = () => {}, ...opts }) {
  if (!rootOk(root, path)) return false;
  let ok = true;
  for (const dir of leftoverCopies(fs, path, root)) {
    const removed = await removeTmpDir({ fs, path, root, dir, log, ...opts });
    if (removed) log('removed leftover import temp dir: ' + dir);
    ok = ok && removed;
  }
  removeEmptyImportDirs({ fs, path, root });
  return ok;
}

/* at quit, synchronously, one try each: → true when no copy is left */
export function cleanImportNow({ fs, path, root }) {
  if (!rootOk(root, path)) return true;
  let left = 0;
  for (const dir of leftoverCopies(fs, path, root)) {
    if (!isInsideTmp(root, dir, path)) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* locked */ }
    if (fs.existsSync(dir)) left++;
  }
  removeEmptyImportDirs({ fs, path, root });
  return left === 0;
}

/*
 * What is still locked at quit (Windows: the reading session keeps its leveldb open until the app
 * exits) is removed right after the app exits by this script, run detached by the app's own binary
 * as plain node (ELECTRON_RUN_AS_NODE) with the args <app pid> <root>: it waits for the pid to go
 * (at most a minute), then removes <root>/tmp/import/legacy-profile-* (20 tries, half a second
 * apart) and the two folders once empty. Anything it can't remove, the next start does.
 */
export const AFTER_EXIT_CLEANER = `
const fs = require('fs'), path = require('path');
const [pid, root] = process.argv.slice(1);
if (!root || !path.isAbsolute(root) || !(Number(pid) > 0)) process.exit(0);
const imp = path.join(root, 'tmp', 'import');
const alive = () => { try { process.kill(Number(pid), 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const started = Date.now();
let tries = 0;
const clean = () => {
  let left = 0, names = [];
  try { names = fs.readdirSync(imp); } catch (e) { names = []; }
  for (const n of names) {
    if (!n.startsWith(${JSON.stringify(PROFILE_PREFIX)})) continue;
    try { fs.rmSync(path.join(imp, n), { recursive: true, force: true }); } catch (e) { left++; }
  }
  for (const d of [imp, path.join(root, 'tmp')]) {
    try { if (fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch (e) {}
  }
  if (left && ++tries < 20) setTimeout(clean, 500);
};
const wait = () => (alive() && Date.now() - started < 60000 ? setTimeout(wait, 200) : clean());
wait();
`;

/* starts AFTER_EXIT_CLEANER detached (spawn: child_process.spawn, execPath: the app's binary); never throws */
export function spawnAfterExitCleaner({ spawn, execPath, pid, root, env = {}, log = () => {} }) {
  try {
    const child = spawn(execPath, ['-e', AFTER_EXIT_CLEANER, String(pid), root],
      { detached: true, stdio: 'ignore', windowsHide: true, env: { ...env, ELECTRON_RUN_AS_NODE: '1' } });
    if (child && typeof child.on === 'function') child.on('error', () => {});
    if (child && typeof child.unref === 'function') child.unref();
    return true;
  } catch (e) {
    log('import temp cleaner not started: ' + (e && e.message));
    return false;
  }
}
