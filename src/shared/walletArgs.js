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
 * stdin, and has no env var or password file. The listeners (http, Epicbox) and init/recover,
 * which need the password at their start, run on a pseudo-terminal in the main process, which
 * answers the prompt (shared/ptyHost.js): their args have no password either. Only when a
 * pseudo-terminal can't be used on a platform does the main process add it (withPassArg).
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

/* http listener (method is always http: Epicbox has epicboxArgs); asks for the password */
export function listenArgs({ network, dir, tor }) {
  return [...networkArgs(network), '-t', dir, '-c', dir, 'listen', '--method', 'http',
    ...(tor === false ? ['--no_tor'] : [])];
}

/* Epicbox listener; asks for the password */
export function epicboxArgs({ network, dir }) {
  return [...networkArgs(network), '-t', dir, '-c', dir, 'listen', '--method', 'epicbox', '--no_tor'];
}

/* init, or init -r (recover): asks for the new password twice (and first the recovery phrase) */
export function initArgs({ network, dir, recover }) {
  return [...networkArgs(network), '-c', dir, 'init', ...(recover ? ['-r'] : [])];
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
  listen: [['listen', '--method', 'http'], ['listen', '--method', 'http', '--no_tor']],
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
