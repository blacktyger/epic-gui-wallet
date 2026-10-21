// Tests for src/shared/torManager.js: torrc, the state machine, errors, restarts and stop, with a fake tor (tor-616 §4). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTorManager, buildTorrc, torPaths, torArgs, torProblem } from '../src/shared/torManager.js';
import { KEY_FILE_HEADER, expandSeed } from '../src/shared/onion.js';

const SEED = '37c50a0cfaf343cbc594fde3cb29a88427d40891de34791f1d97f9d99e1e35d9';
const PROOF = '62be2076374085e7cbfee9869da228517248f8a51e92fc490f6b5f39afe9c372';
const ONION = 'mk7ca5rxicc6ps765gdj3irikfzer6ffd2jpysipnnpttl7jynzaluyd';
const sha512 = (b) => crypto.createHash('sha512').update(b).digest();

test('torrc: auto ports, extended errors, isolation, cookie, owner pid; quoted paths', () => {
  const paths = torPaths('/w/c 1', path.posix.join);
  const rc = buildTorrc({ paths, ownerPid: 4242 });
  assert.equal(rc, [
    'SocksPort auto ExtendedErrors IsolateSOCKSAuth',
    'ControlPort auto',
    'ControlPortWriteToFile "/w/c 1/tor/control.txt"',
    'CookieAuthentication 1',
    'CookieAuthFile "/w/c 1/tor/control.cookie"',
    'DataDirectory "/w/c 1/tor/data"',
    '__OwningControllerProcess 4242',
    'Log notice stdout',
    'AvoidDiskWrites 1',
    '',
  ].join('\n'));
  const wrc = buildTorrc({ paths: torPaths('C:\\Users\\A B\\w1', path.win32.join), ownerPid: 1 });
  assert.match(wrc, /^DataDirectory "C:\\\\Users\\\\A B\\\\w1\\\\tor\\\\data"$/m);
  assert.throws(() => buildTorrc({ paths, ownerPid: 0 }));
  assert.deepEqual(torArgs(paths), ['-f', '/w/c 1/tor/torrc', '--defaults-torrc', '/w/c 1/tor/torrc-defaults']);
  assert.equal(torProblem('Oct 21 10:00:00.000 [warn] Could not bind to 127.0.0.1:9050: Address already in use'), 'Could not bind to 127.0.0.1:9050: Address already in use');
  assert.equal(torProblem('Oct 21 10:00:00.000 [notice] Bootstrapped 5%'), '');
});

/* a wallet folder in the scratch tmp dir, with (or without) epic-wallet 4.1.0's key file */
function walletDir({ key = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tormgr-'));
  if (key) {
    const kd = path.join(dir, 'wallet_tor', 'onion_service_addresses', ONION);
    fs.mkdirSync(kd, { recursive: true });
    const header = Buffer.alloc(32);
    header.write(KEY_FILE_HEADER);
    fs.writeFileSync(path.join(kd, 'hs_ed25519_secret_key'), Buffer.concat([header, Buffer.from(SEED, 'hex'), Buffer.from(PROOF, 'hex')]));
  }
  return dir;
}

/*
 * A fake tor: spawn writes the control file and cookie (unless opts.noControl), the control socket
 * answers like tor; t.event(line) sends a 650 event. opts.serviceId: what ADD_ONION answers.
 */
function harness(opts = {}) {
  const t = { sent: [], logs: [], statuses: [], recorded: [], forgot: [], killed: [], procs: [], spawned: [] };
  let sock = null;
  t.event = (line) => sock.emit('data', '650 ' + line + '\r\n');
  const answer = (cmd) => {
    if (cmd.startsWith('GETINFO net/listeners/socks')) return '250-net/listeners/socks="127.0.0.1:39111"\r\n250 OK\r\n';
    if (cmd.startsWith('GETINFO status/bootstrap-phase')) return '250-status/bootstrap-phase=NOTICE BOOTSTRAP PROGRESS=0 TAG=starting SUMMARY="Starting"\r\n250 OK\r\n';
    if (cmd.startsWith('ADD_ONION')) return '250-ServiceID=' + (opts.serviceId || ONION) + '\r\n250 OK\r\n';
    if (cmd === 'SIGNAL SHUTDOWN') {
      setImmediate(() => { if (!opts.ignoreShutdown) t.procs.at(-1).exit(0); });
    }
    return '250 OK\r\n';
  };
  const connect = () => {
    sock = new EventEmitter();
    sock.destroy = () => {};
    sock.write = (line) => {
      const cmd = line.replace(/\r\n$/, '');
      t.sent.push(cmd);
      setImmediate(() => sock.emit('data', answer(cmd)));
    };
    setImmediate(() => sock.emit('connect'));
    return sock;
  };
  const spawn = (bin, args, o) => {
    t.spawned.push({ bin, args, o });
    const p = new EventEmitter();
    p.pid = 5000 + t.procs.length;
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.exit = (code) => { if (!p.gone) { p.gone = true; p.emit('exit', code); } };
    t.procs.push(p);
    const torrc = args[1];
    const dir = path.dirname(torrc);
    if (opts.dieWith) {
      setImmediate(() => { p.stdout.emit('data', 'Oct 21 [err] ' + opts.dieWith + '\n'); p.exit(1); });
    } else if (!opts.noControl) {
      setImmediate(() => {
        fs.writeFileSync(path.join(dir, 'control.cookie'), crypto.randomBytes(32));
        fs.writeFileSync(path.join(dir, 'control.txt'), 'PORT=127.0.0.1:41111\n');
      });
    }
    return p;
  };
  const m = createTorManager({
    spawn, connect, fs, join: path.join, sha512, ownerPid: 777, libDir: '/lib/tor', win: false,
    torBin: () => (opts.missing ? '' : '/app/bin/linux/tor-bundle/tor'),
    kill: async (pid) => { t.killed.push(pid); if (!opts.unkillable) t.procs.find(p => p.pid === pid)?.exit(null); return true; },
    record: (pid, cmd, args) => t.recorded.push({ pid, cmd, args }),
    forget: (pid) => t.forgot.push(pid),
    checkPort: async () => (opts.listener === undefined ? true : opts.listener()),
    onStatus: (s) => t.statuses.push(s),
    log: { info: (x) => t.logs.push(x), warn: (x) => t.logs.push(x) },
    env: { PATH: '/usr/bin' },
    //timers the test waits for (the real ones are unref'd)
    setTimer: (f, ms) => ({ t: setTimeout(f, ms) }), clearTimer: (o) => clearTimeout(o && o.t),
    timings: Object.assign({ controlFileMs: 500, stallMs: 1000, bootMs: 2000, backoffMs: [30, 30, 30], stopKillMs: 50, listenerCheckMs: 30 }, opts.timings || {}),
  });
  t.m = m;
  t.until = async (pred, ms = 2000) => {
    const end = Date.now() + ms;
    while (!pred()) {
      if (Date.now() > end) throw new Error('timed out; last status ' + JSON.stringify(m.status()) + ' logs ' + t.logs.join(' | '));
      await new Promise(r => setTimeout(r, 5));
    }
  };
  return t;
}

const START = (dir, extra = {}) => Object.assign({ walletId: 'w1', configDir: dir, dataDir: dir, onion: ONION, listenerPort: 3415 }, extra);

test('a start that reaches ready: starting with progress → publishing → ready; the expanded key goes to ADD_ONION', async () => {
  const dir = walletDir();
  const t = harness();
  await t.m.start(START(dir, { onion: 'http://' + ONION + '.onion' }));
  await t.until(() => t.logs.some(l => l.includes('onion service added')));
  assert.equal(t.m.status().state, 'starting');
  assert.equal(t.m.socksPort(), 0, 'no sending before the bootstrap');
  t.event('STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=45 TAG=loading_descriptors SUMMARY="Loading relay descriptors"');
  await t.until(() => t.m.status().progress === 45);
  t.event('STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=100 TAG=done SUMMARY="Done"');
  await t.until(() => t.m.status().state === 'publishing');
  assert.equal(t.m.socksPort(), 39111);
  t.event('HS_DESC UPLOADED ' + 'a'.repeat(56) + ' UNKNOWN $X');
  t.event('HS_DESC UPLOADED ' + ONION + ' UNKNOWN $AAAA~relay');
  await t.until(() => t.m.status().state === 'ready');
  assert.deepEqual(t.statuses.map(s => s.state).filter((s, i, a) => s !== a[i - 1]), ['starting', 'publishing', 'ready']);
  assert.deepEqual(t.m.status(), { walletId: 'w1', state: 'ready', progress: 100, onion: ONION + '.onion', error: '', detail: '' });

  //the command sequence and the key
  const key = Buffer.from(expandSeed(Buffer.from(SEED, 'hex'), sha512)).toString('base64');
  assert.deepEqual(t.sent.slice(0, 6).map(c => c.split(' ')[0]), ['AUTHENTICATE', 'TAKEOWNERSHIP', 'RESETCONF', 'SETEVENTS', 'GETINFO', 'GETINFO']);
  assert.equal(t.sent.find(c => c.startsWith('SETEVENTS')), 'SETEVENTS STATUS_CLIENT STATUS_GENERAL HS_DESC');
  assert.equal(t.sent.find(c => c.startsWith('ADD_ONION')), 'ADD_ONION ED25519-V3:' + key + ' Flags=DiscardPK Port=80,127.0.0.1:3415');
  assert.ok(!t.logs.join('\n').includes(key), 'the key is never logged');
  assert.ok(!t.logs.join('\n').includes(SEED));

  //spawn: no shell, the bundle's libs, args recorded for the process registry
  const s = t.spawned[0];
  assert.equal(s.o.shell, false);
  assert.equal(s.o.env.LD_LIBRARY_PATH, '/lib/tor');
  assert.deepEqual(s.args, ['-f', path.join(dir, 'tor', 'torrc'), '--defaults-torrc', path.join(dir, 'tor', 'torrc-defaults')]);
  assert.deepEqual(t.recorded, [{ pid: 5000, cmd: '/app/bin/linux/tor-bundle/tor', args: s.args }]);
  assert.equal((fs.statSync(path.join(dir, 'tor', 'data')).mode & 0o777), 0o700);
  assert.match(fs.readFileSync(path.join(dir, 'tor', 'torrc'), 'utf8'), /__OwningControllerProcess 777/);

  //stop: DEL_ONION, SHUTDOWN, off; forgotten in the record
  await t.m.stop();
  assert.ok(t.sent.includes('DEL_ONION ' + ONION));
  assert.ok(t.sent.includes('SIGNAL SHUTDOWN'));
  assert.equal(t.m.status().state, 'off');
  assert.equal(t.statuses.at(-1).state, 'off');
  assert.ok(t.forgot.includes(5000));
  assert.deepEqual(t.killed, [], 'tor exited by itself');
});

test('a tor that ignores SHUTDOWN is killed', async () => {
  const dir = walletDir();
  const t = harness({ ignoreShutdown: true });
  await t.m.start(START(dir));
  await t.until(() => t.sent.some(c => c.startsWith('ADD_ONION')));
  await t.m.stop();
  assert.deepEqual(t.killed, [5000]);
});

test('a tor that survives the kill: stop gives up after the bounded wait instead of hanging', async () => {
  const t = harness({ ignoreShutdown: true, unkillable: true, timings: { stopKillMs: 30, stopWaitMs: 60 } });
  await t.m.start(START(walletDir()));
  await t.until(() => t.sent.some(c => c.startsWith('ADD_ONION')));
  const began = Date.now();
  await t.m.stop();
  assert.ok(Date.now() - began < 1000, 'stop returned');
  assert.deepEqual(t.killed, [5000]);
  assert.equal(t.m.status().state, 'off');
  assert.ok(t.logs.some(l => l.includes('did not exit')));
});

test('stopped: tor dying after the bootstrap is restarted with the backoff', async () => {
  const t = harness();
  await t.m.start(START(walletDir()));
  await t.until(() => t.logs.some(l => l.includes('onion service added')));
  t.event('STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=100 TAG=done SUMMARY="Done"');
  t.event('HS_DESC UPLOADED ' + ONION + ' UNKNOWN $A');
  await t.until(() => t.m.status().state === 'ready');
  t.procs[0].exit(1);
  await t.until(() => t.m.status().state === 'failed');
  assert.equal(t.m.status().error, 'stopped');
  await t.until(() => t.spawned.length === 2);
  await t.until(() => t.sent.filter(c => c.startsWith('ADD_ONION')).length === 2);
  await t.m.stop();
  //before the bootstrap an exit stays a start failure, with no restart
  const u = harness();
  await u.m.start(START(walletDir()));
  await u.until(() => u.logs.some(l => l.includes('onion service added')));
  u.procs[0].exit(1);
  await u.until(() => u.m.status().state === 'failed');
  assert.equal(u.m.status().error, 'start');
  await new Promise(r => setTimeout(r, 80));
  assert.equal(u.spawned.length, 1);
});

test('publish: no descriptor upload within the publish time fails and restarts', async () => {
  const t = harness({ timings: { publishMs: 60 } });
  await t.m.start(START(walletDir()));
  await t.until(() => t.logs.some(l => l.includes('onion service added')));
  t.event('STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=100 TAG=done SUMMARY="Done"');
  await t.until(() => t.m.status().state === 'publishing');
  await t.until(() => t.m.status().state === 'failed');
  assert.equal(t.m.status().error, 'publish');
  await t.until(() => t.spawned.length === 2);
  await t.m.stop();
  //an upload in time clears it
  const u = harness({ timings: { publishMs: 80 } });
  await u.m.start(START(walletDir()));
  await u.until(() => u.logs.some(l => l.includes('onion service added')));
  u.event('STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=100 TAG=done SUMMARY="Done"');
  u.event('HS_DESC UPLOADED ' + ONION + ' UNKNOWN $A');
  await u.until(() => u.m.status().state === 'ready');
  await new Promise(r => setTimeout(r, 120));
  assert.equal(u.m.status().state, 'ready');
  await u.m.stop();
});

test('stop during the one-shot key run aborts it and waits for it', async () => {
  const t = harness();
  let signal = null;
  let ended = false;
  await t.m.start(START(walletDir({ key: false }), { ensureKey: (o) => new Promise((resolve) => {
    signal = o.signal;
    o.signal.addEventListener('abort', () => setTimeout(() => { ended = true; resolve({ ok: false, detail: 'stopped' }); }, 20));
  }) }));
  await t.until(() => signal);
  await t.m.stop();
  assert.equal(signal.aborted, true);
  assert.equal(ended, true, 'stop returned only once the key run had ended');
  assert.equal(t.m.status().state, 'off');
});

test('a stop for another wallet leaves the running tor alone and emits nothing', async () => {
  const t = harness();
  await t.m.start(START(walletDir(), { walletId: 'B' }));
  await t.until(() => t.sent.some(c => c.startsWith('ADD_ONION')));
  const before = t.statuses.length;
  await t.m.stop({ walletId: 'A' });
  assert.ok(!t.sent.includes('SIGNAL SHUTDOWN'));
  assert.equal(t.m.status().walletId, 'B');
  assert.equal(t.statuses.length, before);
  await t.m.stop({ walletId: 'B' });
  assert.ok(t.sent.includes('SIGNAL SHUTDOWN'));
  assert.equal(t.m.status().state, 'off');
  //nothing running: a per-wallet stop says nothing either (no "off" for the wallet open now)
  const n = t.statuses.length;
  await t.m.stop({ walletId: 'A' });
  assert.equal(t.statuses.length, n);
});

test('missing: no tor binary in this build', async () => {
  const t = harness({ missing: true });
  await t.m.start(START(walletDir()));
  await t.until(() => t.m.status().state === 'failed');
  assert.equal(t.m.status().error, 'missing');
  assert.equal(t.spawned.length, 0);
});

test('start: tor exits before its control port, with its [err] line as the detail', async () => {
  const t = harness({ dieWith: 'Failed to bind one of the listener ports.' });
  await t.m.start(START(walletDir()));
  await t.until(() => t.m.status().state === 'failed');
  assert.equal(t.m.status().error, 'start');
  assert.equal(t.m.status().detail, 'Failed to bind one of the listener ports.');
});

test('network: stuck progress fails, restarts with backoff, then stays failed; Try again starts over', async () => {
  const t = harness({ timings: { stallMs: 40, bootMs: 5000 } });
  await t.m.start(START(walletDir()));
  await t.until(() => t.spawned.length === 4, 3000);
  await t.until(() => t.m.status().state === 'failed' && t.spawned.length === 4 && t.procs.every(p => p.gone), 3000);
  await new Promise(r => setTimeout(r, 150));
  assert.equal(t.spawned.length, 4, 'three restarts (5 s, 30 s, 2 min), then it stays failed');
  assert.equal(t.m.status().error, 'network');
  await t.m.retry();
  await t.until(() => t.spawned.length === 5);
  await t.m.stop();
});

test('network: no 100 % within the boot time even with progress', async () => {
  const t = harness({ timings: { stallMs: 5000, bootMs: 60, backoffMs: [] } });
  await t.m.start(START(walletDir()));
  await t.until(() => t.m.status().state === 'failed');
  assert.equal(t.m.status().error, 'network');
  assert.match(t.m.status().detail, /no bootstrap/);
});

test('clock: a clock skew before the bootstrap', async () => {
  const t = harness();
  await t.m.start(START(walletDir()));
  await t.until(() => t.sent.some(c => c.startsWith('ADD_ONION')));
  t.event('STATUS_GENERAL WARN CLOCK_SKEW SKEW=-7200 SOURCE=CONSENSUS');
  await t.until(() => t.m.status().state === 'failed');
  assert.equal(t.m.status().error, 'clock');
});

test('keys: no key file and the one-shot fails; the one-shot gets the SOCKS port; another ServiceID', async () => {
  let t = harness();
  let asked = null;
  await t.m.start(START(walletDir({ key: false }), { ensureKey: async (o) => { asked = o; return { ok: false, detail: 'timeout' }; } }));
  await t.until(() => t.m.status().state === 'failed');
  assert.equal(asked.socksPort, 39111);
  assert.ok(asked.signal instanceof AbortSignal, 'the run can be stopped');
  assert.deepEqual([t.m.status().error, t.m.status().detail], ['keys', 'timeout']);

  //the one-shot writes the file: then it is used
  const made = walletDir();
  const empty = walletDir({ key: false });
  t = harness();
  await t.m.start(START(empty, { ensureKey: async () => {
    fs.cpSync(path.join(made, 'wallet_tor'), path.join(empty, 'wallet_tor'), { recursive: true });
    return { ok: true };
  } }));
  await t.until(() => t.sent.some(c => c.startsWith('ADD_ONION')));
  await t.m.stop();

  t = harness({ serviceId: 'b'.repeat(56) });
  await t.m.start(START(walletDir()));
  await t.until(() => t.m.status().state === 'failed');
  assert.equal(t.m.status().error, 'keys');
});

test('listener: not running at the start, or stops later', async () => {
  let t = harness({ listener: () => false });
  await t.m.start(START(walletDir()));
  await t.until(() => t.m.status().state === 'failed');
  assert.equal(t.m.status().error, 'listener');
  assert.ok(!t.sent.some(c => c.startsWith('ADD_ONION')));

  let up = true;
  t = harness({ listener: () => up });
  await t.m.start(START(walletDir()));
  //tor only uploads once ADD_ONION has answered
  await t.until(() => t.logs.some(l => l.includes('onion service added')));
  t.event('STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=100 TAG=done SUMMARY="Done"');
  t.event('HS_DESC UPLOADED ' + ONION + ' UNKNOWN $A');
  await t.until(() => t.m.status().state === 'ready');
  up = false;
  await t.until(() => t.m.status().state === 'failed');
  assert.equal(t.m.status().error, 'listener');
});

test('a start for another wallet stops the first tor; the same wallet again is a no-op', async () => {
  const t = harness();
  const a = walletDir();
  await t.m.start(START(a));
  await t.until(() => t.sent.some(c => c.startsWith('ADD_ONION')));
  await t.m.start(START(a));
  assert.equal(t.spawned.length, 1);
  await t.m.start(START(walletDir(), { walletId: 'w2' }));
  assert.ok(t.sent.includes('SIGNAL SHUTDOWN'));
  await t.until(() => t.spawned.length === 2);
  assert.equal(t.m.status().walletId, 'w2');
  await t.m.stop();
  await assert.rejects(t.m.start(START(a, { onion: 'nope' })));
});
