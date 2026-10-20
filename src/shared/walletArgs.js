/*
 * The arguments the GUI starts epic-wallet with (used by walletService.js). Plain ESM without app
 * imports, so it runs under `node --test` (tests/walletArgs.test.js).
 *
 * Every wallet has two folders (shared/settingsStore.js): configDir, 6.1's own (epic-wallet.toml,
 * secrets, log), and dataDir, the folder holding wallet_data (the same folder for wallets made in
 * 6.1, an older GUI's folder for imported ones). -c is always configDir, so the toml 6.1 rendered
 * is read and the secrets are made there; -t (the top level dir) is dataDir. The process record
 * names the wallet by its -c dir. Every listener runs with --no_tor (6.1.3 has no Tor).
 *
 * The owner API gets no password: it starts with -t a dir that holds no wallet (inside configDir,
 * never in an imported dataDir; epic-wallet does not create it), so it does not open (or ask for)
 * the wallet at start. The app then points it at dataDir (set_top_level_directory) and opens it
 * with the password over the encrypted JSON-RPC (open_wallet). A wallet check runs on that owner
 * API too (scan).
 *
 * epic-wallet 4.1.0 reads a missing password only from a terminal (/dev/tty, CONIN$), never from
 * stdin, and has no env var or password file. The listeners (http, Epicbox) and init/recover,
 * which need the password at their start, run on a pseudo-terminal in the main process, which
 * answers the prompt (shared/ptyHost.js): their args have no password either. Only when a
 * pseudo-terminal can't be used on a platform does the main process add it (withPassArg).
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

/* http listener (method is always http: Epicbox has epicboxArgs); asks for the password */
export function listenArgs({ network, configDir, dataDir }) {
  need({ configDir, dataDir }, 'configDir', 'dataDir');
  return [...networkArgs(network), '-t', dataDir, '-c', configDir, 'listen', '--method', 'http', '--no_tor'];
}

/* Epicbox listener; asks for the password */
export function epicboxArgs({ network, configDir, dataDir }) {
  need({ configDir, dataDir }, 'configDir', 'dataDir');
  return [...networkArgs(network), '-t', dataDir, '-c', configDir, 'listen', '--method', 'epicbox', '--no_tor'];
}

/* init, or init -r (recover): asks for the new password twice (and first the recovery phrase).
   A new wallet only (configDir == dataDir): 4.1.0's init refuses a folder that already has an
   epic-wallet.toml and writes its own default there, so it runs on the empty folder and 6.1
   renders its toml over it afterwards. */
export function initArgs({ network, configDir, recover }) {
  need({ configDir }, 'configDir');
  return [...networkArgs(network), '-c', configDir, 'init', ...(recover ? ['-r'] : [])];
}

/* the commands the main process runs on a pseudo-terminal: how many password prompts each has,
   and whether it asks for the recovery phrase */
export const PTY_KINDS = {
  listen: { passwords: 1, phrase: false },
  epicbox: { passwords: 1, phrase: false },
  init: { passwords: 2, phrase: false },
  recover: { passwords: 2, phrase: true },
};

const PASS_FLAGS = ['--pass', '--password', '-p'];

/* do these args carry a password (they must not, except in withPassArg's fallback); -pVALUE too */
export function hasPassArg(args) {
  return (Array.isArray(args) ? args : []).some(a => PASS_FLAGS.includes(String(a)) || PASS_FLAGS.some(f => String(a).startsWith(f + '='))
    || /^-p./.test(String(a)));
}

//each kind's command after the global options, exactly as the builders above make it
const PTY_COMMANDS = {
  listen: [['listen', '--method', 'http', '--no_tor']],
  epicbox: [['listen', '--method', 'epicbox', '--no_tor']],
  init: [['init']],
  recover: [['init', '-r']],
};

function isAbsolute(p) {
  return typeof p === 'string' && (p.startsWith('/') || /^[a-z]:[\\/]/i.test(p) || /^\\\\[^\\]/.test(p));
}

/*
 * The main process starts only what the builders above make: an optional network flag, then
 * -t/-c with absolute dirs, then the kind's own command. Returns {dir} (the wallet dir: -t, else
 * -c), or throws. So a request can't run another subcommand (recover, send) with the password.
 */
export function checkPtyArgs(kind, args) {
  const cmds = PTY_COMMANDS[kind];
  if (!cmds) throw new Error('unknown kind');
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) throw new Error('args must be strings');
  if (hasPassArg(args)) throw new Error('args must not carry a password');
  let i = 0;
  if (args[i] === '--floonet' || args[i] === '--usernet') i++;
  const dirs = {};
  while (args[i] === '-t' || args[i] === '-c') {
    const flag = args[i];
    const dir = args[i + 1];
    if (dirs[flag] !== undefined || !isAbsolute(dir)) throw new Error('bad ' + flag + ' dir');
    dirs[flag] = dir;
    i += 2;
  }
  const rest = args.slice(i);
  if (!cmds.some(c => c.length === rest.length && c.every((x, j) => x === rest[j]))) throw new Error('not a ' + kind + ' command');
  const listener = kind === 'listen' || kind === 'epicbox';
  if (listener ? !(dirs['-t'] && dirs['-c']) : !dirs['-c']) throw new Error('missing dir');
  return { dir: dirs['-t'] || dirs['-c'] };
}

/*
 * The two processes the preload starts itself (not on a pseudo-terminal): the owner API, exactly as
 * ownerApiArgs makes it, and the built-in node (nodeService.internalNodeStart: an optional network
 * flag, server --config_file <toml> run). Returns the paths they are given ({configDir, startDir}
 * or {configFile}) for the caller to check, or throws. So the page can't run another subcommand
 * (send, finalize, clean) or point one at a file of its choice.
 */
export function checkSpawnArgs(role, args) {
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) throw new Error('args must be strings');
  if (hasPassArg(args)) throw new Error('args must not carry a password');
  let i = 0;
  if (args[i] === '--floonet' || args[i] === '--usernet') i++;
  const rest = args.slice(i);
  if (role === 'owner_api') {
    const ok = rest.length === 6 && rest[0] === '--offline_mode' && rest[1] === '-c' && rest[3] === '-t' && rest[5] === 'owner_api'
      && isAbsolute(rest[2]) && isAbsolute(rest[4]);
    if (!ok) throw new Error('not an owner_api command');
    return { configDir: rest[2], startDir: rest[4] };
  }
  if (role === 'node') {
    const ok = rest.length === 4 && rest[0] === 'server' && rest[1] === '--config_file' && rest[3] === 'run' && isAbsolute(rest[2]);
    if (!ok) throw new Error('not a node command');
    return { configFile: rest[2] };
  }
  throw new Error('unknown role');
}

/* fallback only (no pseudo-terminal on this platform): the args with `--pass <password>` before
   the first dir option, where epic-wallet reads its global options */
export function withPassArg(args, password) {
  const out = (Array.isArray(args) ? args : []).map(String);
  let i = out.findIndex(a => a === '-t' || a === '-c');
  if (i < 0) i = out.findIndex(a => !a.startsWith('--'));
  if (i < 0) i = out.length;
  out.splice(i, 0, '--pass', String(password));
  return out;
}

/* an owner API status message ({Scanning: [text, percent]}, {ScanningComplete: text}, ...) as one line */
export function statusMessageText(m) {
  if (!m || typeof m !== 'object') return String(m == null ? '' : m);
  const [kind, v] = Object.entries(m)[0] || ['', ''];
  if (Array.isArray(v)) return v[1] != null ? `${v[0]} (${v[1]}%)` : String(v[0]);
  return v == null || v === '' ? kind : String(v);
}
