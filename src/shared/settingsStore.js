/*
 * GUI 6.1's settings file, <root>/settings.json (paths: shared/appPaths.js). It replaces the old
 * ~/.epic/epic_3-0-0_config.json (account list, theme), each wallet's config.json and the
 * settings half of the IndexedDB User row. Plain ESM, fs passed in: tests/settingsStore.test.js.
 *
 * {
 *   "schema": 1,
 *   "app": { "ui": "modern", "theme": "dark", "scale": 100, "locale": "" },   // "" = the OS language
 *   "firstRun": { "scannedAt": "<ISO>", "found": 2 },        // absent until the first-start scan ran
 *   "legacy": { "<old wallet dir>": "imported" | "fresh" },  // what the user chose per found wallet
 *   "node": { "mainnet": { "chainDir": "<dir>" } },          // built-in node; absent = <root>/node/main/chain_data
 *   "defaultWallet": "w1",
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
 * Saving writes settings.json.tmp, keeps the previous file as settings.json.bak, then renames.
 * A file that exists but can't be read is never overwritten (readOnly): a hand edit with a typo
 * must not lose the wallet list. Keys this version doesn't know are kept.
 */

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
  node_background: false,
  epicbox_background: false,
});

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function emptyData() {
  return { schema: SCHEMA, app: { ...APP_DEFAULTS }, legacy: {}, node: {}, defaultWallet: '', wallets: [] };
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
    label: typeof w.label === 'string' ? w.label : '',
    origin: ORIGINS.includes(w.origin) ? w.origin : 'created',
    importedFrom: isObj(w.importedFrom) ? w.importedFrom : null,
    settings: { ...WALLET_DEFAULTS, ...(isObj(w.settings) ? w.settings : {}) },
  };
}

function normalize(raw) {
  const d = { ...emptyData(), ...raw };
  d.app = { ...APP_DEFAULTS, ...(isObj(raw.app) ? raw.app : {}) };
  d.legacy = isObj(raw.legacy) ? raw.legacy : {};
  d.node = isObj(raw.node) ? raw.node : {};
  const wallets = [], invalid = [];
  for (const w of Array.isArray(raw.wallets) ? raw.wallets : []) {
    //a broken record is not listed, but written back as it was (a hand edit can still be fixed)
    try { wallets.push(normalizeWallet(w)); } catch (e) { invalid.push(w); }
  }
  d.wallets = wallets;
  Object.defineProperty(d, 'invalidWallets', { value: invalid, enumerable: false });
  if (!wallets.some(w => w.id === d.defaultWallet)) d.defaultWallet = wallets.length ? wallets[0].id : '';
  return d;
}

/* fs: node's fs (sync calls only); file: <root>/settings.json; now: () => ISO string */
export function createSettingsStore({ fs, pathMod, file, now = () => new Date().toISOString() }) {
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

  function save() {
    if (readOnly) return false;
    fs.mkdirSync(pathMod.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    const out = { ...data, schema: SCHEMA, wallets: [...data.wallets, ...(data.invalidWallets || [])] };
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
    fs.renameSync(tmp, file);
    fileExists = true;
    return true;
  }

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

    wallets() { return data.wallets.map(w => ({ ...w, settings: { ...w.settings } })); },
    wallet(id) { const w = find(id); return { ...w, settings: { ...w.settings } }; },
    defaultWalletId() { return data.defaultWallet; },
    setDefaultWallet(id) { find(id); data.defaultWallet = id; return save(); },

    /* w1, w2, …: never reused while the list holds it, so a wallet's folder is never shared */
    nextWalletId() {
      const n = data.wallets.map(w => /^w(\d+)$/.exec(w.id)).filter(Boolean).map(m => +m[1]);
      return 'w' + ((n.length ? Math.max(...n) : 0) + 1);
    },
    addWallet(w) {
      const rec = normalizeWallet({ createdAt: now(), ...w });
      if (data.wallets.some(x => x.id === rec.id)) throw new Error('wallet ' + rec.id + ' exists');
      data.wallets.push(rec);
      if (!data.defaultWallet) data.defaultWallet = rec.id;
      save();
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
    /* the list entry only: no file of the wallet is touched */
    removeWallet(id) {
      find(id);
      data.wallets = data.wallets.filter(w => w.id !== id);
      if (data.defaultWallet === id) data.defaultWallet = data.wallets.length ? data.wallets[0].id : '';
      return save();
    },
  };
  return api;
}
