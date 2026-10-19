/*
 * Which epic processes belong to this app.
 *
 * The app used to find wallet, node and Tor processes by name and stop (or reuse) whatever matched,
 * which also hit a user's own CLI wallet or node. Now every process the app spawns is recorded in a
 * small JSON file (pid, role, binary, wallet dir or node config) and only recorded processes are
 * ever stopped or reused. The file outlives the app, so a background node, or an Epicbox listener an
 * older version kept running, is still known after a restart; a recorded pid only counts while its command line is still the one
 * the app started (same executable, same dir, same role), so a reused pid is never touched.
 *
 * Tor is started by the http listener, not by the app: a Tor process counts as ours when its torrc
 * is in one of our wallet dirs and its parent is ours or no epic-wallet at all (orphaned).
 *
 * The first start of this version finds no file: the previous version's background node or Epicbox
 * listener is adopted once, if it runs the app's own bundled binary on this account (adopt()). The
 * node is then reused; a listener is stopped at login (configService.killEpicProcess) and started
 * again on the pseudo-terminal.
 *
 * Also: redaction of passwords in command lines, for anything that is logged.
 *
 * Used by preload.js (spawns, renderer API) and background.js (quit). No Electron or DOM imports,
 * so it runs under `node --test` (tests/processOwnership.test.js).
 */

export const ROLES = ['owner_api', 'listen', 'epicbox', 'scan', 'node'];
const WALLET_ROLES = ['owner_api', 'listen', 'epicbox', 'scan'];

//one scan for everything we may own: wallet and node binaries (and cmd.exe wrappers of them) and Tor
export const SCAN_PATTERN = /epic|torrc/i;

const PASS_FLAGS = ['--pass', '--password', '-p'];

//the Epicbox server of a recorded epicbox listener
const SERVER_URL = /^wss?:\/\/[A-Za-z0-9.-]+(:\d+)?$/;

/* the dir (inside the wallet dir) of the short-lived listener that checks the old Epicbox server
   after a server change: it is never a background listener, so it is stopped at lock and quit */
export const EPICBOX_CHECK_DIR = 'epicbox_check';
export function isEpicboxCheckDir(dir) {
  return String(dir || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() === EPICBOX_CHECK_DIR;
}

//the only executables a record may name
const BIN_NAME = /^(epic|epic-wallet|tor)(\.exe)?$/i;

/* `--pass X` / `-p X` / `--pass=X` → `--pass <redacted>`, for any command line that is logged */
export function redactCmd(cmd) {
  if (typeof cmd !== 'string') return cmd;
  return cmd.replace(/(^|\s)(--pass|--password|-p)(=|\s+)("[^"]*"|'[^']*'|\S+)/g, '$1$2$3<redacted>');
}

export function redactArgs(args) {
  if (!Array.isArray(args)) return args;
  return args.map((a, i) => (i > 0 && PASS_FLAGS.includes(args[i - 1]) ? '<redacted>' : redactCmd(String(a))));
}

/* a copy of a find-process entry that is safe to log or show */
export function redactProcess(p) {
  if (!p || typeof p !== 'object') return p;
  return Object.assign({}, p, { cmd: redactCmd(p.cmd), bin: redactCmd(p.bin) });
}

/* spawn args without the password (flag and value): a password like "owner_api" or "-c" must not
   read as a role or a dir */
export function stripPassArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (PASS_FLAGS.includes(a)) { i++; continue; }
    if (PASS_FLAGS.some(f => a.startsWith(f + '='))) continue;
    out.push(a);
  }
  return out;
}

function unquote(s) {
  return String(s == null ? '' : s).replace(/"/g, '');
}

/* compare paths the way the OS does: Windows is case-insensitive and takes both separators */
function norm(s, win) {
  const u = unquote(s).trim();
  return win ? u.replace(/\//g, '\\').toLowerCase() : u;
}

function baseName(p) {
  return unquote(p).split(/[\\/]/).pop();
}

function isAbsPath(p, win) {
  const s = unquote(p).trim();
  return win ? /^([a-z]:[\\/]|\\\\[^\\])/i.test(s) : s.startsWith('/');
}

function argAfter(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? unquote(args[i + 1]) : '';
}

/*
 * What a spawn of the wallet or node binary is, from its arguments: {role, bin, dir, network},
 * or null for commands that are not tracked (init, recover: they end by themselves).
 * dir is the wallet dir (-c, else -t) or, for the node, its --config_file.
 */
export function describeSpawn(cmd, args) {
  const a = stripPassArgs(Array.isArray(args) ? args : []);
  const plain = a.map(unquote);
  let role = null;
  if (plain.includes('owner_api')) role = 'owner_api';
  else if (plain.includes('listen')) role = argAfter(a, '--method') === 'epicbox' ? 'epicbox' : 'listen';
  else if (plain.includes('scan')) role = 'scan';
  else if (plain.includes('server') && plain.includes('run')) role = 'node';
  if (!role) return null;
  const dir = role === 'node' ? argAfter(a, '--config_file') : (argAfter(a, '-c') || argAfter(a, '-t'));
  //without a dir there is nothing that tells our process from another one
  if (!dir) return null;
  return { role, bin: unquote(cmd), dir, network: networkOf(plain) };
}

function networkOf(plainArgs) {
  return plainArgs.includes('--floonet') ? 'floonet' : (plainArgs.includes('--usernet') ? 'usernet' : 'mainnet');
}

/* a record that is safe to act on: known role, absolute paths, one of our executables */
export function validEntry(e, win) {
  return !!e && typeof e === 'object' && Number.isInteger(Number(e.pid)) && Number(e.pid) > 0
    && ROLES.includes(e.role) && typeof e.bin === 'string' && typeof e.dir === 'string'
    && isAbsPath(e.bin, win) && isAbsPath(e.dir, win) && BIN_NAME.test(baseName(e.bin));
}

//a whole argument (paths may contain spaces, so compare with the quotes removed and spaces around)
function hasArg(cmd, value) {
  return (' ' + cmd + ' ').includes(' ' + value + ' ');
}

/* a cmd.exe process (find-process entry) */
function isCmdExe(p) {
  const c = String(p.cmd || '').trim();
  const first = c.startsWith('"') ? c.slice(1, c.indexOf('"', 1)) : c.split(/\s+/)[0];
  return /^cmd(\.exe)?$/i.test(baseName(p.name || '')) || /^cmd(\.exe)?$/i.test(baseName(first));
}

/* Windows: 6.0.0 spawned with {shell: true}, which runs `cmd.exe /d /s /c "<command>"`; the command inside */
function unwrapCmdExe(c) {
  const m = c.match(/^("[^"]*"|\S+)\s+((?:\/[a-z]\s+)*)\/c\s+([\s\S]*)$/i);
  if (!m || !/^cmd(\.exe)?$/i.test(baseName(m[1]))) return c;
  let inner = m[3].trim();
  //with /s, cmd.exe drops the outer quotes itself
  if (/(^|\s)\/s(\s|$)/i.test(m[2]) && inner.length >= 2 && inner.startsWith('"') && inner.endsWith('"')) {
    inner = inner.slice(1, -1);
  }
  return inner;
}

/*
 * The arguments of a live command line whose executable (first argument) is exactly `bin`, else
 * null: /opt/E/epic is not /opt/E/epic-wallet. Windows: quotes, case and the cmd.exe wrapper.
 */
export function argsAfterBin(cmd, bin, win) {
  if (typeof cmd !== 'string') return null;
  const want = norm(bin, win);
  if (!want) return null;
  let c = cmd.trim();
  if (win) c = unwrapCmdExe(c);
  if (c.startsWith('"')) {
    const end = c.indexOf('"', 1);
    if (end < 0 || norm(c.slice(1, end), win) !== want) return null;
    const rest = c.slice(end + 1);
    return rest === '' || /^\s/.test(rest) ? rest : null;
  }
  //unquoted: ps joins argv with spaces, so the path may contain spaces; then a space or the end
  const head = c.slice(0, want.length);
  if ((win ? head.replace(/\//g, '\\').toLowerCase() : head) !== want) return null;
  const rest = c.slice(want.length);
  return rest === '' || /^\s/.test(rest) ? rest : null;
}

const ROLE_TEST = {
  owner_api: c => hasArg(c, 'owner_api'),
  listen: c => hasArg(c, 'listen') && !/\s--method\s+epicbox(\s|$)/.test(c),
  epicbox: c => hasArg(c, 'listen') && /\s--method\s+epicbox(\s|$)/.test(c),
  scan: c => hasArg(c, 'scan'),
  node: c => hasArg(c, 'server') && hasArg(c, 'run'),
};

/* the arguments of a live command line, password redacted (so it can't pass as a role or a dir),
   normalised, with a space on each side */
function liveArgs(cmd, bin, win) {
  const rest = argsAfterBin(cmd, bin, win);
  return rest == null ? null : ' ' + norm(redactCmd(rest), win) + ' ';
}

function dirMatches(c, entry, win) {
  const dir = norm(entry.dir, win);
  const flags = entry.role === 'node' ? ['--config_file'] : ['-c', '-t'];
  return flags.some(f => hasArg(c, f + ' ' + dir));
}

/* is this command line still the one we recorded? */
export function cmdMatchesEntry(entry, cmd, win) {
  if (!entry || !ROLE_TEST[entry.role] || !entry.bin || !entry.dir) return false;
  const c = liveArgs(cmd, entry.bin, win);
  return c != null && dirMatches(c, entry, win) && ROLE_TEST[entry.role](c);
}

/* where Tor's torrc of a wallet dir is: epic-wallet 4.1 uses <dir>/wallet_tor/torrc, older ones
   <dir>/tor/listener/torrc */
export function torrcPaths(dir, win) {
  const sep = win ? '\\' : '/';
  const top = unquote(dir).replace(/[\\/]+$/, '');
  return [['wallet_tor', 'torrc'], ['tor', 'listener', 'torrc']].map(p => top + sep + p.join(sep));
}

/*
 * The running processes that are ours, from one process list (find-process entries).
 *   roles:   which recorded roles to return (default all)
 *   dir:     only wallet/node processes of this dir; network: only nodes of this network
 *   tor:     also return our Tor processes (torrc in a dir of a recorded http listener or in torDirs)
 * A recorded pid matches the process with that pid. The app starts the binaries without a shell, so
 * that is epic-wallet.exe / epic.exe itself; only a cmd.exe wrapper recorded by 6.0.0 (shell: true)
 * or adopted from it also matches its direct epic child.
 * Returns {owned: [{pid, ppid, role, dir, entryPid, name}], live: entries that still run}. No
 * command line: it may hold a password (with spaces, past what redaction can see), and owned is logged.
 */
export function findOwned(entries, procs, opts = {}) {
  const win = !!opts.win;
  const roles = opts.roles || ROLES;
  const list = Array.isArray(procs) ? procs : [];
  const recorded = Array.isArray(entries) ? entries : [];
  const owned = [];
  const live = [];
  const seen = new Set();

  for (const entry of recorded) {
    const self = list.find(p => p.pid == entry.pid);
    const wrapper = win && !!self && isCmdExe(self);
    const matches = list.filter(p => (p.pid == entry.pid || (wrapper && p.ppid == entry.pid)) && cmdMatchesEntry(entry, p.cmd, win));
    if (!matches.length) continue;
    live.push(entry);
    if (!roles.includes(entry.role)) continue;
    if (opts.dir && norm(entry.dir, win) !== norm(opts.dir, win) && entry.role !== 'node') continue;
    if (opts.network && entry.role === 'node' && entry.network !== opts.network) continue;
    for (const p of matches) {
      if (seen.has(p.pid)) continue;
      seen.add(p.pid);
      owned.push({ pid: p.pid, ppid: p.ppid, role: entry.role, dir: entry.dir, entryPid: entry.pid,
        name: baseName(entry.bin) + ' (' + entry.role + ')', server: entry.server || '' });
    }
  }

  if (opts.tor) {
    const dirs = [...(opts.torDirs || []), ...recorded.filter(e => e.role === 'listen').map(e => e.dir)].filter(Boolean);
    const torrcs = [...new Set(dirs.flatMap(d => torrcPaths(d, win).map(t => norm(t, win))))];
    const allOurs = new Set(live.flatMap(e => list.filter(p => p.pid == e.pid || p.ppid == e.pid).map(p => p.pid)));
    for (const p of list) {
      if (seen.has(p.pid) || typeof p.cmd !== 'string') continue;
      const c = norm(redactCmd(p.cmd), win);
      if (!torrcs.some(t => hasArg(c, t))) continue;
      //a Tor of someone else's epic-wallet on the same dir is left alone
      const parent = list.find(q => q.pid == p.ppid);
      if (parent && !allOurs.has(parent.pid) && /epic-wallet/i.test(parent.cmd || '')) continue;
      seen.add(p.pid);
      owned.push({ pid: p.pid, ppid: p.ppid, role: 'tor', dir: '', entryPid: null, name: baseName(p.bin || p.name || 'tor') + ' (tor)' });
    }
  }
  return { owned, live };
}

/* the path, if it is the app's own bundled `name` binary (…/resources/bin/<platform>/name), else '' */
function bundledBin(bin, name, win) {
  const b = unquote(bin).trim();
  const m = b.match(/[\\/]resources[\\/]bin[\\/][^\\/]+[\\/]([^\\/]+)$/i);
  const exe = m ? m[1].toLowerCase() : '';
  return b && isAbsPath(b, win) && (exe === name || exe === name + '.exe') ? b : '';
}

/*
 * Leftovers of the previous version (which recorded nothing) that are surely ours, as records to
 * adopt: the app's bundled wallet binary on this account's wallet dir, the bundled node binary on
 * this account's node config and network. Never a binary outside the app's resources/bin.
 *   opts: {walletBin, nodeBin, dir, nodeConfig, network, win}
 * Windows: of a cmd.exe wrapper and its epic child only the wrapper (taskkill /t takes the tree).
 */
export function pickAdoptable(procs, opts = {}) {
  const win = !!opts.win;
  const list = Array.isArray(procs) ? procs : [];
  const kinds = [
    { bin: bundledBin(opts.walletBin, 'epic-wallet', win), dir: opts.dir, roles: WALLET_ROLES },
    { bin: bundledBin(opts.nodeBin, 'epic', win), dir: opts.nodeConfig, roles: ['node'] },
  ].filter(k => k.bin && k.dir && isAbsPath(k.dir, win));
  const picked = [];
  for (const p of list) {
    if (!(p && p.pid > 0) || picked.some(e => e.pid == p.pid)) continue;
    for (const k of kinds) {
      const c = liveArgs(p.cmd, k.bin, win);
      if (c == null) continue;
      const network = networkOf(c.trim().split(/\s+/));
      const role = k.roles.find(r => cmdMatchesEntry({ role: r, bin: k.bin, dir: unquote(k.dir) }, p.cmd, win));
      if (!role || (role === 'node' && opts.network && network !== opts.network)) continue;
      picked.push({ pid: p.pid, ppid: p.ppid, role, bin: k.bin, dir: unquote(k.dir), network });
      break;
    }
  }
  return picked.filter(e => !win || !picked.some(q => q !== e && q.pid == e.ppid)).map(({ pid, role, bin, dir, network }) => ({ pid, role, bin, dir, network }));
}

/*
 * Does this pid run, on its own (no process list): POSIX kill(pid, 0), Windows tasklist for one pid.
 * Resolves true, false, or null when it can't tell (then a record is kept).
 *   processKill: process.kill; execFile: child_process.execFile
 */
export function createPidCheck({ win = false, processKill, execFile }) {
  return function pidAlive(pid) {
    const n = Number(pid);
    if (!Number.isInteger(n) || n <= 0) return Promise.resolve(false);
    if (!win) {
      try {
        processKill(n, 0);
        return Promise.resolve(true);
      } catch (e) {
        //EPERM: it runs, as another user
        return Promise.resolve(e && e.code === 'ESRCH' ? false : (e && e.code === 'EPERM' ? true : null));
      }
    }
    return new Promise(resolve => {
      execFile('tasklist', ['/FI', 'PID eq ' + n, '/NH', '/FO', 'CSV'], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
        const out = String(stdout || '');
        if (err || !out.trim()) return resolve(null);
        if (new RegExp('^"[^"]*","' + n + '"', 'm').test(out)) return resolve(true);
        //no CSV row: the (localised) "no tasks" message
        resolve(/^\s*"/m.test(out) ? null : false);
      });
    });
  };
}

const RENAME_BUSY = ['EPERM', 'EBUSY', 'EACCES'];
const RENAME_TRIES = 4;

//the renderer can't Atomics.wait; this only runs when a rename failed, for a few ms
function pause(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* wait */ }
}

/*
 * The record of spawned processes, kept in `file` (JSON array), with the I/O passed in:
 *   fs: node fs; findProcess: find-process; kill(pid) → Promise<boolean>; win: Windows
 *   pidAlive(pid) → Promise<true|false|null> (createPidCheck); warn(msg): log a warning
 *   selfPid: this process's pid, for its own temp file
 * Main (background.js) and the preload both write it: every write re-reads the file and changes
 * only what it means to, so one doesn't drop the other's records.
 */
export function createProcessRegistry({ fs, file, findProcess, kill, win = false, now = () => Date.now(),
  pidAlive = async () => null, warn = () => {}, selfPid = 0 }) {

  function load() {
    let text;
    try {
      text = fs.readFileSync(file, { encoding: 'utf8' });
    } catch (e) {
      if (e && e.code !== 'ENOENT') warn('process record ' + file + ' not readable: ' + (e.code || e.message));
      return [];
    }
    try {
      const data = JSON.parse(text);
      return Array.isArray(data) ? data.filter(e => validEntry(e, win)).map(e => Object.assign(e, { at: Number(e.at) || 0 })) : [];
    } catch (e) {
      return [];
    }
  }

  function write(entries) {
    const data = JSON.stringify(entries);
    const direct = (why) => {
      //rename failed (Windows: antivirus, or the other process reading the file): write in place
      try {
        fs.writeFileSync(file, data, { encoding: 'utf8', mode: 0o600 });
        return true;
      } catch (e) {
        warn('process record ' + file + ' not saved: ' + (why ? why + ', ' : '') + (e.code || e.message));
        return false;
      }
    };
    const tmp = file + '.tmp.' + (selfPid || 0);
    try {
      const dir = file.match(/^(.*)[\\/][^\\/]*$/);
      if (dir && dir[1]) fs.mkdirSync(dir[1], { recursive: true });
      fs.writeFileSync(tmp, data, { encoding: 'utf8', mode: 0o600 });
    } catch (e) {
      return direct(e.code || e.message);
    }
    for (let i = 1; ; i++) {
      try {
        fs.renameSync(tmp, file);
        return true;
      } catch (e) {
        if (i < RENAME_TRIES && RENAME_BUSY.includes(e.code)) {
          pause(10 * i);
          continue;
        }
        try { fs.unlinkSync(tmp); } catch (e2) { /* gone already */ }
        return direct('rename ' + (e.code || e.message));
      }
    }
  }

  /* read, change, write: change(entries) returns the new list, or null for no change */
  function update(change) {
    const next = change(load());
    return next ? write(next) : true;
  }

  /* after a spawn: cmd and args as passed to spawn(); untracked commands are ignored.
     extra.server: the Epicbox server an epicbox listener was started with (wss://host:port), so a
     listener that outlives the app (Epicbox in background) is still known to be on it at the next login */
  function record(pid, cmd, args, extra = {}) {
    const desc = describeSpawn(cmd, args);
    if (!desc || !(pid > 0)) return null;
    const entry = Object.assign({ pid, at: now() }, desc);
    if (desc.role === 'epicbox' && extra && typeof extra.server === 'string' && SERVER_URL.test(extra.server)) {
      entry.server = extra.server;
    }
    if (!validEntry(entry, win)) return null;
    update(entries => entries.filter(e => e.pid != pid).concat(entry));
    return entry;
  }

  function forget(pids) {
    const drop = new Set((Array.isArray(pids) ? pids : [pids]).map(Number));
    update(entries => {
      const kept = entries.filter(e => !drop.has(Number(e.pid)));
      return kept.length != entries.length ? kept : null;
    });
  }

  /* records the scan did not find: forget only the ones that are surely gone */
  async function prune(missing, procs) {
    //an empty scan (ps failed, PowerShell output that did not parse) tells nothing
    if (!missing.length || !Array.isArray(procs) || !procs.length) return;
    //a pid that still runs (reused, or a line the scan garbled) keeps its record: it is never acted on
    //unless its command line is ours again, and it goes once that process ends
    const gone = (await Promise.all(missing.map(async e => (
      (await pidAlive(e.pid).catch(() => null)) === false ? e : null
    )))).filter(Boolean);
    if (!gone.length) return;
    //the same pid may have been recorded again meanwhile: drop only these records
    update(entries => {
      const kept = entries.filter(e => !gone.some(g => g.pid == e.pid && g.at == e.at));
      return kept.length != entries.length ? kept : null;
    });
  }

  async function scan(roles, opts) {
    const scanStarted = now();
    const procs = await findProcess('name', SCAN_PATTERN);
    const entries = load();
    const { owned, live } = findOwned(entries, procs, Object.assign({}, opts, { roles, win }));
    //spawned while the scan ran: not in the list yet, but not gone either
    await prune(entries.filter(e => !live.includes(e) && e.at < scanStarted), procs);
    return { owned, procs };
  }

  /* our running processes (see findOwned); records whose process is gone are dropped */
  async function list(roles, opts = {}) {
    return (await scan(roles, opts)).owned;
  }

  /*
   * Once, when there is no record file yet (first start of this version): record the previous
   * version's processes that pickAdoptable finds. opts: {walletBin, nodeBin, dir, nodeConfig, network}.
   * Resolves the adopted records.
   */
  async function adopt(opts = {}) {
    if (fs.existsSync(file)) return [];
    const procs = await findProcess('name', SCAN_PATTERN).catch(() => null);
    //an empty or failed scan may hide them: try again next start (any record creates the file first)
    if (!Array.isArray(procs) || !procs.length) return [];
    const at = now();
    const picked = pickAdoptable(procs, Object.assign({}, opts, { win })).map(e => Object.assign({ at }, e)).filter(e => validEntry(e, win));
    update(entries => entries.filter(e => !picked.some(p => p.pid == e.pid)).concat(picked));
    return picked;
  }

  /* stop processes returned by list(); resolves one boolean per process (true: it is gone) */
  async function stop(owned) {
    const procs = Array.isArray(owned) ? owned : [];
    const pids = new Set(procs.map(p => p.pid));
    const results = new Map();
    //Windows: taskkill /t takes the children along (cmd.exe → epic-wallet.exe → tor.exe)
    const top = win ? procs.filter(p => !pids.has(p.ppid)) : procs;
    await Promise.all(top.map(async p => results.set(p.pid, await kill(p.pid).catch(() => false))));
    const resultOf = p => {
      if (results.has(p.pid)) return results.get(p.pid);
      const parent = procs.find(q => q.pid == p.ppid);
      return parent ? resultOf(parent) : false;
    };
    const out = procs.map(resultOf);
    forget(procs.filter((p, i) => out[i] && p.entryPid).map(p => p.entryPid));
    return out;
  }

  /* stop by pid, only if the pid is (still) one of ours: one fresh scan */
  async function stopPids(pids) {
    const want = new Set((Array.isArray(pids) ? pids : [pids]).map(Number));
    const { owned, procs } = await scan(ROLES, { tor: true });
    //a listed process may be the shell of a recorded pid, or the pid's child: take both along
    const picked = owned.filter(p => want.has(Number(p.pid)) || want.has(Number(p.entryPid)) || want.has(Number(p.ppid)));
    const results = await stop(picked);
    //not running any more counts as stopped; running but not ours (in the scan or not) is not stopped
    return Promise.all([...want].map(async pid => {
      const i = picked.findIndex(p => p.pid == pid);
      if (i >= 0) return results[i];
      return !procs.some(p => p.pid == pid) && (await pidAlive(pid).catch(() => null)) !== true;
    }));
  }

  return { load, record, forget, list, adopt, stop, stopPids };
}
