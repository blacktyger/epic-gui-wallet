/*
 * Imports wallets of older GUIs into 6.1's list (docs/plans/fresh-start.md, "Importer").
 * Renderer side; everything is passed in, so tests/importer.test.js runs it with fakes.
 *
 * An imported wallet keeps its data where it is (dataDir = the old folder); 6.1 writes its own
 * config dir, settings.json and its own IndexedDB. The old folder's files, ~/.epic and the old
 * Electron profiles are only read: the importer has no code path that writes to them.
 */
import { mergeProfiles } from '../legacyProfile.js';
import { WALLET_DEFAULTS } from './settingsStore.js';

export const LOCALES = ['bg', 'cz', 'de', 'en', 'fa', 'hi'];
//the Epicbox domain older GUIs shipped with; the server moved
const EPICBOX_RENAMED = { 'epicbox.epic.tech': 'epicbox.epiccash.com' };
const LOCAL_NODE = { mainnet: 'http://127.0.0.1:3413', floonet: 'http://127.0.0.1:13413', usernet: 'http://127.0.0.1:23413' };

const str = (v) => typeof v === 'string' ? v : '';
const dedupeKey = (c) => JSON.stringify([str(c.name), str(c.onion)]);

/* used until nodeAddress.js (fix/userdata-migration) is injected: trim, add a scheme to a bare
   host:port (http only for this machine, where the built-in node has no TLS), empty → default.
   A testnet gets the local node, never the mainnet public node. */
export function fallbackNodeAddress(url, { network = 'mainnet' } = {}) {
  const def = network === 'mainnet' ? WALLET_DEFAULTS.check_node_api_http_addr : LOCAL_NODE[network] || LOCAL_NODE.mainnet;
  let u = str(url).trim();
  if (!u) return def;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
    const host = u.split(/[:/]/)[0].toLowerCase();
    u = (host === '127.0.0.1' || host === 'localhost' ? 'http://' : 'https://') + u;
  }
  try {
    const p = new URL(u);
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return def;
  } catch (e) {
    return def;
  }
  return u.replace(/\/+$/, '');
}

export function fallbackLocale(lang) {
  const l = str(lang).trim().toLowerCase();
  return LOCALES.includes(l) ? l : 'en';
}

export function cleanEpicbox(domain) {
  const d = str(domain).trim().toLowerCase();
  if (!d) return WALLET_DEFAULTS.epicbox_domain;
  return EPICBOX_RENAMED[d] || d;
}

/* a contact as the new IndexedDB needs it: every NOT NULL column set (idbService.js) */
function contactRow(c, userId) {
  return {
    user_id: userId,
    name: str(c.name), onion: str(c.onion), proofaddr: str(c.proofaddr),
    alwaysproof: c.alwaysproof === true,
    country: str(c.country), city: str(c.city), gender: str(c.gender) || 'male',
    keybase: '', externalOne: str(c.externalOne), externalTwo: str(c.externalTwo), notice: str(c.notice),
  };
}

/*
 * configService: {settings (settingsStore), newWalletDirs(network), registerWallet(rec)}
 * userService.ensureUser(walletId, cols) → User row; addressbookService: {getAddress(userId), addAddress(row)}
 * legacyBridge.scan({known}) → {wallets, chains, profiles} (main: scanLegacy + readLegacyProfiles)
 * fs (readFileSync) and pathMod read each old config.json.
 * cleanNodeAddress(url, {network}) → {url} (shared/nodeAddress.js), supportedLocale(lang) → locale: optional.
 */
export function createImporter({ configService, userService, addressbookService, legacyBridge, fs, pathMod,
  cleanNodeAddress, supportedLocale, log = () => {} }) {
  const settings = () => configService.settings;
  let rows = new Map();   //key → scan row with its old settings
  let chains = [];

  const cleanNode = (url, network) => {
    if (cleanNodeAddress) {
      try {
        const r = cleanNodeAddress(url, { network });
        if (r && str(r.url)) return r.url;
      } catch (e) { /* the fallback below */ }
    }
    return fallbackNodeAddress(url, { network });
  };
  const locale = (lang) => {
    if (supportedLocale) {
      try { const l = supportedLocale(lang); if (str(l)) return l; } catch (e) { /* fallback */ }
    }
    return fallbackLocale(lang);
  };

  function readOldConfig(dir) {
    try {
      const c = JSON.parse(fs.readFileSync(pathMod.join(dir, 'config.json'), 'utf8'));
      return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
    } catch (e) {
      return {};
    }
  }

  /* what 6.1 will use for this wallet; the User row is what the old Settings page showed last */
  function settingsFor(w, user, cfg) {
    const nodeInternal = typeof user.nodeInternal === 'boolean' ? user.nodeInternal : WALLET_DEFAULTS.nodeInternal;
    return {
      check_node_api_http_addr: cleanNode(cfg.check_node_api_http_addr, w.network),
      nodeInternal,
      epicbox_domain: cleanEpicbox(str(user.epicbox_domain) || cfg.epicbox_domain),
    };
  }

  /* dirs 6.1 already has or that the user already decided about: the scan skips them */
  function known() {
    const s = settings();
    const out = new Set(Object.keys(s.legacyDecisions()));
    for (const w of s.wallets()) {
      out.add(w.dataDir);
      if (w.importedFrom && str(w.importedFrom.dir)) out.add(w.importedFrom.dir);
    }
    return [...out];
  }

  async function scan() {
    const res = await legacyBridge.scan({ known: known() }) || {};
    const accounts = mergeProfiles(res.profiles);
    rows = new Map();
    chains = Array.isArray(res.chains) ? res.chains : [];
    const wallets = [];
    for (const w of Array.isArray(res.wallets) ? res.wallets : []) {
      const acc = accounts.get(w.account) || { user: {}, contacts: [] };
      const cfg = readOldConfig(w.key);
      const name = str(acc.user.name).trim();
      const label = name || (w.account === 'default' ? '' : str(w.account));
      const language = locale(str(acc.user.language) || cfg.locale);
      const row = { ...w, label, contacts: acc.contacts.length, language, settings: settingsFor(w, acc.user, cfg) };
      rows.set(w.key, { ...row, contactRows: acc.contacts, user: acc.user });
      wallets.push(row);
    }
    return { wallets, chains };
  }

  async function importOne(row, { reuseChain, setLocale }) {
    const s = settings();
    //idempotent: a retry after a crash or a double click doesn't add the wallet twice
    const existing = s.wallets().find(w => w.dataDir === row.key || (w.importedFrom && w.importedFrom.dir === row.dir));
    if (existing) {
      s.setLegacyDecision(row.dir, 'imported');
      return existing.id;
    }
    const { id, configDir } = configService.newWalletDirs(row.network);
    await configService.registerWallet({
      id, network: row.network, configDir, dataDir: row.key, origin: 'imported', label: row.label,
      importedFrom: { app: row.app, account: row.account, dir: row.dir },
      settings: { ...row.settings },
    });
    try {
      const user = await userService.ensureUser(id, {
        name: row.label, language: row.language,
        nodeInternal: row.settings.nodeInternal, epicbox_domain: row.settings.epicbox_domain,
      });
      if (!user || typeof user.id !== 'number') throw new Error('no user row');
      const have = new Set((await addressbookService.getAddress(user.id) || []).map(dedupeKey));
      for (const c of row.contactRows) {
        const k = dedupeKey(c);
        if (have.has(k)) continue;
        have.add(k);
        try { await addressbookService.addAddress(contactRow(c, user.id)); }
        catch (e) { log('import ' + id + ': a contact was not added: ' + (e && e.message)); }
      }
    } catch (e) {
      //undo the list entry so a retry starts clean; nothing of the old wallet was touched
      try { s.removeWallet(id); } catch (e2) { /* already gone */ }
      throw e;
    }
    s.setLegacyDecision(row.dir, 'imported');
    if (setLocale && !s.app().locale && row.language) s.setApp({ locale: row.language });
    if (reuseChain && !s.nodeChainDir(row.network)) {
      const chain = (row.chainDir && chains.find(c => c.dir === row.chainDir)) || chains.find(c => c.network === row.network);
      if (chain) s.setNodeChainDir(row.network, chain.dir);
    }
    return id;
  }

  async function importWallets(keys, { reuseChain = true } = {}) {
    if (!rows.size) await scan();
    const s = settings();
    const hadDefault = !!s.defaultWalletId();
    const imported = [], failed = [];
    for (const key of Array.isArray(keys) ? keys : []) {
      const row = rows.get(key);
      if (!row) { failed.push({ key, reason: 'not found' }); continue; }
      try {
        const walletId = await importOne(row, { reuseChain, setLocale: imported.length === 0 });
        imported.push({ key, walletId });
      } catch (e) {
        failed.push({ key, reason: String(e && e.message || e) });
      }
    }
    if (!hadDefault && imported.length) s.setDefaultWallet(imported[0].walletId);
    return { imported, failed };
  }

  function markFresh(keys) {
    const marked = [];
    for (const key of Array.isArray(keys) ? keys : []) {
      const row = rows.get(key);
      if (!row) continue;
      settings().setLegacyDecision(row.dir, 'fresh');
      marked.push(key);
    }
    return { marked };
  }

  return { scan, importWallets, markFresh };
}
