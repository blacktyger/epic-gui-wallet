/*
 * Contacts (the Addressbook table, idbService.js) without IndexedDB: what a save writes and what a
 * search shows. Pure functions, unit-tested in tests/contacts.test.js.
 */

//every text column of a contact; NOT NULL in the stored schema, so never null or undefined. onion
//(a Tor address) and proofaddr (a payment proof address), with alwaysproof: what an older version
//stored; not shown, edited or used any more, but kept as they are (a downgrade loses nothing)
export const CONTACT_TEXT_FIELDS = ['name', 'country', 'city', 'onion', 'proofaddr', 'externalOne', 'externalTwo', 'notice'];

//the columns a search looks in (not the gender or the hidden Tor and proof fields)
const SEARCH_FIELDS = ['name', 'country', 'city', 'externalOne', 'externalTwo', 'notice'];

/* the columns a save writes: each text column a string ('' when missing, e.g. a contact saved by an
   older version without it), alwaysproof a boolean */
export function contactFields(c = {}) {
  const out = {};
  for (const k of CONTACT_TEXT_FIELDS) {
    out[k] = c[k] == null ? '' : String(c[k]);
  }
  out.alwaysproof = !!c.alwaysproof;
  return out;
}

const fold = (s) => String(s == null ? '' : s).toLocaleLowerCase();

/* the contacts (one wallet's, as getAddress gives them) that contain keyword in any searched column,
   ignoring case; the keyword is plain text (no wildcards or patterns). An empty keyword: all of them */
export function searchContacts(list, keyword) {
  const all = Array.isArray(list) ? list : [];
  const q = fold(keyword).trim();
  if (!q) return all;
  return all.filter((c) => c && SEARCH_FIELDS.some((k) => fold(c[k]).includes(q)));
}

/* what is wrong with a contact before it is saved, or null: 'name' (no name), 'address' (no address to
   send to at all), 'epicbox' (the Epicbox address is not one; same pattern as modules/Validators.js).
   An empty form and "not an address!!" used to be saved as they were (QA T04). A Tor address alone is
   no address: the wallet has no Tor. */
const EPICBOX_ADDRESS = /^(epicbox:\/\/)?([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{52})(@([a-zA-Z0-9.]+)(:([0-9]*))?)?$/;
export function contactProblem(c = {}) {
  const f = contactFields(c);
  const v = (k) => f[k].trim();
  if (!v('name')) return 'name';
  if (!v('externalOne') && !v('externalTwo')) return 'address';
  if (v('externalOne') && !EPICBOX_ADDRESS.test(v('externalOne'))) return 'epicbox';
  return null;
}
