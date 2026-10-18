/*
 * Which epic processes belong to this app.
 *
 * The app used to find wallet, node and Tor processes by name and stop (or reuse) whatever matched,
 * which also hit a user's own CLI wallet or node. Now every process the app spawns is recorded in a
 * small JSON file (pid, role, binary, wallet dir or node config) and only recorded processes are
 * ever stopped or reused. The file outlives the app, so a background node or Epicbox listener is
 * still known after a restart; a recorded pid only counts while its command line is still the one
 * the app started (same binary, same dir, same role), so a reused pid is never touched.
 *
 * Tor is started by the http listener, not by the app: a Tor process counts as ours when its torrc
 * is in one of our wallet dirs and its parent is ours or no epic-wallet at all (orphaned).
 *
 * Also: redaction of passwords in command lines, for anything that is logged.
 *
 * Used by preload.js (spawns, renderer API) and background.js (quit). No Electron or DOM imports,
 * so it runs under `node --test` (tests/processOwnership.test.js).
 */

export const ROLES = ['owner_api', 'listen', 'epicbox', 'scan', 'node'];

//one scan for everything we may own: wallet and node binaries (and cmd.exe wrappers of them) and Tor
export const SCAN_PATTERN = /epic|torrc/i;

const PASS_FLAGS = ['--pass', '--password', '-p'];

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

function unquote(s) {
  return String(s == null ? '' : s).replace(/"/g, '');
}

/* compare paths the way the OS does: Windows is case-insensitive and takes both separators */
function norm(s, win) {
  const u = unquote(s).trim();
  return win ? u.replace(/\//g, '\\').toLowerCase() : u;
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
  const a = (Array.isArray(args) ? args : []).map(x => String(x));
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
  const network = plain.includes('--floonet') ? 'floonet' : (plain.includes('--usernet') ? 'usernet' : 'mainnet');
  return { role, bin: unquote(cmd), dir, network };
}

//a whole argument (paths may contain spaces, so compare with the quotes removed and spaces around)
function hasArg(cmd, value) {
  return (' ' + cmd + ' ').includes(' ' + value + ' ');
}

const ROLE_TEST = {
  owner_api: c => hasArg(c, 'owner_api'),
  listen: c => hasArg(c, 'listen') && !/\s--method\s+epicbox(\s|$)/.test(c),
  epicbox: c => hasArg(c, 'listen') && /\s--method\s+epicbox(\s|$)/.test(c),
  scan: c => hasArg(c, 'scan'),
  node: c => hasArg(c, 'server') && hasArg(c, 'run'),
};

/* is this command line still the one we recorded? */
export function cmdMatchesEntry(entry, cmd, win) {
  if (!entry || !ROLE_TEST[entry.role] || !entry.bin || !entry.dir || typeof cmd !== 'string') return false;
  const c = norm(cmd, win);
  return c.includes(norm(entry.bin, win)) && hasArg(c, norm(entry.dir, win)) && ROLE_TEST[entry.role](c);
}

export function torrcPath(dir, win) {
  const sep = win ? '\\' : '/';
  return unquote(dir).replace(/[\\/]+$/, '') + sep + ['tor', 'listener', 'torrc'].join(sep);
}

function baseName(p) {
  return unquote(p).split(/[\\/]/).pop();
}

/*
 * The running processes that are ours, from one process list (find-process entries).
 *   roles:   which recorded roles to return (default all)
 *   dir:     only wallet/node processes of this dir; network: only nodes of this network
 *   tor:     also return our Tor processes (torrc in a dir of a recorded http listener or in torDirs)
 * A recorded pid matches the process with that pid, or its direct child: on Windows the app spawns
 * through cmd.exe, so the recorded pid is the shell and epic-wallet.exe is its child.
 * Returns {owned: [{pid, ppid, role, dir, entryPid, name, cmd}], live: entries that still run}.
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
    const matches = list.filter(p => (p.pid == entry.pid || p.ppid == entry.pid) && cmdMatchesEntry(entry, p.cmd, win));
    if (!matches.length) continue;
    live.push(entry);
    if (!roles.includes(entry.role)) continue;
    if (opts.dir && norm(entry.dir, win) !== norm(opts.dir, win) && entry.role !== 'node') continue;
    if (opts.network && entry.role === 'node' && entry.network !== opts.network) continue;
    for (const p of matches) {
      if (seen.has(p.pid)) continue;
      seen.add(p.pid);
      owned.push({ pid: p.pid, ppid: p.ppid, role: entry.role, dir: entry.dir, entryPid: entry.pid,
        name: baseName(entry.bin) + ' (' + entry.role + ')', cmd: redactCmd(p.cmd) });
    }
  }

  if (opts.tor) {
    const dirs = [...(opts.torDirs || []), ...recorded.filter(e => e.role === 'listen').map(e => e.dir)].filter(Boolean);
    const torrcs = [...new Set(dirs.map(d => norm(torrcPath(d, win), win)))];
    const allOurs = new Set(live.flatMap(e => list.filter(p => p.pid == e.pid || p.ppid == e.pid).map(p => p.pid)));
    for (const p of list) {
      if (seen.has(p.pid) || typeof p.cmd !== 'string') continue;
      const c = norm(p.cmd, win);
      if (!torrcs.some(t => hasArg(c, t))) continue;
      //a Tor of someone else's epic-wallet on the same dir is left alone
      const parent = list.find(q => q.pid == p.ppid);
      if (parent && !allOurs.has(parent.pid) && /epic-wallet/i.test(parent.cmd || '')) continue;
      seen.add(p.pid);
      owned.push({ pid: p.pid, ppid: p.ppid, role: 'tor', dir: '', entryPid: null, name: baseName(p.bin || p.name || 'tor') + ' (tor)', cmd: redactCmd(p.cmd) });
    }
  }
  return { owned, live };
}

/*
 * The record of spawned processes, kept in `file` (JSON array), with the I/O passed in:
 *   fs: node fs; findProcess: find-process; kill(pid) → Promise<boolean>; win: Windows
 */
export function createProcessRegistry({ fs, file, findProcess, kill, win = false, now = () => Date.now() }) {

  function load() {
    try {
      const data = JSON.parse(fs.readFileSync(file, { encoding: 'utf8' }));
      return Array.isArray(data) ? data.filter(e => e && e.pid > 0 && ROLES.includes(e.role)).map(e => Object.assign(e, { at: Number(e.at) || 0 })) : [];
    } catch (e) {
      return [];
    }
  }

  function save(entries) {
    try {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(entries), { encoding: 'utf8' });
      fs.renameSync(tmp, file);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* after a spawn: cmd and args as passed to spawn(); untracked commands are ignored */
  function record(pid, cmd, args) {
    const desc = describeSpawn(cmd, args);
    if (!desc || !(pid > 0)) return null;
    const entry = Object.assign({ pid, at: now() }, desc);
    save(load().filter(e => e.pid != pid).concat(entry));
    return entry;
  }

  function forget(pids) {
    const drop = new Set((Array.isArray(pids) ? pids : [pids]).map(Number));
    const entries = load();
    const kept = entries.filter(e => !drop.has(Number(e.pid)));
    if (kept.length != entries.length) save(kept);
  }

  async function scan(roles, opts) {
    const scanStarted = now();
    const procs = await findProcess('name', SCAN_PATTERN);
    const entries = load();
    const { owned, live } = findOwned(entries, procs, Object.assign({}, opts, { roles, win }));
    //spawned while the scan ran: not in the list yet, but not gone either
    const keep = entries.filter(e => live.includes(e) || e.at >= scanStarted);
    if (keep.length != entries.length) save(keep);
    return { owned, procs };
  }

  /* our running processes (see findOwned); records whose process is gone are dropped */
  async function list(roles, opts = {}) {
    return (await scan(roles, opts)).owned;
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
    //not running any more counts as stopped; running but not ours is not stopped
    return [...want].map(pid => {
      const i = picked.findIndex(p => p.pid == pid);
      return i >= 0 ? results[i] : !procs.some(p => p.pid == pid);
    });
  }

  return { load, record, forget, list, stop, stopPids };
}
