/*
 * The wallet list, the current wallet and its files, on GUI 6.1's own root (shared/appPaths.js).
 *
 * One settings file, <root>/settings.json (shared/settingsStore.js), holds the app settings and
 * every wallet with its two folders:
 *   configDir  <root>/wallets/<id>: epic-wallet.toml, .owner_api_secret, .api_secret, the log
 *   dataDir    the folder holding wallet_data (the seed): configDir for wallets made in 6.1, an
 *              older GUI's folder for imported or opened ones, which 6.1 never writes settings to
 * The wallet's epic-wallet.toml (and the built-in node's epic-server.toml) are rendered from the
 * templates in resources/ on every start (shared/walletToml.js); nothing is read from an older
 * GUI's files here (only the importer, shared/importer.js, reads those).
 *
 * The I/O is passed in (deps), so tests/configService.test.js runs it on a fake file system; in the
 * app it comes from the preload (window.nodeFs, window.config.appPaths(), ...).
 */
import { layout, netFromShort } from './appPaths.js';
import { createSettingsStore, normalizeWallet, NETWORKS, WALLET_DEFAULTS } from './settingsStore.js';
import { renderWalletToml, renderNodeToml, networkPorts, walletMarkerText, WALLET_MARKER, tomlNetwork, localNodeUrl, isLocalNodeUrl } from './walletToml.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const WALLET_TOML = 'epic-wallet.toml';
export const NODE_TOML = 'epic-server.toml';
export const FOUNDATION = 'foundation.json';
const OWNER_SECRET = '.owner_api_secret';
const NODE_SECRET = '.api_secret';
//what a new wallet's folder may hold before its seed exists: these files only (see discardWalletDirs)
const PRE_SEED_FILES = [WALLET_TOML, OWNER_SECRET, NODE_SECRET, 'epic-wallet.log', WALLET_MARKER];

/* the preload's I/O, in the app */
function windowDeps() {
  return {
    fs: window.nodeFs,
    pathMod: window.nodePath,
    paths: window.config.appPaths(),
    resourcePath: window.config.getResourcePath(),
    platform: window.config.getPlatform(),
    arch: window.config.getArch(),
    isPortReachable: (host, port) => window.config.isPortReachable(host, port),
    nodeChildProcess: window.nodeChildProcess,
    debug: window.debug,
  };
}

/* the settings store of this renderer: one instance, so the theme (shared/theme.js) and
   configService never write each other's old values back */
let shared = null;
export function sharedSettings() {
  if (!shared) {
    shared = createSettingsStore({ fs: window.nodeFs, pathMod: window.nodePath, file: window.config.appPaths().settingsFile }).load();
  }
  return shared;
}

/* a random secret like the ones epic and epic-wallet write (20 letters and digits) */
function randomSecret() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, b => abc[b % abc.length]).join('');
}

class ConfigService {

  constructor(emitter, deps) {
    const d = deps || windowDeps();
    this.emitter = emitter;
    this.fs = d.fs;
    this.path = d.pathMod;
    this.paths = d.paths;
    this.layout = layout(this.paths.root, this.path);
    this.settings = d.settings || (deps ? createSettingsStore({ fs: d.fs, pathMod: d.pathMod, file: this.paths.settingsFile }).load() : sharedSettings());
    this.isPortReachable = d.isPortReachable;
    this.nodeChildProcess = d.nodeChildProcess;
    this.debug = d.debug;
    this.resourcePath = d.resourcePath;

    this.langs = {'bg': 'България', 'cz': 'Česko', 'de': 'Deutsch', 'en': 'English', 'fa': 'فارسی', 'hi': 'हिन्दी'};

    this.platform = d.platform;
    if (this.platform == 'mac' && d.arch == 'arm64') {
      this.platform = 'macsilicon';
    }
    //no quotes: the binaries are started without a shell (shared/spawnCommand.js)
    const bin = this.path.join(this.resourcePath, 'bin', this.platform);
    this.epicPath = this.path.resolve(bin, this.platform === 'win' ? 'epic-wallet.exe' : 'epic-wallet');
    this.epicNodePath = this.path.resolve(bin, this.platform === 'win' ? 'epic.exe' : 'epic');

    //mainnet's public node: the wallet's node while the built-in mainnet node syncs
    this.nodeFallBack = WALLET_DEFAULTS.check_node_api_http_addr;
    this.epicboxDomain = WALLET_DEFAULTS.epicbox_domain;

    this.resetConfig();
  }

  /* logout: no current wallet */
  resetConfig() {
    this.walletId = '';
    this.defaultAccountNetwork = 'mainnet';
    this.walletListenerPort = networkPorts('mainnet').walletListener;
    this.walletTOMLPath = '';
    this.nodeTOMLPath = '';
    this.walletNodeAddr = '';
    this.killedPorts = [];
  }

  /* the node a wallet uses while the built-in one syncs: mainnet's public node; floonet and
     usernet have none, so their own local node */
  getNodeFallBack(network = this.defaultAccountNetwork) {
    return network === 'mainnet' ? this.nodeFallBack : localNodeUrl(network);
  }

  /* the built-in node's API address for a network (default: the current wallet's) */
  localNodeUrl(network = this.defaultAccountNetwork) {
    return localNodeUrl(NETWORKS.includes(network) ? network : 'mainnet');
  }

  /* the node address used when a wallet has none set: the built-in node of its network */
  get defaultEpicNode() {
    return this.localNodeUrl();
  }

  /* the current wallet's record (a copy), null when none */
  get wallet() {
    if (!this.walletId) return null;
    try { return this.settings.wallet(this.walletId); } catch (e) { return null; }
  }
  get walletConfigDir() { const w = this.wallet; return w ? w.configDir : ''; }
  get walletDataDir() { const w = this.wallet; return w ? w.dataDir : ''; }

  /* the current wallet's settings, and the app language */
  get config() {
    const w = this.wallet;
    return { ...(w ? w.settings : {}), locale: this.settings.app().locale || '' };
  }

  /* locale goes to the app settings, the wallet's own keys to the current wallet; then the toml is
     rendered again (node address, Epicbox domain, node secret) */
  updateConfig(patch) {
    const p = Object.assign({}, patch);
    let ok = true;
    if ('locale' in p) {
      ok = this.settings.setApp({ locale: p.locale || '' }) && ok;
      delete p.locale;
    }
    const walletPatch = {};
    for (const k of Object.keys(p)) if (k in WALLET_DEFAULTS) walletPatch[k] = p[k];
    if (Object.keys(walletPatch).length && this.walletId) {
      ok = this.settings.updateWalletSettings(this.walletId, walletPatch) && ok;
      try {
        this.writeWalletToml();
        if (this.config.nodeInternal) this.writeNodeToml(this.defaultAccountNetwork);
      } catch (e) {
        console.log('configService.updateConfig: toml not written', e && e.message);
        ok = false;
      }
    }
    return ok;
  }

  /* --- folders --- */

  nodeDir(network) {
    return this.layout.nodeDir(network);
  }

  nodeChainDir(network) {
    return this.settings.nodeChainDir(network) || this.path.join(this.nodeDir(network), 'chain_data');
  }

  /* is there something in this dir (a missing dir is empty) */
  dirHasFiles(dir) {
    try {
      return this.fs.readdirSync(dir).length > 0;
    } catch (e) {
      return false;
    }
  }

  /* the folders of a new wallet: <root>/wallets/<id>, created empty. An id whose folder still holds
     files (a wallet removed from the list, a create that failed after init) is skipped: a wallet's
     folder is never shared */
  newWalletDirs(network) {
    if (!NETWORKS.includes(network)) throw new Error('unknown network ' + network);
    if (this.settings.readOnly) throw new Error('settings file not readable: ' + this.paths.settingsFile);
    let n = Number(this.settings.nextWalletId().slice(1));
    while (this.dirHasFiles(this.layout.walletDir('w' + n))) n++;
    const id = 'w' + n;
    const configDir = this.layout.walletDir(id);
    this.fs.mkdirSync(configDir, { recursive: true });
    return { id, configDir, dataDir: configDir };
  }

  /* a new wallet's folder after a create or restore that failed: removed only while it holds no
     wallet_data and nothing but the files written before the seed (by exact name). Returns true
     when the folder is gone. */
  discardWalletDirs({ configDir }) {
    if (!configDir || this.fs.existsSync(this.path.join(configDir, 'wallet_data'))) return false;
    for (const f of PRE_SEED_FILES) {
      const file = this.path.join(configDir, f);
      try { if (this.fs.existsSync(file)) this.fs.unlinkSync(file); } catch (e) { /* kept */ }
    }
    try {
      //not recursive: anything else in it keeps the folder
      this.fs.rmdirSync(configDir);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* add a wallet to the list (rec as in settingsStore: id, network, configDir, dataDir, origin, label,
     importedFrom, settings) after writing its toml; nothing is listed when the toml can't be written */
  registerWallet(rec) {
    if (this.settings.readOnly) throw new Error('settings file not readable: ' + this.paths.settingsFile);
    const w = normalizeWallet(rec);
    if (this.settings.wallets().some(x => x.id === w.id)) throw new Error('wallet ' + w.id + ' exists');
    this.fs.mkdirSync(w.configDir, { recursive: true });
    this.writeWalletToml(w);
    if (w.settings.nodeInternal) this.writeNodeToml(w.network);
    const added = this.settings.addWallet(rec);
    this.writeWalletMarker(added);
    return added;
  }

  /* Settings › Wallet: the label only (display; never part of a path), and WALLET.txt with it */
  renameWallet(id, label) {
    const ok = this.settings.updateWallet(id, { label });
    if (ok) this.writeWalletMarker(this.settings.wallet(id));
    return ok;
  }

  /* <configDir>/WALLET.txt (walletToml.walletMarkerText): informational, so a failure is only logged */
  writeWalletMarker(wallet) {
    try {
      this.writeFile(this.path.join(wallet.configDir, WALLET_MARKER),
        walletMarkerText(wallet, this.platform === 'win' ? '\r\n' : '\n'), 0o644);
      return true;
    } catch (e) {
      console.log('WALLET.txt not written: ' + (e && e.message));
      return false;
    }
  }

  /* the network of a wallet folder: the folder name (main, floo, user), else chain_type in the
     folder's own epic-wallet.toml (read only), else '' */
  networkOfDir(dir) {
    const fromName = netFromShort(this.path.basename(this.path.resolve(dir)));
    if (fromName) return fromName;
    try {
      return tomlNetwork(this.fs.readFileSync(this.path.join(dir, WALLET_TOML), 'utf8'));
    } catch (e) {
      return '';
    }
  }

  /*
   * Advanced › Open a wallet folder: a folder holding wallet_data/wallet.seed is listed with its data
   * in place and a new config dir. Resolves {ok: true, wallet} or {ok: false, reason}:
   *   'noseed' no wallet_data/wallet.seed in it; 'listed' already in the list;
   *   'network' unknown network: ask, then call again with it; 'readonly' the settings file is broken
   */
  openExistingWallet(dir, network) {
    if (this.settings.readOnly) return { ok: false, reason: 'readonly' };
    if (!dir || !this.path.isAbsolute(dir)) return { ok: false, reason: 'noseed' };
    const dataDir = this.path.resolve(dir);
    if (!this.fs.existsSync(this.path.join(dataDir, 'wallet_data', 'wallet.seed'))) return { ok: false, reason: 'noseed' };
    if (this.settings.wallets().some(w => this.path.resolve(w.dataDir) === dataDir)) return { ok: false, reason: 'listed' };
    const net = NETWORKS.includes(network) ? network : this.networkOfDir(dataDir);
    if (!net) return { ok: false, reason: 'network' };
    const dirs = this.newWalletDirs(net);
    try {
      const wallet = this.registerWallet({ id: dirs.id, network: net, configDir: dirs.configDir, dataDir, origin: 'opened' });
      return { ok: true, wallet };
    } catch (e) {
      this.discardWalletDirs(dirs);
      return { ok: false, reason: 'toml', msg: e && e.message };
    }
  }

  /* --- tomls --- */

  template(name) {
    return this.fs.readFileSync(this.path.join(this.resourcePath, name), 'utf8');
  }

  /* the node the wallet is told to use. Mainnet: the public node while the built-in one has not
     synced yet; floonet and usernet have no public node, so their local node always */
  walletNodeUrl(settings, network = 'mainnet') {
    const local = this.localNodeUrl(network);
    const addr = settings.check_node_api_http_addr || local;
    return network === 'mainnet' && settings.nodesynced == false && addr == local ? this.nodeFallBack : addr;
  }

  /* <configDir>/epic-wallet.toml of the current (or the given) wallet, written whole every time */
  writeWalletToml(wallet = this.wallet) {
    if (!wallet) throw new Error('no wallet');
    const s = wallet.settings;
    const nodeUrl = this.walletNodeUrl(s, wallet.network);
    const file = this.path.join(wallet.configDir, WALLET_TOML);
    const text = renderWalletToml({
      template: this.template(WALLET_TOML), network: wallet.network, configDir: wallet.configDir, dataDir: wallet.dataDir,
      nodeUrl, epicboxDomain: s.epicbox_domain || this.epicboxDomain,
      //the built-in node's secret only goes to a node on this machine, never to a public node
      //(the one used while the built-in node syncs, or one typed in)
      nodeApiSecretPath: s.nodeInternal && isLocalNodeUrl(nodeUrl) ? this.path.join(this.nodeDir(wallet.network), NODE_SECRET) : '',
    });
    this.writeFile(file, text);
    if (wallet.id === this.walletId) {
      this.walletTOMLPath = file;
      this.walletNodeAddr = nodeUrl;
    }
    return file;
  }

  /* the built-in node of a network: <root>/node/<net>/ with its toml, foundation.json and an api
     secret (written here, so a wallet started next to the node finds it at once) */
  writeNodeToml(network) {
    const nodeDir = this.nodeDir(network);
    this.fs.mkdirSync(nodeDir, { recursive: true });
    const foundationPath = this.path.join(nodeDir, FOUNDATION);
    if (!this.fs.existsSync(foundationPath)) {
      this.fs.copyFileSync(this.path.join(this.resourcePath, FOUNDATION), foundationPath);
    }
    const apiSecretPath = this.path.join(nodeDir, NODE_SECRET);
    if (!this.readSecret(apiSecretPath)) {
      this.fs.writeFileSync(apiSecretPath, randomSecret(), { encoding: 'utf8', mode: 0o600 });
    }
    const file = this.path.join(nodeDir, NODE_TOML);
    this.writeFile(file, renderNodeToml({
      template: this.template(NODE_TOML), network, nodeDir, chainDir: this.nodeChainDir(network), foundationPath, apiSecretPath,
    }));
    return file;
  }

  /* write via a temp file, so a crash never leaves half a toml */
  writeFile(file, text, mode = 0o600) {
    const tmp = file + '.tmp';
    this.fs.writeFileSync(tmp, text, { encoding: 'utf8', mode });
    this.fs.renameSync(tmp, file);
  }

  readSecret(file) {
    try {
      return this.fs.readFileSync(file, 'utf8').toString().trim();
    } catch (e) {
      return '';
    }
  }

  /* the secrets are read when used: epic-wallet creates them in a new config dir at its first start */
  get ownerApiSecretPath() { return this.walletConfigDir ? this.path.join(this.walletConfigDir, OWNER_SECRET) : ''; }
  get ownerApisecret() { return this.ownerApiSecretPath ? this.readSecret(this.ownerApiSecretPath) : ''; }
  /* the node secret the GUI sends to a local node: the built-in node's, else the wallet's own */
  get apiSecretPath() {
    if (!this.walletId) return '';
    return this.config.nodeInternal ? this.path.join(this.nodeDir(this.defaultAccountNetwork), NODE_SECRET) : this.path.join(this.walletConfigDir, NODE_SECRET);
  }
  get apisecret() { return this.apiSecretPath ? this.readSecret(this.apiSecretPath) : ''; }

  /* the built-in node of the current wallet's network: its toml, written again */
  startCheckNode() {
    try {
      this.nodeTOMLPath = this.writeNodeToml(this.defaultAccountNetwork);
      return true;
    } catch (e) {
      console.log('configService.startCheckNode: node toml not written', e && e.message);
      this.nodeTOMLPath = '';
      return false;
    }
  }

  /*
   * Before unlocking a wallet: make it the current one and write its toml.
   *   'login'   ready to start
   *   'missing' unknown id, or no wallet_data/wallet.seed in its data dir (folder moved or gone)
   *   'toml'    its toml (or the built-in node's) could not be written
   */
  startCheck(walletId) {
    let w;
    try { w = this.settings.wallet(walletId); } catch (e) { return 'missing'; }
    if (!this.fs.existsSync(this.path.join(w.dataDir, 'wallet_data', 'wallet.seed'))) {
      this.emitter && this.emitter.emit('checkFail', 'wallet folder missing: ' + w.dataDir);
      return 'missing';
    }
    this.resetConfig();
    this.walletId = w.id;
    this.defaultAccountNetwork = w.network;
    this.walletListenerPort = networkPorts(w.network).walletListener;
    try {
      this.fs.mkdirSync(w.configDir, { recursive: true });
      this.writeWalletToml(w);
      if (w.settings.nodeInternal) this.nodeTOMLPath = this.writeNodeToml(w.network);
    } catch (e) {
      this.emitter && this.emitter.emit('checkFail', 'wallet toml not written: ' + (e && e.message));
      return 'toml';
    }
    //kept current (a folder copied by hand, a label renamed in another version of the file)
    this.writeWalletMarker(w);
    this.emitter && this.emitter.emit('checkSuccess', 'wallet toml written');
    return 'login';
  }

  /* --- another root (Advanced, only while the list is empty; needs a restart: window.api.relaunch) --- */

  locationFile() {
    return this.paths.defaultRoot ? this.path.join(this.paths.defaultRoot, 'location.json') : '';
  }

  canMoveRoot() {
    return !this.settings.readOnly && this.settings.wallets().length === 0 && this.paths.source !== 'env' && !!this.locationFile();
  }

  /* a path as the OS compares it: resolved, through symlinks when it exists, any case on Windows */
  comparablePath(p) {
    let r = this.path.resolve(p);
    if (typeof this.fs.realpathSync === 'function') {
      try { r = this.fs.realpathSync(r); } catch (e) { /* not there (yet): as given */ }
    }
    return this.path.sep === '\\' ? r.toLowerCase() : r;
  }

  /* is `dir` the folder `parent` or inside it */
  isSameOrInside(dir, parent) {
    if (!parent) return false;
    const rel = this.path.relative(this.comparablePath(parent), this.comparablePath(dir));
    return rel === '' || (!rel.startsWith('..') && !this.path.isAbsolute(rel));
  }

  /*
   * Advanced › Keep app data in another folder. Resolves {ok: true} or {ok: false, reason}:
   *   'notallowed' wallets in the list, root set by EPIC_GUI_HOME, broken settings, or not an absolute path
   *   'legacy'     ~/.epic or an older GUI's profile folder (or a folder inside one): never written by 6.1
   *   'wallet'     a wallet folder (wallet_data in it or in a folder above it)
   *   'notempty'   the folder holds files: 6.1's root must be new or empty
   *   'failed'     the folder or location.json could not be written
   * The default root itself clears location.json (clearRoot).
   */
  setRoot(dir) {
    if (!this.canMoveRoot() || !dir || typeof dir !== 'string' || !this.path.isAbsolute(dir)) return { ok: false, reason: 'notallowed' };
    const root = this.path.resolve(dir);
    if (this.comparablePath(root) === this.comparablePath(this.paths.defaultRoot)) {
      return this.clearRoot() ? { ok: true } : { ok: false, reason: 'failed' };
    }
    const legacy = this.paths.legacy || {};
    const legacyDirs = [legacy.epicDir, legacy.appConfigFile && this.path.dirname(legacy.appConfigFile),
      ...(Array.isArray(legacy.profiles) ? legacy.profiles.map(p => p && p.dir) : [])].filter(d => typeof d === 'string' && d);
    if (legacyDirs.some(d => this.isSameOrInside(root, d))) return { ok: false, reason: 'legacy' };
    for (let d = root; ; d = this.path.dirname(d)) {
      if (this.fs.existsSync(this.path.join(d, 'wallet_data'))) return { ok: false, reason: 'wallet' };
      if (this.path.dirname(d) === d) break;
    }
    if (this.dirHasFiles(root)) return { ok: false, reason: 'notempty' };
    try {
      this.fs.mkdirSync(root, { recursive: true });
      this.fs.mkdirSync(this.paths.defaultRoot, { recursive: true });
      this.writeFile(this.locationFile(), JSON.stringify({ root }, null, 2));
      return { ok: true };
    } catch (e) {
      console.log('configService.setRoot', e && e.message);
      return { ok: false, reason: 'failed' };
    }
  }

  /* back to the default root */
  clearRoot() {
    if (!this.canMoveRoot()) return false;
    try {
      if (this.fs.existsSync(this.locationFile())) this.fs.unlinkSync(this.locationFile());
      return true;
    } catch (e) {
      return false;
    }
  }

  /* --- processes --- */

  /*
   * find epic-wallet, node and Tor processes this app started earlier (a crash, an old session,
   * a background node or Epicbox listener) and close them if user confirms via prompt.
   * Processes the app did not start (e.g. the user's own CLI wallet or node, or an older GUI's)
   * are never listed.
   */
  async killEpicProcess() {

    //the node and the Epicbox listener stay if the user runs them in the background
    const cfg = this.config;
    const roles = ['owner_api', 'listen', 'scan',
      ...(cfg.epicbox_background ? [] : ['epicbox']),
      ...(!cfg.node_background ? ['node'] : [])];

    //one process scan for wallet, node and Tor: each scan spawns ps (powershell on Windows, ~1 s there).
    //This wallet's processes (its config dir); the owner API and http listener of any of our wallets
    //too, since they hold the ports this wallet needs (3420, the listener port); another wallet's
    //Epicbox listener or scan is left alone. Tor of a listener lives in the wallet's data dir (wallet_tor)
    let killPids = await this.nodeChildProcess.ownedProcesses(roles, {dir: this.walletConfigDir, anyDirRoles: ['owner_api', 'listen'],
      tor: true, torDirs: [this.walletDataDir].filter(Boolean)});
    this.allKilled = true;

    if (killPids.length) {
      this.debug ? console.log('configService.killEpicProcess', JSON.stringify(killPids)) : null;
      return new Promise((resolve) => {
        this.emitter.emit('killEpicProcess', {pid: killPids, callback: async (confirmed) => {
          if (confirmed) {
            const killed = await this.nodeChildProcess.stopPids(killPids.map(p => p.pid));
            //false when a process could not be killed (or did not exit in time)
            this.allKilled = killed.every(k => k !== false);
            //the ports these processes held, to wait for before starting new ones
            const has = (role) => killPids.some(p => p.role == role);
            this.killedPorts = [
              ...(has('owner_api') ? [3420] : []),
              ...(has('listen') ? [this.walletListenerPort] : []),
              ...(has('node') ? [this.getNodeApiPort()] : []),
            ];
            resolve(true);
          } else {
            resolve(false);
          }
        }});
      });
    }
    return null;
  }

  /* the api port of the built-in node for the current network */
  getNodeApiPort() {
    return networkPorts(this.defaultAccountNetwork).nodeApi;
  }

  /* after killEpicProcess: wait until the killed processes released their ports (at most timeoutMs) */
  async waitForKilledPorts(timeoutMs = 5000) {
    const ports = this.killedPorts || [];
    this.killedPorts = [];
    const started = Date.now();
    for (const port of ports) {
      while (await this.isPortReachable('127.0.0.1', port)) {
        if (Date.now() - started > timeoutMs) {
          return false;
        }
        await delay(100);
      }
    }
    return true;
  }

}

export default ConfigService
