/*
 * GUI 6.1's settings file, <root>/settings.json (paths: shared/appPaths.js). It replaces the old
 * ~/.epic/epic_3-0-0_config.json (account list, theme), each wallet's config.json and the
 * settings half of the IndexedDB User row. Plain ESM, fs passed in: tests/appPaths.test.js.
 *
 * {
 *   "schema": 1,
 *   "app": { "ui": "modern", "theme": "dark", "scale": 100, "locale": "" },   // "" = the OS language
 *   "firstRun": { "scannedAt": "<ISO>", "found": 2 },        // absent until the first-start scan ran
 *   "legacy": { "<old wallet dir>": "imported" | "fresh" },  // what the user chose per found wallet
 *   "node": { "mainnet": { "chainDir": "<dir>" } },          // built-in node; absent = <root>/node/main/chain_data
 *           (and "chainOffer": {checkedAt, answer, dir}: Settings asked once about old chain data)
 *   "myNodes": { "mainnet": [{ "address": "<url>", "label": "", "addedAt": "<ISO>" }] },  // shared/myNodes.js
 *           (added in 6.1.6 without a schema change: older versions keep keys they don't know)
 *   "defaultWallet": "w1",
 *   "nextId": 2,                        // the next wallet id's number: only grows, so an id is never reused
 *   "wallets": [{
 *     "id": "w1", "label": "", "network": "mainnet",
 *     "configDir": "<root>/wallets/w1",   // epic-wallet.toml, secrets, log: always 6.1's own
 *     "dataDir": "<root>/wallets/w1",     // holds wallet_data/ (the seed); an old folder when imported
 *     "origin": "created" | "restored" | "imported" | "opened",
 *     "importedFrom": null | { "app": "5.3.1", "account": "alpha", "dir": "<old wallet dir>" },
 *     "createdAt": "<ISO>",
 *     "settings": { ...WALLET_DEFAULTS }
 *   }]
 * }
 *
 * Saving writes settings.json.tmp, keeps the previous file as settings.json.bak, then renames
 * (again a few times while Windows holds the file); a save that fails returns false, never throws.
 * A file that exists but can't be read is never overwritten (readOnly): a hand edit with a typo
 * must not lose the wallet list. Keys this version doesn't know are kept.
 */

import { localNodeUrl } from './walletToml.js';
import { renameRetry } from './processOwnership.js';
import { normalizeMyNodes, addMyNode, updateMyNode, removeMyNode } from './myNodes.js';

export const SCHEMA = 1;
export const NETWORKS = ['mainnet', 'floonet', 'usernet'];
export const ORIGINS = ['created', 'restored', 'imported', 'opened'];

export const APP_DEFAULTS = Object.freeze({ ui: 'modern', theme: 'dark', scale: 100, locale: '' });

/* what each wallet's config.json held (minus version/firstTime/network), with 6.1's defaults:
   a new wallet works at once through a public node, the built-in node is a choice in Settings */
export const WALLET_DEFAULTS = Object.freeze({
  check_node_api_http_addr: 'https://node.epiccash.com:3413',
  nodeInternal: false,
  nodesynced: false,
  epicbox_domain: 'epicbox.epiccash.com',
  walletlisten_on_startup: true,
  //the HTTP listener (port 3415) starts at unlock only if the user chose so (Modern: Settings › Node
  //and receiving › Start with wallet); else only when turned on. Every epic-wallet process asks the
  //node every 10 s, and most people receive with Epicbox (shared/httpListener.js httpAutostart)
  http_listener_autostart: false,
  node_background: false,
  //an old Epicbox server still to be checked once (wss:// url; walletService.pendingEpicboxCheck)
  epicbox_check_pending: '',
});

/*
 * The node and Epicbox server a NEW mainnet wallet starts with, instead of node.epiccash.com and
 * epicbox.epiccash.com, from the environment: EPIC_GUI_DEFAULT_NODE (http(s)://host[:port]) and
 * EPIC_GUI_DEFAULT_EPICBOX (a domain). For the test gate and the Windows rig, which pick a healthy
 * public server first, so an outage of the official ones doesn't fail them. Unset: the defaults.
 * Wallets that exist keep their own settings.
 */
const NODE_URL = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;
const DOMAIN = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
export function serverDefaultsFromEnv(env) {
  const e = env && typeof env === 'object' ? env : {};
  const out = {};
  const node = String(e.EPIC_GUI_DEFAULT_NODE || '').trim().replace(/\/+$/, '');
  const box = String(e.EPIC_GUI_DEFAULT_EPICBOX || '').trim().toLowerCase();
  if (NODE_URL.test(node) && node.length <= 256) out.check_node_api_http_addr = node;
  if (DOMAIN.test(box) && box.length <= 253) out.epicbox_domain = box;
  return out;
}
let serverDefaults = {};
/* configService, once at the start, with serverDefaultsFromEnv's answer (from the preload) */
export function setServerDefaults(d) {
  serverDefaults = serverDefaultsFromEnv({ EPIC_GUI_DEFAULT_NODE: d && d.check_node_api_http_addr, EPIC_GUI_DEFAULT_EPICBOX: d && d.epicbox_domain });
}

/* a new wallet's settings on its network: mainnet uses the public node; floonet and usernet have
   no public node, so their own local node (http://127.0.0.1:<the network's node API port>) */
export function walletDefaults(network) {
  return network === 'mainnet' || !NETWORKS.includes(network)
    ? { ...WALLET_DEFAULTS, ...serverDefaults }
    : { ...WALLET_DEFAULTS, ...(serverDefaults.epicbox_domain ? { epicbox_domain: serverDefaults.epicbox_domain } : {}),
      check_node_api_http_addr: localNodeUrl(network) };
}

/* settings older drafts stored that 6.1 no longer has: dropped on load and on save
   (epicbox_background: the Epicbox listener always stops at lock, switch and quit) */
const DROPPED_SETTINGS = ['epicbox_background'];
function cleanSettings(s, network) {
  const out = { ...walletDefaults(network), ...(isObj(s) ? s : {}) };
  for (const k of DROPPED_SETTINGS) delete out[k];
  return out;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function emptyData() {
  return { schema: SCHEMA, app: { ...APP_DEFAULTS }, legacy: {}, node: {}, defaultWallet: '', nextId: 1, wallets: [] };
}

/* the number of a wN id, 0 for any other id */
const idNumber = (id) => { const m = typeof id === 'string' && /^w(\d+)$/.exec(id); return m ? Number(m[1]) : 0; };

/* a wallet's label is only shown, never part of a path: any characters, trimmed, at most
   LABEL_MAX characters (counted as code points, so an emoji isn't cut in half); duplicates are fine.
   Control characters (C0, DEL, C1) become a space; direction marks and overrides (U+200E/F,
   U+202A–U+202E, U+2066–U+2069) are dropped, so a label can't reorder the text around it */
export const LABEL_MAX = 32;
export function cleanLabel(label) {
  return typeof label === 'string'
    ? Array.from(label
      //eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
      .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .trim()).slice(0, LABEL_MAX).join('').trim() : '';
}

/* a wallet record as stored; throws on what would break the app later */
export function normalizeWallet(w) {
  if (!isObj(w)) throw new Error('wallet: not an object');
  if (typeof w.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(w.id)) throw new Error('wallet: bad id');
  if (!NETWORKS.includes(w.network)) throw new Error('wallet ' + w.id + ': bad network');
  for (const k of ['configDir', 'dataDir']) {
    if (typeof w[k] !== 'string' || !w[k]) throw new Error('wallet ' + w.id + ': ' + k + ' missing');
  }
  return {
    ...w,
    label: cleanLabel(w.label),
    origin: ORIGINS.includes(w.origin) ? w.origin : 'created',
    importedFrom: isObj(w.importedFrom) ? w.importedFrom : null,
    settings: cleanSettings(w.settings, w.network),
  };
}

function normalize(raw) {
  const d = { ...emptyData(), ...raw };
  d.app = { ...APP_DEFAULTS, ...(isObj(raw.app) ? raw.app : {}) };
  d.legacy = isObj(raw.legacy) ? raw.legacy : {};
  d.node = isObj(raw.node) ? raw.node : {};
  //absent until the first node is saved; a broken entry is dropped (a label and an address only)
  if (raw.myNodes !== undefined) d.myNodes = normalizeMyNodes(raw.myNodes, NETWORKS);
  const wallets = [], invalid = [];
  for (const w of Array.isArray(raw.wallets) ? raw.wallets : []) {
    //a broken record is not listed, but written back as it was (a hand edit can still be fixed)
    try { wallets.push(normalizeWallet(w)); } catch (e) { invalid.push(w); }
  }
  d.wallets = wallets;
  Object.defineProperty(d, 'invalidWallets', { value: invalid, enumerable: false });
  if (!wallets.some(w => w.id === d.defaultWallet)) d.defaultWallet = wallets.length ? wallets[0].id : '';
  //past every id in the file, the broken records' too (they are written back and may be fixed by hand)
  const stored = Number.isSafeInteger(raw.nextId) && raw.nextId > 0 ? raw.nextId : 1;
  d.nextId = Math.max(stored, ...[...wallets, ...invalid].map(w => idNumber(w && w.id) + 1));
  return d;
}

/* fs: node's fs (sync calls only); file: <root>/settings.json; now: () => ISO string;
   wait(ms): the pause between rename tries (tests) */
export function createSettingsStore({ fs, pathMod, file, now = () => new Date().toISOString(), wait }) {
  let data = emptyData();
  let fileExists = false;
  let readOnly = false;
  let loadError = '';

  function load() {
    readOnly = false;
    loadError = '';
    fileExists = fs.existsSync(file);
    if (!fileExists) {
      data = emptyData();
      return api;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!isObj(raw)) throw new Error('not an object');
      if (typeof raw.schema === 'number' && raw.schema > SCHEMA) throw new Error('written by a newer version (schema ' + raw.schema + ')');
      data = normalize(raw);
    } catch (e) {
      readOnly = true;
      loadError = String(e && e.message || e);
      data = emptyData();
    }
    return api;
  }

  /* true when written; false (never a throw) when the file is unreadable (readOnly) or can't be
     written: the change stays in memory and goes out with the next save that works. The rename is
     tried again while Windows holds the file (processOwnership.renameRetry); settings.json is
     never left half written. */
  let saveError = '';
  function save() {
    if (readOnly) return false;
    const tmp = file + '.tmp';
    try {
      fs.mkdirSync(pathMod.dirname(file), { recursive: true });
      const out = { ...data, schema: SCHEMA, wallets: [...data.wallets, ...(data.invalidWallets || [])] };
      fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
      if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
      renameRetry(fs, tmp, file, wait ? { wait } : {});
    } catch (e) {
      saveError = String(e && (e.code || e.message) || e);
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e2) { /* left for the next save */ }
      console.log('settings not saved: ' + file + ': ' + saveError);
      return false;
    }
    saveError = '';
    fileExists = true;
    return true;
  }

  /* node.<net> patched and saved, or left as it was when the save fails */
  function saveNode(network, patch) {
    const had = Object.prototype.hasOwnProperty.call(data.node, network), before = data.node[network];
    data.node[network] = { ...(before || {}), ...patch };
    if (save()) return true;
    if (had) data.node[network] = before; else delete data.node[network];
    return false;
  }

  /* a My nodes change (shared/myNodes.js result) saved; {ok: false, error: 'not_saved'} and nothing
     changed, also in memory, when the save fails */
  function saveMyNodes(network, res) {
    if (!res.ok) return res;
    const before = data.myNodes;
    const next = { ...(isObj(data.myNodes) ? data.myNodes : {}) };
    if (res.list.length) next[network] = res.list; else delete next[network];
    data.myNodes = next;
    if (save()) return { ...res, list: res.list.map(e => ({ ...e })) };
    data.myNodes = before;
    return { ok: false, error: 'not_saved' };
  }
  const myNodeList = (network) => (isObj(data.myNodes) && Array.isArray(data.myNodes[network]) ? data.myNodes[network] : []);

  function find(id) {
    const w = data.wallets.find(x => x.id === id);
    if (!w) throw new Error('no wallet ' + id);
    return w;
  }

  const api = {
    load,
    save,
    get exists() { return fileExists; },
    get readOnly() { return readOnly; },
    get loadError() { return loadError; },
    /* why the last save failed ('' after one that worked) */
    get saveError() { return saveError; },
    /* a copy: change it through the setters, so every change is saved */
    get data() { return JSON.parse(JSON.stringify(data)); },

    app() { return { ...data.app }; },
    setApp(patch) { data.app = { ...data.app, ...patch }; return save(); },

    /* first start: no settings file, or one where the scan never ran */
    isFirstRun() { return !fileExists || !data.firstRun; },
    markScanned(found) { data.firstRun = { scannedAt: now(), found }; return save(); },
    legacyDecisions() { return { ...data.legacy }; },
    setLegacyDecision(dir, decision) { data.legacy[dir] = decision; return save(); },

    nodeChainDir(network) { return data.node[network] && data.node[network].chainDir || ''; },
    setNodeChainDir(network, dir) {
      data.node[network] = { ...(data.node[network] || {}), chainDir: dir || '' };
      return save();
    },
    /* the one-time chain data offer of Settings (shared/chainOffer.js); 'used' also sets chainDir.
       False when not saved: then nothing changed, also in memory (a chainDir only in memory would
       go into the node's toml while Settings says the node downloads the blockchain) */
    chainOffer(network) { const o = data.node[network] && data.node[network].chainOffer; return o ? { ...o } : null; },
    setChainOffer(network, offer) {
      const patch = { chainOffer: { ...offer } };
      if (offer.answer === 'used' && offer.dir) patch.chainDir = offer.dir;
      return saveNode(network, patch);
    },
    /* Settings' Download the blockchain again: the built-in node uses its own folder again, the offer
       counts as declined (not asked again) and keeps the folder it showed; nothing on disk is deleted.
       False when not saved: then nothing changed */
    forgetChainDir(network, now = new Date()) {
      const before = data.node[network] || {};
      const dir = before.chainDir || (before.chainOffer && before.chainOffer.dir) || '';
      return saveNode(network, { chainDir: '', chainOffer: { checkedAt: now.toISOString(), answer: 'declined', dir } });
    },

    /* My nodes of a network (copies); add/update/remove return {ok, list, entry} or {ok: false,
       error: 'invalid' | 'duplicate' | 'full' | 'missing' | 'not_saved'} (shared/myNodes.js) */
    myNodes(network) { return NETWORKS.includes(network) ? myNodeList(network).map(e => ({ ...e })) : []; },
    addMyNode(network, entry) {
      if (!NETWORKS.includes(network)) return { ok: false, error: 'invalid' };
      return saveMyNodes(network, addMyNode(myNodeList(network), entry, now));
    },
    updateMyNode(network, was, entry) {
      if (!NETWORKS.includes(network)) return { ok: false, error: 'missing' };
      return saveMyNodes(network, updateMyNode(myNodeList(network), was, entry));
    },
    removeMyNode(network, address) {
      if (!NETWORKS.includes(network)) return { ok: false, error: 'missing' };
      return saveMyNodes(network, removeMyNode(myNodeList(network), address));
    },

    wallets() { return data.wallets.map(w => ({ ...w, settings: { ...w.settings } })); },
    /* the records that could not be read (kept in the file as they are): copies */
    invalidWallets() { return JSON.parse(JSON.stringify(data.invalidWallets || [])); },
    wallet(id) { const w = find(id); return { ...w, settings: { ...w.settings } }; },
    defaultWalletId() { return data.defaultWallet; },
    setDefaultWallet(id) { find(id); data.defaultWallet = id; return save(); },

    /* w1, w2, …: never reused, also after a wallet was removed from the list, so a wallet's
       folder is never shared (settings.json keeps nextId, which only grows) */
    nextWalletId() {
      return 'w' + data.nextId;
    },
    addWallet(w) {
      const rec = normalizeWallet({ createdAt: now(), ...w });
      if ([...data.wallets, ...(data.invalidWallets || [])].some(x => x && x.id === rec.id)) throw new Error('wallet ' + rec.id + ' exists');
      const before = { defaultWallet: data.defaultWallet, nextId: data.nextId };
      data.wallets.push(rec);
      data.nextId = Math.max(data.nextId, idNumber(rec.id) + 1);
      if (!data.defaultWallet) data.defaultWallet = rec.id;
      if (!save()) {
        //a wallet that isn't on disk would be gone after a restart: not listed, the caller says so
        data.wallets = data.wallets.filter(x => x !== rec);
        Object.assign(data, before);
        throw new Error('settings not saved (' + (saveError || 'read only') + '): ' + file);
      }
      return { ...rec, settings: { ...rec.settings } };
    },
    updateWallet(id, patch) {
      const i = data.wallets.indexOf(find(id));
      data.wallets[i] = normalizeWallet({ ...data.wallets[i], ...patch, id });
      return save();
    },
    updateWalletSettings(id, patch) {
      const w = find(id);
      w.settings = { ...w.settings, ...patch };
      return save();
    },
    /* the list entry, and its 'imported' decision (legacy[importedFrom.dir or dataDir]), so Import
       from an older Epic Wallet lists that folder again; no file of the wallet is touched here
       (walletRemoval.js). nextId stays: the id is never used again. False when not saved: then
       nothing changed, also in memory (a removal that isn't on disk would come back at the next start) */
    removeWallet(id) {
      const w = find(id);
      const before = { wallets: data.wallets, defaultWallet: data.defaultWallet, legacy: { ...data.legacy } };
      data.wallets = data.wallets.filter(x => x.id !== id);
      if (data.defaultWallet === id) data.defaultWallet = data.wallets.length ? data.wallets[0].id : '';
      const win = pathMod && pathMod.sep === '\\';
      const same = (a, b) => {
        if (a === b) return true;
        if (!pathMod || !a || !b) return false;
        const ra = pathMod.resolve(a), rb = pathMod.resolve(b);
        return win ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
      };
      const dirs = [w.importedFrom && w.importedFrom.dir, w.dataDir].filter(d => typeof d === 'string' && d);
      //another wallet in the list from the same folder keeps the decision
      const stillListed = (d) => data.wallets.some(x => same(x.dataDir, d) || (x.importedFrom && same(x.importedFrom.dir, d)));
      for (const k of Object.keys(data.legacy)) {
        if (data.legacy[k] === 'imported' && dirs.some(d => same(k, d)) && !stillListed(k)) delete data.legacy[k];
      }
      if (!save()) {
        Object.assign(data, before);
        return false;
      }
      return true;
    },
  };
  return api;
}
