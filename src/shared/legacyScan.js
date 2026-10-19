/*
 * Finds the wallets and chain data older GUIs (3.0.1 – 6.1.0 test builds) left behind, for the
 * first-start "Found N wallets" screen. Read only: nothing here writes, creates or moves a file.
 * Plain ESM, fs and path passed in (tests/legacyScan.test.js runs the Windows rules on Linux).
 *
 * Where old wallets are (docs/plans/fresh-start.md, "Importer"):
 *   ~/.epic/epic_3-0-0_config.json account_dirs [{account, userhomedir, network}]:
 *     4.x – 6.x: <userhomedir>/<main|floo|user>   (account 'default': userhomedir is ~/.epic)
 *     3.0.x:     <userhomedir>/<net>/<account>    (never moved by 6.1)
 *   folders: ~/.epic/<net> (the CLI's), ~/.epic/<account>/<net>, ~/.epic/<net>/<account>
 * A wallet is a dir holding wallet_data/wallet.seed.
 */
import { netShort, netFromShort } from './appPaths.js';
import { tomlNetwork } from './walletToml.js';
//Open a wallet folder's resolver, for the main process with the scans (background.js)
export { resolveWalletFolder } from './walletFolder.js';

const NETS = ['mainnet', 'floonet', 'usernet'];
const SHORTS = ['main', 'floo', 'user'];
//the chain walk counts at most this many entries: a size estimate must never stall the first start
const WALK_LIMIT = 20000;

function tryDo(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}

/* the account list of the old GUIs; a missing or broken file is no list, never an error */
function readAccountDirs(fs, file) {
  const cfg = tryDo(() => JSON.parse(fs.readFileSync(file, 'utf8')), null);
  const list = cfg && Array.isArray(cfg.account_dirs) ? cfg.account_dirs : [];
  return list.filter(e => e && typeof e === 'object' && typeof e.userhomedir === 'string' && e.userhomedir);
}

function subdirs(fs, pathMod, dir) {
  return tryDo(() => fs.readdirSync(dir, { withFileTypes: true }), [])
    .filter(d => d.isDirectory())
    .map(d => pathMod.join(dir, d.name));
}

function mtime(fs, file) {
  return tryDo(() => fs.statSync(file).mtimeMs, 0);
}

/* chain_type in the wallet's own toml, the last resort for its network */
function dirTomlNetwork(fs, pathMod, dir) {
  return tomlNetwork(tryDo(() => fs.readFileSync(pathMod.join(dir, 'epic-wallet.toml'), 'utf8'), ''));
}

/* which old GUI wrote the folder. config.json's version is the GUI's config version (3.0.0,
   4.0.1, 5.0.3, 5.0.4); 6.0 still writes 5.0.4, but its epic-wallet 4.x toml has
   owner_api_interface and it starts Tor (wallet_tor/), which 5.x never did. */
function guessApp(fs, pathMod, dir, layout30) {
  const cfg = tryDo(() => JSON.parse(fs.readFileSync(pathMod.join(dir, 'config.json'), 'utf8')), null);
  const version = cfg && typeof cfg.version === 'string' ? cfg.version : '';
  if (layout30 || version.startsWith('3.')) return '3.0.x';
  const toml = tryDo(() => fs.readFileSync(pathMod.join(dir, 'epic-wallet.toml'), 'utf8'), '');
  if (/^\s*owner_api_interface\s*=/m.test(toml) || fs.existsSync(pathMod.join(dir, 'wallet_tor'))) return '6.x';
  return '4.x–5.x';
}

/* approximate bytes of a chain: lmdb + txhashset + header, depth- and count-bounded;
   each file is also told to onFile(sub, bytes) */
function chainBytes(fs, pathMod, chainDir, onFile = () => {}) {
  let bytes = 0, seen = 0;
  const walk = (sub, dir, depth) => {
    for (const d of tryDo(() => fs.readdirSync(dir, { withFileTypes: true }), [])) {
      if (++seen > WALK_LIMIT) return;
      const p = pathMod.join(dir, d.name);
      if (d.isDirectory()) { if (depth < 4) walk(sub, p, depth + 1); }
      else if (d.isFile()) { const n = tryDo(() => fs.statSync(p).size, 0); bytes += n; onFile(sub, n); }
    }
  };
  for (const sub of ['lmdb', 'txhashset', 'header']) walk(sub, pathMod.join(chainDir, sub), 0);
  return bytes;
}

/*
 * fs: node's fs (sync calls); pathMod: path for the platform (path.win32 in tests);
 * legacy: appPaths.legacyPaths(); known: dirs already in 6.1's list or with a legacy decision.
 * → { wallets: [{key, dir, network, account, label, app, lastUsed, legacyDb, chainDir}],
 *     chains: [{dir, network, bytes}] }
 */
export function scanLegacy({ fs, pathMod, legacy, known = [] }) {
  const win = pathMod.sep === '\\';
  //Windows paths are case-insensitive: C:\Users\Jane\.epic and c:\users\jane\.EPIC are one folder
  const norm = (p) => win ? p.toLowerCase() : p;
  const real = (p) => tryDo(() => fs.realpathSync(p), pathMod.resolve(p));
  const skip = new Set();
  for (const k of known) {
    if (typeof k !== 'string' || !k) continue;
    skip.add(norm(pathMod.resolve(k)));
    skip.add(norm(real(k)));
  }

  const epicDir = legacy.epicDir;
  const wallets = [], chains = [];
  const seenWallets = new Set(), seenChains = new Set();

  const addChain = (chainDir, network) => {
    if (!fs.existsSync(pathMod.join(chainDir, 'lmdb'))) return '';
    const key = real(chainDir);
    if (!seenChains.has(norm(key))) {
      seenChains.add(norm(key));
      chains.push({ dir: key, network, bytes: chainBytes(fs, pathMod, key) });
    }
    return key;
  };

  /* info: what the account entry says ({account, network, layout30}); the folder fills the rest */
  const consider = (dir, info = {}) => {
    if (!fs.existsSync(pathMod.join(dir, 'wallet_data', 'wallet.seed'))) return;
    const key = real(dir);
    if (seenWallets.has(norm(key)) || skip.has(norm(key)) || skip.has(norm(pathMod.resolve(dir)))) return;
    seenWallets.add(norm(key));

    //names come from the path as found (what the old GUI showed), not from a symlink's target
    const named = pathMod.resolve(dir);
    const base = pathMod.basename(named), parent = pathMod.dirname(named);
    const parentBase = pathMod.basename(parent);
    const layout30 = !!info.layout30 || (!SHORTS.includes(base) && SHORTS.includes(parentBase));
    const network = NETS.includes(info.network) ? info.network
      : SHORTS.includes(base) ? netFromShort(base)
      : SHORTS.includes(parentBase) ? netFromShort(parentBase)
      : dirTomlNetwork(fs, pathMod, key) || 'mainnet';
    let account = typeof info.account === 'string' && info.account ? info.account : '';
    if (!account) {
      if (layout30) account = base;
      else if (norm(parent) === norm(pathMod.resolve(epicDir)) || norm(real(parent)) === norm(real(epicDir))) account = 'default';
      else account = parentBase;
    }

    const wd = pathMod.join(key, 'wallet_data');
    const used = Math.max(...['db/sqlite/epic.db-wal', 'db/sqlite/epic.db', 'db/lmdb/data.mdb', 'db', 'wallet.seed']
      .map(f => mtime(fs, pathMod.join(wd, ...f.split('/')))));
    const legacyDb = fs.existsSync(pathMod.join(wd, 'db', 'lmdb')) || !fs.existsSync(pathMod.join(wd, 'db', 'sqlite'));

    wallets.push({
      key, dir, network, account, label: '',
      app: guessApp(fs, pathMod, key, layout30),
      lastUsed: used ? new Date(used).toISOString() : '',
      legacyDb,
      chainDir: addChain(pathMod.join(key, 'chain_data'), network),
    });
  };

  //1. the account list first: its account name and network are what the user knew it by
  for (const e of readAccountDirs(fs, legacy.appConfigFile)) {
    if (!pathMod.isAbsolute(e.userhomedir)) continue;
    const net = NETS.includes(e.network) ? e.network : '';
    const account = typeof e.account === 'string' ? e.account : '';
    const info = { account, network: net };
    //an entry without a (valid) network: any network folder; the folder name then says which
    for (const short of net ? [netShort(net)] : SHORTS) {
      consider(pathMod.join(e.userhomedir, short), info);
      if (account && account !== 'default') {
        consider(pathMod.join(e.userhomedir, short, account), { ...info, layout30: true });
        //a 3.0 entry whose folder 4.x moved without updating the entry
        consider(pathMod.join(e.userhomedir, account, short), info);
      }
    }
  }

  //2. the folders in ~/.epic, for wallets the list lost or never had
  for (const sub of subdirs(fs, pathMod, epicDir)) {
    const name = pathMod.basename(sub);
    if (SHORTS.includes(name)) {
      consider(sub);
      for (const acc of subdirs(fs, pathMod, sub)) consider(acc);
    } else {
      for (const s of SHORTS) consider(pathMod.join(sub, s));
    }
  }

  //3. the CLI's chain data, ~/.epic/<net>/chain_data
  for (const s of SHORTS) addChain(pathMod.join(epicDir, s, 'chain_data'), netFromShort(s));

  return { wallets, chains };
}

//the header MMR's hashes: about 64 bytes per block header the node has
const HEADER_HASHES = ['header', 'header_head', 'pmmr_hash.bin'];

/* when a chain was written last: its lmdb (data.mdb changes with every block), else the folders */
function chainModified(fs, pathMod, chainDir) {
  return Math.max(...[['lmdb', 'data.mdb'], ['lmdb'], ['txhashset']].map(p => mtime(fs, pathMod.join(chainDir, ...p))));
}

/*
 * The chain data older apps and the CLI left behind, for the built-in node (Settings, the one-time
 * offer of shared/chainOffer.js): every <wallet dir>/chain_data with lmdb/ and txhashset/, whether
 * or not the wallet is in 6.1's list or still has its seed, and ~/.epic/<net>/chain_data (CLI).
 * Read only, like scanLegacy.
 * → [{dir, network, bytes, txhashsetBytes, headerBytes, modified}]   (modified: ms, 0 when unknown)
 */
export function scanChains({ fs, pathMod, legacy }) {
  const win = pathMod.sep === '\\';
  const norm = (p) => win ? p.toLowerCase() : p;
  const real = (p) => tryDo(() => fs.realpathSync(p), pathMod.resolve(p));
  const epicDir = legacy.epicDir;
  const chains = [];
  const seen = new Set();

  /* dir: a wallet folder (or ~/.epic/<net>); network: what its place says */
  const consider = (dir, network) => {
    if (!NETS.includes(network)) return;
    const chainDir = pathMod.join(dir, 'chain_data');
    //what every node 3.0.0 – 4.1.0-1 writes (shared/chainOffer.js USABLE)
    const parts = [['lmdb', 'data.mdb'], HEADER_HASHES, ['txhashset', 'kernel'], ['txhashset', 'output'], ['txhashset', 'rangeproof']];
    if (!parts.every(p => fs.existsSync(pathMod.join(chainDir, ...p)))) return;
    const key = real(chainDir);
    if (seen.has(norm(key))) return;
    seen.add(norm(key));
    let txhashsetBytes = 0;
    const bytes = chainBytes(fs, pathMod, key, (sub, n) => { if (sub === 'txhashset') txhashsetBytes += n; });
    const headerBytes = tryDo(() => fs.statSync(pathMod.join(key, ...HEADER_HASHES)).size, 0);
    chains.push({ dir: key, network, bytes, txhashsetBytes, headerBytes, modified: chainModified(fs, pathMod, key) });
  };
  /* <home>/<net>, its 3.0-layout accounts <home>/<net>/<account>, and <home>/<account>/<net> */
  const underHome = (home, nets) => {
    for (const s of SHORTS) {
      const network = netFromShort(s);
      if (!nets.includes(network)) continue;
      consider(pathMod.join(home, s), network);
      for (const acc of subdirs(fs, pathMod, pathMod.join(home, s))) consider(acc, network);
    }
    for (const sub of subdirs(fs, pathMod, home)) {
      const name = pathMod.basename(sub);
      if (SHORTS.includes(name)) continue;
      for (const s of SHORTS) if (nets.includes(netFromShort(s))) consider(pathMod.join(sub, s), netFromShort(s));
    }
  };

  //the account list first (its folders may be anywhere), then ~/.epic itself
  for (const e of readAccountDirs(fs, legacy.appConfigFile)) {
    if (!pathMod.isAbsolute(e.userhomedir)) continue;
    underHome(e.userhomedir, NETS.includes(e.network) ? [e.network] : NETS);
  }
  underHome(epicDir, NETS);
  return chains;
}
