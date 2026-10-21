/*
 * The wallet's own tor (tor-616 §4, D1): one per open wallet, started by the main process on
 * private `auto` ports with a control port, so the app knows when it is ready and why it isn't.
 *
 *   off → starting (progress 0-100) → publishing → ready, or failed {error, detail} from any of them
 *   retrying: true while an automatic restart (network, stopped, publish) is waiting or running. The
 *   first failure (quietRestarts) restarts quietly: the state stays starting, the error only logged.
 *   From the next one the error shows (failed, retrying) and the restarts go on behind it at the
 *   last backoff; a later start that bootstraps leaves it by itself (publishing, ready)
 *   ready: bootstrap 100 % and the first HS_DESC UPLOADED of the wallet's onion. Sending needs only
 *   the bootstrap (canSend); republishing is tor's job, a later HS_DESC FAILED is only logged.
 *
 * Errors (§4): missing (no binary), start (tor exited before its control file appeared: its last
 * [err]/[warn] line), network (progress stuck 60 s, or no 100 % after 120 s: restarted after 5 s,
 * 30 s, then every 2 min; shown from the 2nd failure), clock (CLOCK_SKEW before the bootstrap), keys (no key for the
 * onion, or tor published another one), listener (the wallet's HTTP listener doesn't answer),
 * stopped (tor exited or closed its control port after the bootstrap: restarted like network),
 * publish (bootstrapped, but no HS_DESC UPLOADED within publishMs: restarted like network),
 * node (started with waitListener: the page's listener could not start because the node doesn't
 * answer; tor bootstraps anyway, so sending works, and the onion is added once the listener port
 * answers, checked every listenerWaitMs. Shown as failed/node only once bootstrapped: before
 * that the bootstrap's own progress, or its network error, is what counts).
 *
 * Start (start()): torrc in <configDir>/tor, data in <configDir>/tor/data (0700); `tor -f <torrc>
 * --defaults-torrc <empty>`, no shell; cookie auth; TAKEOWNERSHIP (tor exits when the app's
 * control connection closes, and with __OwningControllerProcess when the app is gone); the key
 * (ensureKey: the one-shot epic-wallet run when the key file is missing), expanded in memory
 * (onion.js keyForTor), never written or logged; ADD_ONION port 80 → 127.0.0.1:<listener port>.
 * Stop (stop()): DEL_ONION, SIGNAL SHUTDOWN, a kill after 5 s.
 *
 * Plain ESM with every I/O passed in (tests/torManager.test.js):
 *   spawn (child_process.spawn), connect (net.connect), fs (sync calls), join (path.join),
 *   sha512(bytes) → bytes, kill(pid) → Promise, record(pid, cmd, args) / forget(pid) (the process
 *   registry), torBin() → the tor executable or '' (missing), libDir: LD_LIBRARY_PATH on Linux,
 *   win, ownerPid (this process), checkPort(port) → Promise<bool>, onStatus(status), log {info, warn}
 */
import { parseOnion, readOnionKeyFile, keyForTor, onionKeyPath, ONION_LEN } from './onion.js';
import { createTorControl, parseControlFile } from './torControl.js';

export const STATES = ['off', 'starting', 'publishing', 'ready', 'failed'];
export const ERRORS = ['missing', 'start', 'network', 'clock', 'keys', 'listener', 'stopped', 'publish', 'node'];

export const TIMINGS = Object.freeze({
  controlFileMs: 30000,
  stallMs: 60000,
  bootMs: 120000,
  //bootstrapped with the onion added, but no descriptor uploaded yet
  publishMs: 180000,
  //an empty list: no automatic restarts; after the last one, its wait again
  backoffMs: [5000, 30000, 120000],
  //failures restarted before the error shows (final 6.1.6 QA: no network showed it after 394 s)
  quietRestarts: 1,
  stopKillMs: 5000,
  //after the kill: how long stop() still waits for tor's exit before it gives up (and says so)
  stopWaitMs: 5000,
  listenerCheckMs: 15000,
  //waitListener: how often the listener port is checked while the node keeps the listener down
  listenerWaitMs: 3000,
});

/* a torrc value: quoted, with tor's C-style escapes (Windows backslashes, spaces) */
function q(v) {
  return JSON.stringify(String(v));
}

/* the files of a wallet's tor, all in <configDir>/tor */
export function torPaths(configDir, join) {
  const dir = join(configDir, 'tor');
  return { dir, torrc: join(dir, 'torrc'), defaults: join(dir, 'torrc-defaults'), data: join(dir, 'data'),
    controlFile: join(dir, 'control.txt'), cookie: join(dir, 'control.cookie'),
    geoip: join(dir, 'geoip'), geoip6: join(dir, 'geoip6') };
}

export function buildTorrc({ paths, ownerPid }) {
  if (!(Number(ownerPid) > 0)) throw new Error('torrc needs the owner pid');
  return [
    'SocksPort auto ExtendedErrors IsolateSOCKSAuth',
    'ControlPort auto',
    'ControlPortWriteToFile ' + q(paths.controlFile),
    'CookieAuthentication 1',
    'CookieAuthFile ' + q(paths.cookie),
    'DataDirectory ' + q(paths.data),
    '__OwningControllerProcess ' + Number(ownerPid),
    'Log notice stdout',
    'AvoidDiskWrites 1',
    //no GeoIP files are bundled (a client doesn't need them). Absolute paths that aren't there: tor
    //logs only an [info] line, where the Windows default "<default>" warned "is relative" twice per start
    'GeoIPFile ' + q(paths.geoip),
    'GeoIPv6File ' + q(paths.geoip6),
    '',
  ].join('\n');
}

/* the args tor is started with (processOwnership records them, role tor) */
export function torArgs(paths) {
  return ['-f', paths.torrc, '--defaults-torrc', paths.defaults];
}

/* tor's own log line → '' or the message of an [err]/[warn] line */
export function torProblem(line) {
  const m = /\[(err|warn)\]\s*(.*)$/.exec(String(line || ''));
  return m ? m[2].trim().slice(0, 300) : '';
}

const OFF = Object.freeze({ state: 'off', progress: 0, onion: '', error: '', detail: '', retrying: false });

export function createTorManager({ spawn, connect, fs, join, sha512, kill, record = () => {}, forget = () => {},
  torBin, libDir = '', win = false, ownerPid, checkPort = async () => true, onStatus = () => {}, log = {},
  env = {}, timings = {}, setTimer = setTimeout, clearTimer = clearTimeout, now = () => Date.now() }) {
  const t = Object.assign({}, TIMINGS, timings);
  const info = log.info || (() => {});
  const warn = log.warn || (() => {});

  let status = Object.assign({}, OFF);
  //the current run: everything async checks it is still the current one (gen)
  let run = null;
  let gen = 0;
  //what start() was given, for retry and the automatic restarts
  let target = null;
  let restarts = 0;
  let restartTimer = null;
  //the error is shown while the automatic restarts go on: their starts don't hide it
  let shown = false;

  function emit(patch) {
    status = Object.assign({}, status, patch);
    try { onStatus(Object.assign({ walletId: target ? target.walletId : '' }, status)); } catch (e) { /* the window is gone */ }
  }

  function timer(fn, ms) {
    const h = setTimer(fn, ms);
    if (h && typeof h.unref === 'function') h.unref();
    return h;
  }

  function clearRunTimers(r) {
    //listenerWait is not cleared: its poll ends by itself (r.dead), so the key in begin() is wiped
    for (const k of ['stall', 'boot', 'publish', 'listener', 'controlPoll']) {
      if (r[k]) clearTimer(r[k]);
      r[k] = null;
    }
  }

  /* p settled within ms → true; never waits longer (a tor that hangs must not hang lock or quit) */
  function within(p, ms) {
    return new Promise((resolve) => {
      const h = timer(() => resolve(false), ms);
      Promise.resolve(p).then(() => { clearTimer(h); resolve(true); }, () => { clearTimer(h); resolve(true); });
    });
  }

  /* end the current tor (no state change): DEL_ONION, SHUTDOWN, a kill after stopKillMs, then at
     most stopWaitMs more for its exit */
  async function teardown(r) {
    if (!r) return;
    r.dead = true;
    clearRunTimers(r);
    //the one-shot key run (epic-wallet holding the wallet open): stopped, and waited for (bounded)
    if (r.keyAbort) r.keyAbort.abort();
    if (r.keyRun) await within(r.keyRun, t.stopKillMs + t.stopWaitMs);
    const proc = r.proc;
    const exited = new Promise((resolve) => {
      if (!proc || r.exited) return resolve();
      r.onExit.push(resolve);
    });
    const k = proc && !r.exited ? timer(() => { if (!r.exited) Promise.resolve(kill(proc.pid)).catch(() => {}); }, t.stopKillMs) : null;
    if (r.control && !r.control.closed) {
      await within((async () => {
        if (r.serviceId) await r.control.delOnion(r.serviceId).catch(() => {});
        await r.control.signal('SHUTDOWN').catch(() => {});
      })(), t.stopKillMs);
      r.control.close();
    }
    if (proc && !r.exited && !(await within(exited, t.stopKillMs + t.stopWaitMs))) {
      warn('tor: ' + proc.pid + ' did not exit after the kill');
    }
    if (k) clearTimer(k);
    if (proc && proc.pid) forget(proc.pid);
  }

  function fail(r, error, detail) {
    if (r.dead || r !== run) return;
    info('tor: failed, ' + error + (detail ? ' (' + String(detail).slice(0, 200) + ')' : ''));
    const auto = ['network', 'stopped', 'publish'].includes(error) && t.backoffMs.length > 0;
    teardown(r).catch(() => {});
    run = null;
    //the first automatic restart: still starting (a stall that the next try gets past is no error to show)
    const quiet = auto && restarts < t.quietRestarts;
    shown = auto && !quiet;
    if (quiet) emit({ state: 'starting', progress: 0, error: '', detail: '', retrying: true });
    else emit({ state: 'failed', progress: status.progress, error, detail: detail ? String(detail).slice(0, 300) : '', retrying: auto });
    if (auto) {
      const wait = t.backoffMs[Math.min(restarts++, t.backoffMs.length - 1)];
      info('tor: restarting in ' + Math.round(wait / 1000) + ' s');
      restartTimer = timer(() => { restartTimer = null; if (target && !run) launch(); }, wait);
    }
  }

  /* the stall and boot watchdogs: progress unchanged for stallMs, or no 100 % after bootMs */
  function watchProgress(r) {
    if (r.stall) clearTimer(r.stall);
    if (r.bootstrapped) return;
    r.stall = timer(() => fail(r, 'network', 'stuck at ' + status.progress + ' %'), t.stallMs);
  }

  function onEvent(r, e) {
    if (r.dead || r !== run) return;
    if (e.type === 'bootstrap') {
      if (e.progress !== r.progress) {
        r.progress = e.progress;
        watchProgress(r);
      }
      if (e.progress >= 100 && !r.bootstrapped) {
        r.bootstrapped = true;
        clearTimer(r.boot);
        clearTimer(r.stall);
        info('tor: bootstrapped in ' + ((now() - r.started) / 1000).toFixed(1) + ' s');
      }
      if (e.warning) info('tor: bootstrap warning: ' + String(e.warning).slice(0, 200));
      advance(r);
    } else if (e.type === 'clock_skew') {
      if (!r.bootstrapped) fail(r, 'clock', String(e.skew));
      else warn('tor: clock skew ' + e.skew + ' s');
    } else if (e.type === 'hs_desc' && r.serviceId && e.service === r.serviceId) {
      if (e.action === 'UPLOADED' && !r.uploaded) {
        r.uploaded = true;
        info('tor: onion published in ' + ((now() - r.started) / 1000).toFixed(1) + ' s');
        advance(r);
      } else if (e.action === 'FAILED') {
        info('tor: descriptor upload failed at one directory' + (e.reason ? ' (' + e.reason + ')' : ''));
      }
    }
  }

  /* the visible state from what is known */
  function advance(r) {
    if (r.dead || r !== run) return;
    //bootstrapped: past what an error shown during the restarts was about
    if (r.bootstrapped) shown = false;
    if (r.bootstrapped && r.waitingListener) {
      //sending works; receiving waits for the listener (the node)
      if (status.state !== 'failed' || status.error !== 'node') emit({ state: 'failed', progress: 100, error: 'node', detail: '' });
    } else if (r.bootstrapped && r.serviceId && r.uploaded) {
      if (r.publish) clearTimer(r.publish);
      r.publish = null;
      if (status.state !== 'ready') {
        emit({ state: 'ready', progress: 100, error: '', detail: '', retrying: false });
        restarts = 0;
        watchListener(r);
      }
    } else if (r.bootstrapped && r.serviceId) {
      if (!r.publish) r.publish = timer(() => fail(r, 'publish', 'no upload after ' + Math.round(t.publishMs / 1000) + ' s'), t.publishMs);
      if (status.state !== 'publishing') emit({ state: 'publishing', progress: 100, error: '', detail: '', retrying: false });
    } else if (!shown && (status.state !== 'starting' || status.progress !== r.progress)) {
      emit({ state: 'starting', progress: r.progress || 0, error: '', detail: '' });
    }
  }

  function watchListener(r) {
    if (r.listener) return;
    const check = async () => {
      r.listener = null;
      if (r.dead || r !== run) return;
      const ok = await Promise.resolve(checkPort(target.listenerPort)).catch(() => false);
      if (r.dead || r !== run) return;
      if (!ok) return fail(r, 'listener', '');
      r.listener = timer(check, t.listenerCheckMs);
    };
    r.listener = timer(check, t.listenerCheckMs);
  }

  /* waitListener: the listener port, checked every listenerWaitMs until it answers → true, or the run ends → false */
  function waitForListener(r, port) {
    return new Promise((resolve) => {
      const poll = async () => {
        r.listenerWait = null;
        if (r.dead || r !== run) return resolve(false);
        const ok = await Promise.resolve(checkPort(port)).catch(() => false);
        if (r.dead || r !== run) return resolve(false);
        if (ok) return resolve(true);
        r.listenerWait = timer(poll, t.listenerWaitMs);
      };
      r.listenerWait = timer(poll, t.listenerWaitMs);
    });
  }

  function readFile(p) {
    try { return fs.readFileSync(p); } catch (e) { return null; }
  }

  /* the control file appears once tor listens on its control port */
  function waitControlFile(r, paths) {
    return new Promise((resolve) => {
      const until = now() + t.controlFileMs;
      const poll = () => {
        r.controlPoll = null;
        if (r.dead || r.exited) return resolve(null);
        const addr = parseControlFile(String(readFile(paths.controlFile) || ''));
        if (addr) return resolve(addr);
        if (now() > until) return resolve(null);
        r.controlPoll = timer(poll, 100);
      };
      poll();
    });
  }

  function openControl(r, addr) {
    return new Promise((resolve, reject) => {
      const sock = connect({ host: addr.host, port: addr.port });
      const onErr = (e) => reject(e);
      sock.once('error', onErr);
      sock.once('connect', () => {
        sock.removeListener('error', onErr);
        resolve(createTorControl({ socket: sock, onEvent: (e) => onEvent(r, e),
          onClose: () => { if (!r.dead && r === run) fail(r, r.bootstrapped ? 'stopped' : 'start', 'tor stopped'); } }));
      });
    });
  }

  /* begin() never throws to its caller: an unexpected error is a failed start */
  function launch() {
    begin().catch((e) => { if (run) fail(run, 'start', e && e.message); });
  }

  async function begin() {
    const g = ++gen;
    const tgt = target;
    const r = { gen: g, proc: null, control: null, exited: false, onExit: [], progress: 0, bootstrapped: false,
      serviceId: '', uploaded: false, dead: false, started: now(), lastProblem: '' };
    run = r;
    //an automatic restart behind a shown error keeps it until this start gets further
    if (!shown) emit({ state: 'starting', progress: 0, onion: tgt.onion, error: '', detail: '' });

    const bin = torBin();
    if (!bin) return fail(r, 'missing', '');
    const paths = torPaths(tgt.configDir, join);
    try {
      fs.mkdirSync(paths.data, { recursive: true, mode: 0o700 });
      if (!win) fs.chmodSync(paths.data, 0o700);
      fs.writeFileSync(paths.torrc, buildTorrc({ paths, ownerPid }), { mode: 0o600 });
      fs.writeFileSync(paths.defaults, '', { mode: 0o600 });
      for (const f of [paths.controlFile, paths.cookie]) {
        try { fs.unlinkSync(f); } catch (e) { /* not there */ }
      }
    } catch (e) {
      return fail(r, 'start', 'files: ' + (e.code || e.message));
    }

    const args = torArgs(paths);
    const childEnv = Object.assign({}, env);
    if (!win && libDir) childEnv.LD_LIBRARY_PATH = libDir;
    let proc;
    try {
      proc = spawn(bin, args, { shell: false, windowsHide: true, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return fail(r, 'start', e.code || e.message);
    }
    r.proc = proc;
    if (proc.pid) record(proc.pid, bin, args);
    let partial = '';
    const onOut = (d) => {
      const lines = (partial + String(d)).split(/\r?\n/);
      partial = lines.pop();
      for (const line of lines) {
        const p = torProblem(line);
        if (p) {
          r.lastProblem = p;
          info('tor: ' + p);
        }
      }
    };
    if (proc.stdout) proc.stdout.on('data', onOut);
    if (proc.stderr) proc.stderr.on('data', onOut);
    proc.on('error', (e) => {
      r.lastProblem = r.lastProblem || (e && e.code) || 'spawn failed';
      if (!r.exited) { r.exited = true; r.onExit.splice(0).forEach(f => f()); }
      fail(r, 'start', r.lastProblem);
    });
    proc.on('exit', (code) => {
      r.exited = true;
      r.onExit.splice(0).forEach(f => f());
      if (proc.pid) forget(proc.pid);
      //after the bootstrap it is no start problem: restarted with the network backoff
      if (!r.dead && r === run) fail(r, r.bootstrapped ? 'stopped' : 'start', r.lastProblem || 'tor exited (' + code + ')');
    });

    const addr = await waitControlFile(r, paths);
    if (r.dead || r !== run) return;
    if (!addr) return fail(r, 'start', r.lastProblem || 'no control port');
    try {
      r.control = await openControl(r, addr);
      if (r.dead || r !== run) return r.control.close();
      const cookie = readFile(paths.cookie);
      if (!cookie || cookie.length !== 32) throw new Error('no control cookie');
      await r.control.authenticate(Buffer.from(cookie).toString('hex'));
      await r.control.takeOwnership();
      await r.control.setEvents(['STATUS_CLIENT', 'STATUS_GENERAL', 'HS_DESC']);
      r.socksPort = await r.control.socksPort();
      if (!r.socksPort) throw new Error('no SOCKS port');
    } catch (e) {
      return fail(r, 'start', e && e.message);
    }
    if (r.dead || r !== run) return;
    r.boot = timer(() => fail(r, 'network', 'no bootstrap after ' + Math.round(t.bootMs / 1000) + ' s'), t.bootMs);
    watchProgress(r);
    //the phase tor is already in (events only come for changes)
    r.control.bootstrapPhase().then((e) => onEvent(r, e)).catch(() => {});

    //the key: the file epic-wallet writes, made by the one-shot run when it is missing
    const keyPath = onionKeyPath(tgt.dataDir, tgt.onion, join);
    let file = readOnionKeyFile(readFile(keyPath));
    if (!file && tgt.ensureKey) {
      r.keyAbort = new AbortController();
      r.keyRun = Promise.resolve(tgt.ensureKey({ socksPort: r.socksPort, signal: r.keyAbort.signal })).catch((e) => ({ ok: false, detail: e && e.message }));
      const made = await r.keyRun;
      r.keyRun = null;
      if (r.dead || r !== run) return;
      if (!made || !made.ok) return fail(r, 'keys', made && made.detail);
      file = readOnionKeyFile(readFile(keyPath));
    }
    if (!file) return fail(r, 'keys', 'no key file');
    const k = keyForTor(file.key, tgt.onion, sha512);
    file.key.fill(0);
    if (k.error) return fail(r, 'keys', 'the key file is not this wallet\'s');

    let listening = await Promise.resolve(checkPort(tgt.listenerPort)).catch(() => false);
    if (r.dead || r !== run) { k.key.fill(0); return; }
    if (!listening && tgt.waitListener) {
      info('tor: the wallet listener is not running (the node does not answer): sending only until it is');
      r.waitingListener = true;
      advance(r);
      listening = await waitForListener(r, tgt.listenerPort);
      if (r.dead || r !== run) { k.key.fill(0); return; }
      r.waitingListener = false;
      info('tor: the wallet listener answers now');
    }
    if (!listening) { k.key.fill(0); return fail(r, 'listener', ''); }

    const b64 = Buffer.from(k.key).toString('base64');
    k.key.fill(0);
    try {
      r.serviceId = await r.control.addOnion(b64, tgt.listenerPort);
    } catch (e) {
      return fail(r, 'keys', 'ADD_ONION: ' + (e && e.code ? e.code : e && e.message));
    }
    if (r.serviceId !== parseOnion(tgt.onion).host.slice(0, ONION_LEN)) {
      return fail(r, 'keys', 'tor published another address');
    }
    info('tor: onion service added (' + k.format + ' key), waiting for the network');
    advance(r);
  }

  return {
    /*
     * start({walletId, configDir, dataDir, onion, listenerPort, ensureKey, waitListener}) for the
     * open wallet; a tor of another wallet is stopped first. waitListener: the listener is down
     * because of the node (error node above), wait for it instead of failing with listener. ensureKey({socksPort, signal}) → {ok, detail}: the
     * one-shot; signal aborts when this run is stopped (stop waits for it, bounded).
     */
    async start(opts) {
      const p = parseOnion(opts && opts.onion);
      if (!p.valid) throw new Error('not a valid onion');
      if (!opts.configDir || !opts.dataDir || !(opts.listenerPort > 0)) throw new Error('start needs the wallet\'s dirs and port');
      const same = target && run && target.walletId === opts.walletId && target.onion === p.host
        && target.listenerPort === opts.listenerPort && !!target.waitListener === !!opts.waitListener;
      if (same && status.state !== 'failed') return status;
      await this.stop({ quiet: true });
      target = Object.assign({}, opts, { onion: p.host });
      restarts = 0;
      shown = false;
      launch();
      return status;
    },
    /* Try again: the same wallet, from the start, backoff reset */
    async retry() {
      if (!target) return status;
      const keep = target;
      await this.stop({ quiet: true });
      target = keep;
      restarts = 0;
      shown = false;
      launch();
      return status;
    },
    /* stop tor (lock, switch, Tor off, quit, removal). walletId: only if it is that wallet's (a
       late stop of a wallet no longer open does nothing, not even an "off" event) */
    async stop({ quiet = false, walletId = '' } = {}) {
      if (walletId && (!target || target.walletId !== walletId)) return this.status();
      if (restartTimer) clearTimer(restartTimer);
      restartTimer = null;
      const r = run;
      run = null;
      gen++;
      const had = target;
      target = null;
      shown = false;
      await teardown(r);
      status = Object.assign({}, OFF);
      //quiet: a start or retry follows at once (no flash of "off")
      if (!quiet) {
        try { onStatus(Object.assign({ walletId: had ? had.walletId : '' }, status)); } catch (e) { /* gone */ }
      }
      return status;
    },
    status: () => Object.assign({ walletId: target ? target.walletId : '' }, status),
    /* the SOCKS port once tor is bootstrapped (sending needs no more), else 0 */
    socksPort: () => (run && run.bootstrapped && run.socksPort ? run.socksPort : 0),
    /* the SOCKS port as soon as tor answers (the one-shot key run needs it before the bootstrap) */
    rawSocksPort: () => (run && run.socksPort) || 0,
    pid: () => (run && run.proc && !run.exited ? run.proc.pid : 0),
  };
}
