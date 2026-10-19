/*
 * Contacts (the Addressbook table, idbService.js) without IndexedDB: what a save writes and what a
 * search shows. Pure functions, unit-tested in tests/contacts.test.js.
 */

//every text column of a contact; NOT NULL in the stored schema, so never null or undefined
export const CONTACT_TEXT_FIELDS = ['name', 'country', 'city', 'onion', 'proofaddr', 'externalOne', 'externalTwo', 'notice'];

//the columns a search looks in (as before: not the gender or the proof switch)
const SEARCH_FIELDS = ['name', 'country', 'city', 'onion', 'proofaddr', 'externalOne', 'externalTwo', 'notice'];

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
