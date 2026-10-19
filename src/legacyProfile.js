/*
 * Reads the contacts and per-account settings older GUIs kept in their Electron profile
 * (IndexedDB 'Epicwallet', stores 'User' and 'Addressbook', origin app://.), for the importer.
 * Main process. Electron is passed in, so mergeProfiles runs under `node --test`
 * (tests/legacyScan.test.js).
 *
 * The old profile is never opened in place: Chromium would take its LOCK, could compact or
 * upgrade the leveldb, and an old GUI may be running on it. Only <profile>/IndexedDB is copied to
 * a fresh temp dir, read through a throwaway session on that copy, and the copy deleted.
 */

//the only profiles read: productName up to 5.3.1, package name from 6.0.0 (appPaths.legacyPaths)
export const PROFILE_NAMES = [
  { app: '≤5.3.1', name: 'EpicWallet' },
  { app: '6.0+', name: 'epic-desktop-wallet' },
];
export const DB_NAME = 'Epicwallet';
const TIMEOUT_MS = 10000;

/* runs in the hidden page on the copy: opens the DB at whatever version it has (no version
   argument, so no upgrade), reads both stores, and aborts if the DB would be created */
const READ_SCRIPT = `new Promise((resolve) => {
  const out = { users: [], contacts: [], error: '' };
  const req = indexedDB.open(${JSON.stringify(DB_NAME)});
  req.onupgradeneeded = () => { out.error = 'no database'; req.transaction.abort(); };
  req.onerror = () => resolve(out.error ? out : { ...out, error: String(req.error && req.error.name) });
  req.onblocked = () => resolve({ ...out, error: 'blocked' });
  req.onsuccess = () => {
    const db = req.result;
    const stores = Array.from(db.objectStoreNames);
    const want = ['User', 'Addressbook'].filter((s) => stores.includes(s));
    if (!want.length) { db.close(); resolve(out); return; }
    const tx = db.transaction(want, 'readonly');
    const get = (s, key) => { if (want.includes(s)) tx.objectStore(s).getAll().onsuccess = (e) => { out[key] = e.target.result; }; };
    get('User', 'users');
    get('Addressbook', 'contacts');
    tx.oncomplete = () => { db.close(); resolve(out); };
    tx.onerror = () => { db.close(); resolve({ ...out, error: String(tx.error && tx.error.name) }); };
  };
})`;

function withTimeout(promise, ms, what) {
  let timer;
  const t = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(what + ': timed out')), ms); });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

async function readOne({ session, BrowserWindow, fs, path, tmpDir, profile, log }) {
  const src = path.join(profile.dir, 'IndexedDB');
  if (!fs.existsSync(src)) return null;
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(tmpDir, 'legacy-profile-'));
  let ses = null, win = null;
  try {
    //only the IndexedDB dir: no caches, cookies or local storage of the old app are copied
    fs.cpSync(src, path.join(tmp, 'IndexedDB'), { recursive: true });
    ses = session.fromPath(tmp, { cache: false });
    //a blank page on the old origin; IndexedDB is per origin, app://. → app_._0.indexeddb.leveldb
    ses.protocol.handle('app', () => new Response('<!doctype html><title></title>', { headers: { 'content-type': 'text/html' } }));
    win = new BrowserWindow({
      show: false,
      webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false, javascript: true },
    });
    const run = async () => {
      await win.loadURL('app://./legacy-profile');
      return win.webContents.executeJavaScript(READ_SCRIPT, true);
    };
    const res = await withTimeout(run(), TIMEOUT_MS, profile.dir);
    if (res.error) log('legacy profile ' + profile.dir + ': ' + res.error);
    return {
      app: profile.app, dir: profile.dir,
      users: Array.isArray(res.users) ? res.users : [],
      contacts: Array.isArray(res.contacts) ? res.contacts : [],
    };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    if (ses) {
      try { ses.protocol.unhandle('app'); } catch (e) { /* not handled yet */ }
      try { await ses.clearStorageData(); } catch (e) { /* nothing stored */ }
    }
    //the session may still hold the leveldb open on Windows: retry, then leave it in our temp dir
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch (e) { log('legacy profile: temp copy not removed: ' + tmp); }
  }
}

/*
 * electron: {session, BrowserWindow} from 'electron' (after app 'ready'; the app:// scheme must be
 * registered as privileged, as background.js does); fs, path: node's; tmpDir: a dir of ours
 * (<root>/tmp/import, under 6.1's own folder); profiles: appPaths.legacyPaths().profiles.
 * → [{app, dir, users, contacts}] for each profile that could be read; never throws.
 */
export async function readLegacyProfiles({ session, BrowserWindow, fs, path, tmpDir, profiles, log = () => {} }) {
  //Chromium recreates empty caches in a session's dir when it flushes at quit, after the copy was
  //deleted: remove those leftovers of earlier runs (only our own legacy-profile-* dirs in tmpDir)
  for (const n of (() => { try { return fs.readdirSync(tmpDir); } catch (e) { return []; } })()) {
    if (n.startsWith('legacy-profile-')) {
      try { fs.rmSync(path.join(tmpDir, n), { recursive: true, force: true }); } catch (e) { /* in use: next run */ }
    }
  }
  const out = [];
  for (const p of Array.isArray(profiles) ? profiles : []) {
    //never any other folder: the IPC caller can't point this at an arbitrary profile
    const known = PROFILE_NAMES.find(n => n.app === p.app && n.name === path.basename(p.dir || ''));
    if (!known || !path.isAbsolute(p.dir)) { log('legacy profile: not accepted: ' + p.dir); continue; }
    try {
      const r = await readOne({ session, BrowserWindow, fs, path, tmpDir, profile: p, log });
      if (r) out.push(r);
    } catch (e) {
      log('legacy profile ' + p.dir + ': ' + (e && e.message));
    }
  }
  return out;
}

const rank = (app) => PROFILE_NAMES.findIndex(n => n.app === app);

/*
 * profiles: readLegacyProfiles' output → Map account → {app, user, contacts}.
 * When both profiles have an account (5.x userData copied or reused by 6.0), the newer profile's
 * User row wins; contacts of both are kept, a contact with the same name and address once.
 */
export function mergeProfiles(profiles) {
  const out = new Map();
  const list = (Array.isArray(profiles) ? profiles : []).filter(p => p && typeof p === 'object')
    .sort((a, b) => rank(b.app) - rank(a.app));   //newest first
  for (const p of list) {
    const contacts = Array.isArray(p.contacts) ? p.contacts : [];
    for (const u of Array.isArray(p.users) ? p.users : []) {
      if (!u || typeof u.account !== 'string' || !u.account) continue;
      let rec = out.get(u.account);
      if (!rec) { rec = { app: p.app, user: u, contacts: [], seen: new Set() }; out.set(u.account, rec); }
      for (const c of contacts) {
        if (!c || c.user_id !== u.id) continue;
        const k = JSON.stringify([c.name, c.onion]);
        if (rec.seen.has(k)) continue;
        rec.seen.add(k);
        rec.contacts.push(c);
      }
    }
  }
  for (const rec of out.values()) delete rec.seen;
  return out;
}
