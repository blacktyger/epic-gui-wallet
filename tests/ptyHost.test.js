// Tests for src/shared/sessionSecret.js and src/shared/ptyHost.js: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSessionSecret } from '../src/shared/sessionSecret.js';
import { createPtyHost } from '../src/shared/ptyHost.js';
import * as walletArgs from '../src/shared/walletArgs.js';

const BIN = '/opt/epic/resources/bin/linux/epic-wallet';
const DIR = '/home/jane/.epic/main';
const PASS = 'S3cret pass&word';
//one folder for config and data (a wallet made in 6.1): -t dir -c dir, as on feat/qol
const listenArgs = ({ dir, ...o }) => walletArgs.listenArgs({ ...o, configDir: dir, dataDir: dir });
const epicboxArgs = ({ dir, ...o }) => walletArgs.epicboxArgs({ ...o, configDir: dir, dataDir: dir });
const initArgs = ({ dir, ...o }) => walletArgs.initArgs({ ...o, configDir: dir });
const PHRASE = 'must warfare knock circle mother rigid radio divert jar keen arrive rival broccoli minute skin feed winter baby maple chest bird grain child birth';

test('session password: kept as a Buffer, copies are separate, wiped to zeros', () => {
  const s = createSessionSecret();
  assert.equal(s.has(), false);
  assert.equal(s.copy(), null);
  s.set(PASS);
  assert.equal(s.has(), true);
  const c = s.copy();
  assert.equal(c.toString(), PASS);
  c.fill(0);
  assert.equal(s.copy().toString(), PASS, 'zeroing a copy leaves the session');
  //the buffer it held is zeroed, not just dropped
  const held = s.copy();
  s.wipe();
  assert.equal(s.has(), false);
  assert.equal(s.copy(), null);
  assert.equal(held.toString(), PASS);
});

test('session password: replacing one (another wallet) zeroes the old buffer', () => {
  const s = createSessionSecret();
  const orig = Buffer.from;
  let firstBuf;
  //catch the buffer set() keeps
  Buffer.from = function (...a) { const b = orig.apply(Buffer, a); if (!firstBuf && a[0] === PASS) firstBuf = b; return b; };
  try { s.set(PASS); } finally { Buffer.from = orig; }
  s.set('other');
  assert.ok(firstBuf.every(x => x === 0), 'old buffer zeroed');
  s.wipe();
  //an empty password is a password
  s.set('');
  assert.equal(s.has(), true);
  assert.equal(s.copy().length, 0);
});

/* a fake node-pty: records writes, lets the test emit output and exit */
function fakePty() {
  const terms = [];
  return {
    terms,
    spawn(file, args, opts) {
      const t = new EventEmitter();
      t.pid = 4242 + terms.length;
      t.file = file;
      t.args = args;
      t.opts = opts;
      t.written = [];
      t.killed = false;
      t.write = (d) => t.written.push(Buffer.isBuffer(d) ? Buffer.from(d).toString() : String(d));
      t.kill = () => { t.killed = true; };
      t.onData = (fn) => t.on('data', fn);
      t.onExit = (fn) => t.on('exit', fn);
      terms.push(t);
      return t;
    },
  };
}

function host(over = {}) {
  const p = fakePty();
  const killed = [];
  const warns = [];
  const h = createPtyHost(Object.assign({
    loadPty: () => p,
    spawn: () => { throw new Error('no pipe spawn expected'); },
    killTree: async (pid) => { killed.push(pid); return true; },
    log: { warn: (m) => warns.push(m) },
    env: {},
    cwd: '/',
  }, over));
  return { h, p, killed, warns };
}

test('listener on a pty: no password in its args, prompt answered once with the password, output without it', () => {
  const { h, p } = host();
  const pw = Buffer.from(PASS);
  const lines = [];
  let exit = null;
  const args = listenArgs({ network: 'mainnet', dir: DIR, tor: false });
  const r = h.start({ cmd: BIN, args, kind: 'listen', password: pw, onLines: (l) => lines.push(...l), onExit: (e) => { exit = e; } });
  assert.equal(r.mode, 'pty');
  const t = p.terms[0];
  assert.equal(r.pid, t.pid, 'the recorded pid is the spawned process');
  assert.deepEqual(t.args, args);
  assert.ok(!t.args.some(a => a.includes(PASS) || a === '--pass'));
  t.emit('data', 'INFO Node is synced, proceeding...\r\nPassword: ');
  assert.deepEqual(t.written, [PASS + '\r']);
  assert.ok(!pw.every(x => x === 0), 'kept until the end, to recognise an echo');
  t.emit('data', '\r\nWARN HTTP Foreign listener started.\r\n');
  //asked again (it would hang): stopped, nothing more written
  t.emit('data', 'Password: ');
  assert.equal(t.written.length, 1);
  t.emit('exit', { exitCode: 1, signal: 0 });
  assert.ok(pw.every(x => x === 0), 'the host copy is zeroed at exit');
  assert.ok(!lines.join('\n').includes(PASS));
  assert.ok(lines.includes('WARN HTTP Foreign listener started.'));
  assert.equal(exit.fail, 'unexpected_prompt');
  assert.deepEqual(h.pids(), []);
});

test('the pty is never killed with its own kill(): stopped by pid (the process registry way)', async () => {
  const { h, p, killed } = host();
  const r = h.start({ cmd: BIN, args: epicboxArgs({ network: 'mainnet', dir: DIR }), kind: 'epicbox', password: Buffer.from(PASS) });
  await h.kill(r.id);
  await h.killAll();
  assert.deepEqual(killed, [r.pid, r.pid]);
  assert.equal(p.terms[0].killed, false);
});

test('init on a pty: both prompts answered, then the phrase output passes', () => {
  const { h, p } = host();
  const lines = [];
  h.start({ cmd: BIN, args: initArgs({ network: 'mainnet', dir: DIR }), kind: 'init', password: Buffer.from(PASS), onLines: (l) => lines.push(...l) });
  const t = p.terms[0];
  t.emit('data', 'New Password: ');
  t.emit('data', '\r\nConfirm Password: ');
  t.emit('data', '\r\nYour recovery phrase is:\r\n\r\n' + PHRASE + '\r\n');
  assert.deepEqual(t.written, [PASS + '\r', PASS + '\r']);
  assert.ok(lines.includes(PHRASE));
});

test('recover on a pty: phrase then passwords; no output line has the phrase; invalid phrase stops it', () => {
  const { h, p, killed } = host();
  const lines = [];
  let exit;
  h.start({ cmd: BIN, args: initArgs({ network: 'mainnet', dir: DIR, recover: true }), kind: 'recover', password: Buffer.from(PASS), phrase: PHRASE, onLines: (l) => lines.push(...l), onExit: (e) => { exit = e; } });
  const t = p.terms[0];
  t.emit('data', 'Please enter your recovery phrase:\r\nphrase> ');
  t.emit('data', PHRASE.slice(0, 20));
  t.emit('data', PHRASE.slice(20) + '\r\nNew Password: ');
  t.emit('data', '\r\nConfirm Password: ');
  t.emit('data', '\r\nYour recovery phrase is:\r\n\r\n' + PHRASE + "\r\n\r\nCommand 'init' completed successfully\r\n");
  t.emit('exit', { exitCode: 0 });
  assert.deepEqual(t.written, [PHRASE + '\r', PASS + '\r', PASS + '\r']);
  assert.ok(!lines.some(l => l.includes('rigid radio')));
  assert.ok(lines.includes("Command 'init' completed successfully"));
  assert.equal(exit.code, 0);

  h.start({ cmd: BIN, args: initArgs({ network: 'mainnet', dir: DIR, recover: true }), kind: 'recover', password: Buffer.from(PASS), phrase: 'foo bar', onExit: (e) => { exit = e; } });
  const t2 = p.terms[1];
  t2.emit('data', 'Please enter your recovery phrase:\r\nphrase> ');
  t2.emit('data', 'foo bar\r\nRecovery word phrase is invalid.\r\n');
  assert.deepEqual(killed, [t2.pid]);
  t2.emit('exit', { exitCode: null, signal: 15 });
  assert.equal(exit.fail, 'invalid_phrase');
});

test('bad requests start nothing', () => {
  const { h, p } = host();
  const ok = { cmd: BIN, args: listenArgs({ network: 'mainnet', dir: DIR }), kind: 'listen', password: Buffer.from(PASS) };
  assert.throws(() => h.start(Object.assign({}, ok, { args: ['--pass', PASS, ...ok.args] })), /password/);
  assert.throws(() => h.start(Object.assign({}, ok, { cmd: '/bin/sh' })), /epic-wallet/);
  assert.throws(() => h.start(Object.assign({}, ok, { kind: 'owner_api' })), /kind/);
  assert.throws(() => h.start(Object.assign({}, ok, { password: PASS })), /password/);
  assert.throws(() => h.start(Object.assign({}, ok, { kind: 'recover', args: initArgs({ dir: DIR, recover: true }) })), /phrase/);
  assert.equal(p.terms.length, 0);
});

test('Windows: the epic-wallet.exe pid ConPTY reports is used; no bundled conpty.dll', () => {
  const { h, p } = host({ win: true });
  const r = h.start({ cmd: 'C:\\Program Files\\EpicWallet\\resources\\bin\\win\\epic-wallet.exe', args: listenArgs({ network: 'mainnet', dir: 'C:\\Users\\jane\\.epic\\main' }), kind: 'listen', password: Buffer.from(PASS) });
  assert.equal(r.pid, p.terms[0].pid);
  assert.equal(p.terms[0].opts.useConptyDll, false);
});

test('fallback: node-pty does not load → the old --pass spawn, logged once without the arguments', () => {
  const spawned = [];
  const { h, warns } = host({
    loadPty: () => { throw new Error('Cannot find module pty.node'); },
    spawn: (cmd, args, opts) => {
      const c = new EventEmitter();
      c.pid = 777;
      c.stdout = new EventEmitter(); c.stdout.setEncoding = () => {};
      c.stderr = new EventEmitter(); c.stderr.setEncoding = () => {};
      c.stdin = { written: [], write(d) { this.written.push(d); } };
      spawned.push({ cmd, args: args.slice(), opts, c });
      return c;
    },
  });
  const args = listenArgs({ network: 'floonet', dir: DIR, tor: false });
  const r1 = h.start({ cmd: BIN, args, kind: 'listen', password: Buffer.from(PASS) });
  const r2 = h.start({ cmd: BIN, args: initArgs({ network: 'mainnet', dir: DIR, recover: true }), kind: 'recover', password: Buffer.from(PASS), phrase: PHRASE });
  assert.equal(r1.mode, 'pipe');
  assert.equal(r1.pid, 777);
  assert.deepEqual(spawned[0].args, ['--floonet', '--pass', PASS, '-t', DIR, '-c', DIR, 'listen', '--method', 'http', '--no_tor']);
  assert.deepEqual(spawned[0].opts, { shell: false, windowsHide: true });
  assert.equal(h.available(), false);
  assert.equal(warns.length, 1, 'logged once');
  assert.ok(!warns[0].includes(PASS) && !warns[0].includes(DIR));
  //recover in the fallback: the phrase goes to stdin when asked for
  spawned[1].c.stdout.emit('data', 'Please enter your recovery phrase:\n');
  assert.deepEqual(spawned[1].c.stdin.written, [PHRASE + '\n']);
  assert.deepEqual(spawned[1].args.slice(0, 2), ['--pass', PASS]);
});

test('fallback: node-pty loads but cannot start the process → the --pass spawn', () => {
  const spawned = [];
  const { h } = host({
    loadPty: () => ({ spawn: () => { throw new Error('posix_spawnp failed'); } }),
    spawn: (cmd, args) => { spawned.push(args.slice()); const c = new EventEmitter(); c.pid = 9; return c; },
  });
  const r = h.start({ cmd: BIN, args: epicboxArgs({ network: 'mainnet', dir: DIR }), kind: 'epicbox', password: Buffer.from(PASS) });
  assert.equal(r.mode, 'pipe');
  assert.equal(spawned[0][spawned[0].indexOf('--pass') + 1], PASS);
});

test('review: an echo of the password after the answer is still left out', () => {
  const { h, p } = host();
  const lines = [];
  h.start({ cmd: BIN, args: listenArgs({ network: 'mainnet', dir: DIR }), kind: 'listen', password: Buffer.from('hunter22'), onLines: (l) => lines.push(...l) });
  const t = p.terms[0];
  t.emit('data', 'Password: ');
  t.emit('data', 'hunter22\r\n');
  t.emit('data', 'x hunter22 y\r\nWARN HTTP Foreign listener started.\r\n');
  assert.deepEqual(lines, ['WARN HTTP Foreign listener started.']);
});

test('review: only the kind\'s own command, the app\'s binary and the session\'s wallet', () => {
  const { h, p } = host({ isAllowedBin: (c) => c === BIN });
  const pw = () => Buffer.from(PASS);
  assert.throws(() => h.start({ cmd: BIN, args: ['-t', DIR, '-c', DIR, 'recover'], kind: 'listen', password: pw() }), /listen command/);
  assert.throws(() => h.start({ cmd: BIN, args: ['-t', DIR, '-c', DIR, 'send', '-d', 'x'], kind: 'epicbox', password: pw() }), /epicbox command/);
  assert.throws(() => h.start({ cmd: BIN, args: ['-t', 'rel', '-c', DIR, 'listen', '--method', 'http'], kind: 'listen', password: pw() }), /dir/);
  assert.throws(() => h.start({ cmd: '/tmp/x/epic-wallet', args: listenArgs({ network: 'mainnet', dir: DIR }), kind: 'listen', password: pw() }), /binary/);
  assert.throws(() => h.start({ cmd: BIN, args: listenArgs({ network: 'mainnet', dir: '/other' }), kind: 'listen', password: pw(), dir: DIR }), /session/);
  assert.throws(() => h.start({ cmd: BIN, args: ['-psecret', ...listenArgs({ network: 'mainnet', dir: DIR })], kind: 'listen', password: pw() }), /password/);
  assert.equal(p.terms.length, 0);
  h.start({ cmd: BIN, args: listenArgs({ network: 'floonet', dir: DIR, tor: false }), kind: 'listen', password: pw(), dir: DIR });
  h.start({ cmd: BIN, args: initArgs({ network: 'usernet', dir: DIR, recover: true }), kind: 'recover', password: pw(), phrase: PHRASE });
  assert.equal(p.terms.length, 2);
});

test('review: a prompt never recognised stops the process after the timeout', async () => {
  const { h, p, killed } = host({ answerTimeoutMs: 20 });
  let exit;
  h.start({ cmd: BIN, args: listenArgs({ network: 'mainnet', dir: DIR }), kind: 'listen', password: Buffer.from(PASS), onExit: (e) => { exit = e; } });
  p.terms[0].emit('data', 'Something else? ');
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(killed, [p.terms[0].pid]);
  p.terms[0].emit('exit', { exitCode: null, signal: 15 });
  assert.equal(exit.fail, 'no_prompt');
});

test('review: a password with a control character is not typed into a terminal', () => {
  const spawned = [];
  const { h, p } = host({ spawn: (cmd, args) => { spawned.push(args.slice()); const c = new EventEmitter(); c.pid = 5; return c; } });
  const r = h.start({ cmd: BIN, args: listenArgs({ network: 'mainnet', dir: DIR }), kind: 'listen', password: Buffer.from('a\u0003b') });
  assert.equal(r.mode, 'pipe');
  assert.equal(p.terms.length, 0);
  assert.equal(spawned[0][spawned[0].indexOf('--pass') + 1], 'a\u0003b');
});

test('cwd per start: the -c dir, absolute and existing, reaches the pty spawn; anything else is refused', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  //a real folder (TMPDIR), as the wallet's config dir
  const conf = fs.mkdtempSync(path.join(os.tmpdir(), 'pty-cwd-'));
  try {
    const { h, p } = host();
    const listen = (c) => ['--usernet', '-t', DIR, '-c', c, 'listen', '--method', 'http', '--no_tor'];
    const pw = () => Buffer.from(PASS);
    //relative, missing, not the -c dir, a file, not a string: nothing starts, no fallback to the default
    assert.throws(() => h.start({ cmd: BIN, args: listen(conf), kind: 'listen', password: pw(), cwd: 'wallets/w1' }), /absolute/);
    assert.throws(() => h.start({ cmd: BIN, args: listen(conf), kind: 'listen', password: pw(), cwd: '' }), /absolute/);
    assert.throws(() => h.start({ cmd: BIN, args: listen(conf), kind: 'listen', password: pw(), cwd: 42 }), /absolute/);
    const gone = path.join(conf, 'gone');
    assert.throws(() => h.start({ cmd: BIN, args: listen(gone), kind: 'listen', password: pw(), cwd: gone }), /not a directory/);
    assert.throws(() => h.start({ cmd: BIN, args: listen(conf), kind: 'listen', password: pw(), cwd: os.tmpdir() }), /-c dir/);
    const file = path.join(conf, 'epic-wallet.toml');
    fs.writeFileSync(file, '');
    assert.throws(() => h.start({ cmd: BIN, args: listen(file), kind: 'listen', password: pw(), cwd: file }), /not a directory/);
    assert.equal(p.terms.length, 0);
    //the -c dir: passed through to node-pty, for a listener and for init
    h.start({ cmd: BIN, args: listen(conf), kind: 'listen', password: pw(), cwd: conf });
    h.start({ cmd: BIN, args: ['--usernet', '-c', conf, 'init'], kind: 'init', password: pw(), cwd: conf });
    assert.equal(p.terms[0].opts.cwd, conf);
    assert.equal(p.terms[1].opts.cwd, conf);
    //without one: the host's cwd, as before
    h.start({ cmd: BIN, args: listen(conf), kind: 'listen', password: pw() });
    assert.equal(p.terms[2].opts.cwd, '/');
    //the --pass fallback gets the same cwd
    const spawned = [];
    const f = host({ loadPty: () => { throw new Error('no pty'); }, spawn: (cmd, args, opts) => { spawned.push(opts); const c = new EventEmitter(); c.pid = 3; return c; } });
    f.h.start({ cmd: BIN, args: listen(conf), kind: 'listen', password: pw(), cwd: conf });
    assert.deepEqual(spawned[0], { shell: false, windowsHide: true, cwd: conf });
    //Windows paths: drive and UNC are absolute, a drive-relative one is not
    const w = host({ win: true, isDir: () => true });
    const wl = (c) => ['-t', 'C:\\Users\\jane\\.epic\\main', '-c', c, 'listen', '--method', 'http', '--no_tor'];
    for (const c of ['C:\\Users\\Jane Doe\\.epic-gui\\wallets\\w1', '\\\\server\\share\\w1']) {
      w.h.start({ cmd: BIN, args: wl(c), kind: 'listen', password: pw(), cwd: c });
    }
    assert.throws(() => w.h.start({ cmd: BIN, args: wl('C:wallets'), kind: 'listen', password: pw(), cwd: 'C:wallets' }), /dir|absolute/);
    assert.deepEqual(w.p.terms.map(t => t.opts.cwd), ['C:\\Users\\Jane Doe\\.epic-gui\\wallets\\w1', '\\\\server\\share\\w1']);
  } finally {
    fs.rmSync(conf, { recursive: true, force: true });
  }
});
