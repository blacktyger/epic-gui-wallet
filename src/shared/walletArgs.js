/*
 * The arguments the GUI starts epic-wallet with (used by walletService.js). Plain ESM without app
 * imports, so it runs under `node --test` (tests/walletArgs.test.js).
 *
 * The owner API gets no password: it starts with its config from the wallet dir (-c) but with a
 * top level dir (-t) that holds no wallet, so it does not open (or ask for) the wallet at start.
 * The app then points it at the wallet (set_top_level_directory) and opens it with the password
 * over the encrypted JSON-RPC (open_wallet). A wallet check runs on that owner API too (scan).
 *
 * epic-wallet 4.1.0 reads a missing password only from a terminal (/dev/tty, CONIN$), never from
 * stdin, and has no env var or password file: the listeners (http, Epicbox) and init/recover,
 * which need the open wallet from their start, still get --pass.
 */

//the -t dir of the owner API: inside the wallet dir, never holds a wallet (epic-wallet doesn't create it)
export const OWNER_API_START_DIR = 'owner_api_closed';

export function networkArgs(network) {
  return network && network !== 'mainnet' ? ['--' + network] : [];
}

/* owner_api: no password; dir is the wallet dir, startDir a dir without a wallet (OWNER_API_START_DIR in it) */
export function ownerApiArgs({ network, dir, startDir }) {
  if (!dir || !startDir || startDir === dir) throw new Error('owner_api needs the wallet dir and a separate start dir');
  return [...networkArgs(network), '--offline_mode', '-c', dir, '-t', startDir, 'owner_api'];
}

/* http listener (method is always http: Epicbox has epicboxArgs) */
export function listenArgs({ network, dir, password, tor }) {
  return [...networkArgs(network), '--pass', password, '-t', dir, '-c', dir, 'listen', '--method', 'http',
    ...(tor === false ? ['--no_tor'] : [])];
}

export function epicboxArgs({ network, dir, password }) {
  return [...networkArgs(network), '--pass', password, '-t', dir, '-c', dir, 'listen', '--method', 'epicbox', '--no_tor'];
}

/* init, or init -r (recover): the recovery phrase goes to stdin */
export function initArgs({ network, dir, password, recover }) {
  return [...networkArgs(network), '--pass', password, '-c', dir, 'init', ...(recover ? ['-r'] : [])];
}

/* an owner API status message ({Scanning: [text, percent]}, {ScanningComplete: text}, ...) as one line */
export function statusMessageText(m) {
  if (!m || typeof m !== 'object') return String(m == null ? '' : m);
  const [kind, v] = Object.entries(m)[0] || ['', ''];
  if (Array.isArray(v)) return v[1] != null ? `${v[0]} (${v[1]}%)` : String(v[0]);
  return v == null || v === '' ? kind : String(v);
}
