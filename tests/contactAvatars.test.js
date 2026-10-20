// Tests for src/shared/contactAvatars.js, where contacts' pictures are kept (per wallet and contact): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAvatarStore, AVATAR_DB } from '../src/shared/contactAvatars.js';

const WEBP = 'data:image/webp;base64,UklGRiIAAABXRUJQ';

/* the backend as a Map keyed "user/contact" */
function mapBackend(rows = []) {
  const m = new Map(rows.map((r) => [r.user_id + '/' + r.contact_id, r]));
  return {
    m,
    async all(u) { return [...m.values()].filter((r) => r.user_id === u); },
    async put(r) { m.set(r.user_id + '/' + r.contact_id, r); },
    async del(u, c) { m.delete(u + '/' + c); },
    async delUser(u) { for (const [k, r] of m) if (r.user_id === u) m.delete(k); },
  };
}

test('pictures are kept per wallet and contact', async () => {
  const b = mapBackend();
  const s = createAvatarStore(b);
  assert.equal(await s.set(1, 5, WEBP), true);
  assert.equal(await s.set(2, 5, 'data:image/png;base64,iVBORw0KGgo='), true);
  assert.deepEqual([...(await s.forUser(1))], [[5, WEBP]]);
  assert.equal((await s.forUser(2)).size, 1);
  assert.equal((await s.forUser(3)).size, 0);
});

test('only a picture this app made is kept: no SVG, URL or file path', async () => {
  const s = createAvatarStore(mapBackend());
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'https://x.example/a.png', 'file:///a.png', '', null]) {
    assert.equal(await s.set(1, 1, bad), false, String(bad));
  }
  assert.equal(await s.set(0, 1, WEBP), false);
  assert.equal(await s.set(1, 'x', WEBP), false);
});

test('a stored value that is not a safe picture is never handed to the page', async () => {
  const b = mapBackend([
    { user_id: 1, contact_id: 1, image: WEBP },
    { user_id: 1, contact_id: 2, image: 'data:image/svg+xml,<svg onload=alert(1)>' },
    { user_id: 1, contact_id: 3, image: 'javascript:alert(1)' },
  ]);
  assert.deepEqual([...(await createAvatarStore(b).forUser(1)).keys()], [1]);
});

test('a contact deleted, a wallet removed: their pictures go too', async () => {
  const b = mapBackend();
  const s = createAvatarStore(b);
  await s.set(1, 1, WEBP);
  await s.set(1, 2, WEBP);
  await s.set(2, 1, WEBP);
  await s.remove(1, 1);
  assert.deepEqual([...(await s.forUser(1)).keys()], [2]);
  await s.removeUser(1);
  assert.equal((await s.forUser(1)).size, 0);
  assert.equal((await s.forUser(2)).size, 1);
});

test('no database (or a broken one): no pictures, no error for the page', async () => {
  const broken = { all: async () => { throw new Error('IndexedDB gone'); } };
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal((await createAvatarStore(broken).forUser(1)).size, 0);
  } finally {
    console.error = err;
  }
});

test('the pictures live in a database of their own, not in the contacts database (an older GUI must still open that)', () => {
  assert.notEqual(AVATAR_DB, 'Epicwallet');
});
