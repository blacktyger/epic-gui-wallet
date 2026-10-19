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

/* at start: remove a leftover <root>/tmp/import from an earlier run, independent of any import */
export async function cleanLeftoverImport({ fs, path, root, log = () => {}, ...opts }) {
  const dir = importTmpDir(root, path);
  if (!fs.existsSync(dir)) return true;
  const ok = await removeTmpDir({ fs, path, root, dir, log, ...opts });
  if (ok) log('removed leftover import temp dir: ' + dir);
  return ok;
}
