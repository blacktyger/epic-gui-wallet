/*
 * Where GUI 6.1 keeps its files, and where older GUIs kept theirs (read only by the importer).
 * Plain ESM without app imports: used by background.js, preload.js and the renderer, and runs
 * under `node --test` (tests/appPaths.test.js). Every input is passed in, so the Windows rules
 * are tested on Linux.
 *
 *   <root>/settings.json        app settings and the wallet list (shared/settingsStore.js)
 *   <root>/wallets/<id>/        per wallet: epic-wallet.toml, secrets, log (and wallet_data for
 *                               wallets made in 6.1; an imported wallet's data stays in its old folder)
 *   <root>/node/<main|floo|user>/  the built-in node: epic-server.toml, foundation.json, .api_secret,
 *                               chain_data (unless an older wallet's chain data is reused)
 *   <root>/app/                 Electron userData (IndexedDB: contacts; caches)
 *   <root>/logs/                GUI logs
 *   <root>/gui_processes.json   the processes this app started (shared/processOwnership.js)
 *
 * The root is, first match wins:
 *   1. env EPIC_GUI_HOME (tests, portable use)
 *   2. <default root>/location.json {"root": "<absolute dir>"} (Advanced: another folder, chosen
 *      on a fresh start)
 *   3. the default: ~/.epic-gui (Linux, macOS), %LOCALAPPDATA%\EpicCash\Wallet (Windows)
 */

export const ENV_ROOT = 'EPIC_GUI_HOME';
export const LOCATION_FILE = 'location.json';
export const SETTINGS_FILE = 'settings.json';

/* the network's folder name, as epic and the older GUIs use it */
export function netShort(network) {
  return network === 'floonet' ? 'floo' : network === 'usernet' ? 'user' : 'main';
}

export function netFromShort(short) {
  return { main: 'mainnet', floo: 'floonet', user: 'usernet' }[short] || '';
}

/* platform: process.platform ('linux' | 'darwin' | 'win32'); env: process.env; home: os.homedir()
   pathMod: require('path') for this platform (path.win32 in tests of Windows) */
export function defaultRoot({ platform, env = {}, home, pathMod }) {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || pathMod.join(home, 'AppData', 'Local');
    return pathMod.join(local, 'EpicCash', 'Wallet');
  }
  return pathMod.join(home, '.epic-gui');
}

/* readFile(path) → string, throws when missing. A broken or relative location.json is ignored
   (the default root is used) rather than starting with no settings at a wrong place. */
export function resolveRoot({ platform, env = {}, home, pathMod, readFile }) {
  const fromEnv = env[ENV_ROOT];
  if (fromEnv && pathMod.isAbsolute(fromEnv)) return { root: pathMod.normalize(fromEnv), source: 'env' };
  const def = defaultRoot({ platform, env, home, pathMod });
  if (readFile) {
    try {
      const loc = JSON.parse(readFile(pathMod.join(def, LOCATION_FILE)));
      if (loc && typeof loc.root === 'string' && pathMod.isAbsolute(loc.root)) {
        return { root: pathMod.normalize(loc.root), source: 'location', defaultRoot: def };
      }
    } catch (e) { /* no location file: the default */ }
  }
  return { root: def, source: 'default', defaultRoot: def };
}

/* every 6.1 path under a root */
export function layout(root, pathMod) {
  const j = (...p) => pathMod.join(root, ...p);
  return {
    root,
    settingsFile: j(SETTINGS_FILE),
    walletsDir: j('wallets'),
    walletDir: (id) => j('wallets', id),
    nodeDir: (network) => j('node', netShort(network)),
    userData: j('app'),
    logsDir: j('logs'),
    processesFile: j('gui_processes.json'),
  };
}

/* the files older GUIs (3.0.1 – 6.1.0 test builds) left: read only, and only by the importer.
   appData: app.getPath('appData') (~/.config, %APPDATA%, ~/Library/Application Support) */
export function legacyPaths({ platform, env = {}, home, appData, pathMod }) {
  const epicDir = pathMod.join(platform === 'win32' && env.USERPROFILE ? env.USERPROFILE : home, '.epic');
  const data = appData || (platform === 'win32'
    ? (env.APPDATA || pathMod.join(home, 'AppData', 'Roaming'))
    : platform === 'darwin' ? pathMod.join(home, 'Library', 'Application Support') : pathMod.join(home, '.config'));
  return {
    epicDir,
    appConfigFile: pathMod.join(epicDir, 'epic_3-0-0_config.json'),
    //Electron userData: productName up to 5.3.1, package name from 6.0.0
    profiles: [
      { app: '≤5.3.1', dir: pathMod.join(data, 'EpicWallet') },
      { app: '6.0+', dir: pathMod.join(data, 'epic-desktop-wallet') },
    ],
  };
}
