/*
 * The arguments the GUI starts epic-wallet with (used by walletService.js). Plain ESM without app
 * imports, so it runs under `node --test` (tests/walletArgs.test.js).
 *
 * Every wallet has two folders (shared/settingsStore.js): configDir, 6.1's own (epic-wallet.toml,
 * secrets, log), and dataDir, the folder holding wallet_data (the same folder for wallets made in
 * 6.1, an older GUI's folder for imported ones). -c is always configDir, so the toml 6.1 rendered
 * is read and the secrets are made there; -t (the top level dir) is dataDir. Tor's files go to
 * <dataDir>/wallet_tor (checked with 4.1.0). The process record names the wallet by its -c dir.
 *
 * The owner API gets no password: it starts with -t a dir that holds no wallet (inside configDir,
 * never in an imported dataDir; epic-wallet does not create it), so it does not open (or ask for)
 * the wallet at start. The app then points it at dataDir (set_top_level_directory) and opens it
 * with the password over the encrypted JSON-RPC (open_wallet). A wallet check runs on that owner
 * API too (scan).
 *
 * epic-wallet 4.1.0 reads a missing password only from a terminal (/dev/tty, CONIN$), never from
 * stdin, and has no env var or password file: the listeners (http, Epicbox) and init/recover,
 * which need the open wallet from their start, still get --pass.
 */

//the -t dir of the owner API: inside configDir, never holds a wallet
export const OWNER_API_START_DIR = 'owner_api_closed';

export function networkArgs(network) {
  return network && network !== 'mainnet' ? ['--' + network] : [];
}

function need(o, ...keys) {
  for (const k of keys) if (!o[k]) throw new Error('epic-wallet args: ' + k + ' missing');
}

/* owner_api: no password; startDir a dir without a wallet (configDir/OWNER_API_START_DIR) */
export function ownerApiArgs({ network, configDir, dataDir, startDir }) {
  need({ configDir, startDir }, 'configDir', 'startDir');
  if (startDir === configDir || startDir === dataDir) throw new Error('owner_api needs a start dir without a wallet');
  return [...networkArgs(network), '--offline_mode', '-c', configDir, '-t', startDir, 'owner_api'];
}

/* http listener (method is always http: Epicbox has epicboxArgs) */
export function listenArgs({ network, configDir, dataDir, password, tor }) {
  need({ configDir, dataDir }, 'configDir', 'dataDir');
  return [...networkArgs(network), '--pass', password, '-t', dataDir, '-c', configDir, 'listen', '--method', 'http',
    ...(tor === false ? ['--no_tor'] : [])];
}

export function epicboxArgs({ network, configDir, dataDir, password }) {
  need({ configDir, dataDir }, 'configDir', 'dataDir');
  return [...networkArgs(network), '--pass', password, '-t', dataDir, '-c', configDir, 'listen', '--method', 'epicbox', '--no_tor'];
}

/* init, or init -r (recover): the recovery phrase goes to stdin. A new wallet only (configDir ==
   dataDir): 4.1.0's init refuses a folder that already has an epic-wallet.toml and writes its own
   default there, so it runs on the empty folder and 6.1 renders its toml over it afterwards. */
export function initArgs({ network, configDir, password, recover }) {
  need({ configDir }, 'configDir');
  return [...networkArgs(network), '--pass', password, '-c', configDir, 'init', ...(recover ? ['-r'] : [])];
}

/* an owner API status message ({Scanning: [text, percent]}, {ScanningComplete: text}, ...) as one line */
export function statusMessageText(m) {
  if (!m || typeof m !== 'object') return String(m == null ? '' : m);
  const [kind, v] = Object.entries(m)[0] || ['', ''];
  if (Array.isArray(v)) return v[1] != null ? `${v[0]} (${v[1]}%)` : String(v[0]);
  return v == null || v === '' ? kind : String(v);
}
