/*
 * Contacts' own pictures (shared/avatarImage.js makes them): kept in the app's data, in an IndexedDB
 * database of their own next to the contacts' "Epicwallet" one, per wallet (User.id) and contact
 * (Addressbook.id).
 *
 * Why not a column of the Addressbook table: that needs a new schema version of "Epicwallet", and an
 * older GUI then can't open the database at all (IndexedDB refuses to open a newer version): its
 * contacts and wallet list would be gone after a downgrade. A database of its own is simply ignored
 * by an older version, and the Addressbook rows stay exactly as they were.
 *
 * Every picture is checked on the way in and on the way out (isSafeAvatarDataUrl): what the page
 * shows is a data: URL this app made, never a path or a URL.
 *
 * createAvatarStore(backend) takes any { all(userId), put(row), del(userId, contactId),
 * delUser(userId) } (tests/contactAvatars.test.js uses a Map); the app uses idbBackend().
 */
import { isSafeAvatarDataUrl } from './avatarImage.js';

export const AVATAR_DB = 'EpicwalletContactAvatars';
const STORE = 'avatars';

const okId = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

export function createAvatarStore(backend) {
  return {
    /* Map contactId → data: URL of one wallet's pictures (empty when there are none or no database) */
    async forUser(userId) {
      const out = new Map();
      if (!okId(userId)) return out;
      let rows = [];
      try {
        rows = (await backend.all(Number(userId))) || [];
      } catch (e) {
        console.error('contact pictures not read', e);
      }
      for (const r of rows) {
        if (r && okId(r.contact_id) && isSafeAvatarDataUrl(r.image)) out.set(Number(r.contact_id), r.image);
      }
      return out;
    },
    /* keep a picture (true), or refuse one this app did not make (false) */
    async set(userId, contactId, dataUrl) {
      if (!okId(userId) || !okId(contactId) || !isSafeAvatarDataUrl(dataUrl)) return false;
      await backend.put({ user_id: Number(userId), contact_id: Number(contactId), image: dataUrl, updated: Date.now() });
      return true;
    },
    async remove(userId, contactId) {
      if (!okId(userId) || !okId(contactId)) return;
      await backend.del(Number(userId), Number(contactId));
    },
    /* a removed wallet: all its pictures */
    async removeUser(userId) {
      if (!okId(userId)) return;
      await backend.delUser(Number(userId));
    },
  };
}

/* the backend over the page's IndexedDB: one object store keyed [user_id, contact_id] */
export function idbBackend(idb = typeof indexedDB != 'undefined' ? indexedDB : null) {
  let opening = null;
  const open = () => {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        if (!idb) return reject(new Error('no IndexedDB'));
        const req = idb.open(AVATAR_DB, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const s = db.createObjectStore(STORE, { keyPath: ['user_id', 'contact_id'] });
            s.createIndex('user_id', 'user_id');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      //a failed open is tried again next time
      opening.catch(() => { opening = null; });
    }
    return opening;
  };
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result;
      const req = fn(tx.objectStore(STORE));
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    all: (userId) => run('readonly', (s) => s.index('user_id').getAll(userId)),
    put: (row) => run('readwrite', (s) => s.put(row)),
    del: (userId, contactId) => run('readwrite', (s) => s.delete([userId, contactId])),
    delUser: (userId) => run('readwrite', (s) => {
      const req = s.index('user_id').openKeyCursor(IDBKeyRange.only(userId));
      req.onsuccess = () => {
        const c = req.result;
        if (c) { s.delete(c.primaryKey); c.continue(); }
      };
      return null;
    }),
  };
}

let shared = null;
/* the app's store (main.js gives it to the views as $contactAvatars) */
export function contactAvatars() {
  if (!shared) shared = createAvatarStore(idbBackend());
  return shared;
}
