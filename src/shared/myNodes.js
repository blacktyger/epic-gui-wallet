/*
 * "My nodes": node addresses the user saved in Settings › Node, with a label of their own.
 * Stored per app (settings.json "myNodes", shared/settingsStore.js), one list per network, not per
 * wallet: a node serves every wallet of its network, and a new wallet should find the list too.
 * Pure list logic (tests/myNodes.test.js); every function returns a new list.
 *
 *   "myNodes": { "mainnet": [{ "address": "https://node.example.com:3413", "label": "Home", "addedAt": "<ISO>" }] }
 *
 * The address is stored as the node field would save it (nodeAddress.nodeFieldAddress); two
 * addresses are the same node when their nodeAddressKey is (case, default port, trailing "/").
 */
import { nodeCheckAddress, nodeAddressKey } from './nodeAddress.js';

export const MY_NODES_MAX = 50;
export const NODE_LABEL_MAX = 40;

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/* a label is only shown: any characters, trimmed, at most NODE_LABEL_MAX code points; control
   characters become a space, direction marks and overrides are dropped (as wallet labels) */
export function cleanNodeLabel(label){
  return typeof label === 'string'
    ? Array.from(label
      //eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
      .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
      .replace(/[‎‏‪-‮⁦-⁩]/g, '')
      .trim()).slice(0, NODE_LABEL_MAX).join('').trim() : '';
}

/* one stored entry, or null when its address is not a node address */
function cleanEntry(e){
  if(!isObj(e)) return null;
  const address = nodeCheckAddress(typeof e.address === 'string' ? e.address : '');
  if(!address) return null;
  return {
    address,
    label: cleanNodeLabel(e.label),
    addedAt: typeof e.addedAt === 'string' && e.addedAt.length <= 40 ? e.addedAt : '',
  };
}

/* a stored list: broken entries and repeats of an address dropped, at most MY_NODES_MAX */
export function cleanMyNodeList(list){
  const out = [], seen = new Set();
  for(const raw of Array.isArray(list) ? list : []){
    const e = cleanEntry(raw);
    const key = e && nodeAddressKey(e.address);
    if(!e || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if(out.length >= MY_NODES_MAX) break;
  }
  return out;
}

/* settings.json "myNodes" as read: {network: list} for the networks given; anything else → {} */
export function normalizeMyNodes(raw, networks){
  const out = {};
  if(!isObj(raw)) return out;
  for(const net of networks){
    const list = cleanMyNodeList(raw[net]);
    if(list.length) out[net] = list;
  }
  return out;
}

/* the entry for this address (any spelling of it), or null */
export function findMyNode(list, address){
  const key = nodeAddressKey(address);
  return key ? (list || []).find(e => nodeAddressKey(e.address) === key) || null : null;
}

/*
 * returns {ok: true, list, entry} or {ok: false, error, existing}
 *   error 'invalid' (not a node address), 'duplicate' (existing: the entry it repeats), 'full'
 */
export function addMyNode(list, {address, label} = {}, now = () => new Date().toISOString()){
  const current = cleanMyNodeList(list);
  const entry = cleanEntry({address, label, addedAt: now()});
  if(!entry) return {ok: false, error: 'invalid'};
  const existing = findMyNode(current, entry.address);
  if(existing) return {ok: false, error: 'duplicate', existing};
  if(current.length >= MY_NODES_MAX) return {ok: false, error: 'full'};
  return {ok: true, list: [...current, entry], entry};
}

/*
 * The entry at `was` gets a new address and label, in its place in the list.
 * returns {ok: true, list, entry} or {ok: false, error: 'invalid' | 'duplicate' | 'missing', existing}
 */
export function updateMyNode(list, was, {address, label} = {}){
  const current = cleanMyNodeList(list);
  const old = findMyNode(current, was);
  if(!old) return {ok: false, error: 'missing'};
  const entry = cleanEntry({address, label, addedAt: old.addedAt});
  if(!entry) return {ok: false, error: 'invalid'};
  const existing = findMyNode(current, entry.address);
  if(existing && existing !== old) return {ok: false, error: 'duplicate', existing};
  return {ok: true, list: current.map(e => (e === old ? entry : e)), entry};
}

/* returns {ok: true, list} or {ok: false, error: 'missing'} */
export function removeMyNode(list, address){
  const current = cleanMyNodeList(list);
  const old = findMyNode(current, address);
  if(!old) return {ok: false, error: 'missing'};
  return {ok: true, list: current.filter(e => e !== old)};
}
