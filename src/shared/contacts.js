/*
 * Contacts (the Addressbook table, idbService.js) without IndexedDB: what a save writes and what a
 * search shows. Pure functions, unit-tested in tests/contacts.test.js.
 */

import { isEpicboxAddress, isOnionAddress, isUnknownRecipient } from './sendForm.js';

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
  if (contactProblems(c).http) return 'http';
  return null;
}

/* ---- the redesigned Contacts (6.1.6): kinds, short addresses, sorting, activity, the Send picker ---- */

/* the address fields a contact can be sent to, in the order the Send picker prefers them */
export const ADDRESS_FIELDS = ['externalOne', 'externalTwo'];
/* the field → the kind the screens name ('epicbox' | 'http') */
export const FIELD_KIND = { externalOne: 'epicbox', externalTwo: 'http' };

/* the addresses of a contact that can be sent to: [{ field, kind, address }] (Epicbox first) */
export function contactAddresses(c) {
  if (!c) return [];
  return ADDRESS_FIELDS
    .map((field) => ({ field, kind: FIELD_KIND[field], address: String(c[field] == null ? '' : c[field]).trim() }))
    .filter((a) => a.address);
}

/* the addresses Send can use: a Tor address an older version kept in the HTTP field is left out
   (Send refuses it: the wallet has no Tor) */
export function sendableAddresses(c) {
  return contactAddresses(c).filter((a) => !isOnionAddress(a.address));
}

/* "esM4kz…8tQz@epicbox.epiccash.com" for an Epicbox address (the key is what tells two apart: its
   start and end, as the review dialog highlights them); a long HTTP address keeps its start and end */
export function shortAddress(address, { head = 6, tail = 4 } = {}) {
  const v = String(address == null ? '' : address).trim();
  const at = v.indexOf('@');
  if (/^https?:\/\//i.test(v) || at <= 0 && v.length < 40) {
    return v.length > 36 ? v.slice(0, 24) + '…' + v.slice(-10) : v;
  }
  const key = at > 0 ? v.slice(0, at) : v;
  const rest = at > 0 ? v.slice(at) : '';
  return key.length > head + tail + 3 ? key.slice(0, head) + '…' + key.slice(-tail) + rest : v;
}

/* the HTTP field: http(s):// as Send checks it (modules/Validators.js), or a bare host Send accepts */
const HTTP_URL = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?$/;

/* what is wrong with each field of a contact form, as the form shows it while you type:
   { name, address, epicbox, http, onion } with true where a problem is. A Tor address in either
   field is refused (no Tor in this wallet), with its own message (onion) */
export function contactProblems(c = {}) {
  const f = contactFields(c);
  const v = (k) => f[k].trim();
  const out = {};
  if (!v('name')) out.name = true;
  if (!v('externalOne') && !v('externalTwo')) out.address = true;
  const box = v('externalOne');
  if (box && !EPICBOX_ADDRESS.test(box)) out.epicbox = true;
  const web = v('externalTwo');
  if (web) {
    const ok = /^https?:\/\//i.test(web) ? HTTP_URL.test(web) : !isEpicboxAddress(web) && !isUnknownRecipient(web);
    if (!ok || isOnionAddress(web)) out.http = true;
  }
  if (isOnionAddress(box) || isOnionAddress(web)) out.onion = true;
  return out;
}

/* the wallet's transactions linked to contacts (store txs: processTxs puts the AddressTransactions
   row, whose `address` column is the contact's id, on tx.address) → Map contactId → { last, count }
   (last: ms of the newest one's creation_ts) */
export function contactActivity(txs) {
  const out = new Map();
  for (const tx of Array.isArray(txs) ? txs : []) {
    const id = tx && tx.address && Number(tx.address.address);
    if (!id) continue;
    const t = Date.parse(tx.creation_ts) || 0;
    const a = out.get(id) || { last: 0, count: 0 };
    a.count++;
    if (t > a.last) a.last = t;
    out.set(id, a);
  }
  return out;
}

/* one contact's transactions, newest first */
export function contactTransactions(txs, contactId) {
  const id = Number(contactId);
  if (!id) return [];
  return (Array.isArray(txs) ? txs : [])
    .filter((tx) => tx && tx.address && Number(tx.address.address) === id)
    .sort((a, b) => (Date.parse(b.creation_ts) || 0) - (Date.parse(a.creation_ts) || 0));
}

/* 'name' (A to Z in the user's language) | 'recent' (the latest transaction first, then by name) */
export const SORTS = ['name', 'recent'];
export function sortContacts(list, sort = 'name', activity = new Map(), locale) {
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), locale, { sensitivity: 'base', numeric: true }) || (a.id - b.id);
  const all = (Array.isArray(list) ? list : []).filter(Boolean).slice();
  if (sort == 'recent') {
    const last = (c) => (activity.get(Number(c.id)) || {}).last || 0;
    return all.sort((a, b) => last(b) - last(a) || byName(a, b));
  }
  return all.sort(byName);
}

/* the contacts the Send picker lists: those with an address to send to, matching the search */
export function pickableContacts(list, keyword) {
  return searchContacts(list, keyword).filter((c) => sendableAddresses(c).length);
}

/* the Send screen opened from a contact (Contacts › Send): its route query → { id, field } or null.
   Only a contact id and a field name travel in the route, never an address. */
export function sendQuery(query = {}) {
  const id = Number(query && query.contact);
  if (!Number.isInteger(id) || id <= 0) return null;
  const field = ADDRESS_FIELDS.includes(query && query.use) ? query.use : null;
  return { id, field };
}
