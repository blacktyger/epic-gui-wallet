// Tests for src/shared/sessionIpc.js: the session password's life in the main process. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSessionSecret } from '../src/shared/sessionSecret.js';
import { registerSessionIpc, wipeWithWindow, wipeWithApp } from '../src/shared/sessionIpc.js';

const PASS = 'S3cret pass&word';
const BIN = '/opt/epic/resources/bin/linux/epic-wallet';
const DIR = '/home/jane/.epic/main';

/* a fake ipcMain, the app window's webContents, a host that records what it was given */
function setup() {
  const handlers = {};
  const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
  const sent = [];
  const contents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: (ch, m) => sent.push([ch, m]) });
  const other = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: () => {} });
  const started = [];
  const ptyHost = {
    start: (req) => {
      started.push(Object.assign({}, req, { password: Buffer.from(req.password) }));
      req.onLines(['WARN HTTP Foreign listener started.']);
      req.onExit({ code: 0, signal: null, fail: null });
      return { id: 1, pid: 4242, mode: 'pty' };
    },
    kill: async () => true,
  };
  const session = createSessionSecret();
  registerSessionIpc({ ipcMain, session, ptyHost, isAppWindow: (e) => e.sender === contents });
  const call = (ch, ...a) => { const sender = a.length && a[a.length - 1] === other ? a.pop() : contents; return handlers[ch]({ sender }, ...a); };
  return { handlers, call, session, started, sent, contents, other };
}

const listenReq = { token: 't1', cmd: BIN, args: ['-t', DIR, '-c', DIR, 'listen', '--method', 'http'], kind: 'listen' };

test('unlock hands the password over once; a listener then starts without one in its request', () => {
  const { call, session, started, sent } = setup();
  assert.equal(call('session-password-has'), false);
  //locked: no listener can start
  const locked = call('pty-start', listenReq);
  assert.deepEqual(locked, { ok: false, noSession: true, error: 'locked' });
  assert.equal(started.length, 0);

  assert.equal(call('session-password-set', PASS, DIR), true);
  assert.equal(call('session-password-has'), true);
  const r = call('pty-start', listenReq);
  assert.deepEqual(r, { ok: true, pid: 4242, mode: 'pty', id: 1 });
  assert.equal(started[0].password.toString(), PASS, 'the host got the session password');
  assert.equal(started[0].dir, DIR, 'only for the unlocked wallet');
  assert.ok(!JSON.stringify(r).includes(PASS) && !JSON.stringify(sent).includes(PASS), 'never sent back');
  assert.deepEqual(sent.map(s => s[0]), ['pty-data', 'pty-exit']);
  assert.equal(sent[0][1].token, 't1');
  //a password in a listener request is ignored: the session's is used
  call('pty-start', Object.assign({}, listenReq, { password: 'other' }));
  assert.equal(started[1].password.toString(), PASS);
  assert.ok(session.has());
});

test('lock (clear) wipes it: the next listener start finds no session', () => {
  const { call, started } = setup();
  call('session-password-set', PASS, DIR);
  call('session-password-clear');
  assert.equal(call('session-password-has'), false);
  assert.equal(call('pty-start', listenReq).noSession, true);
  assert.equal(started.length, 0);
});

test('init / recover bring their own password, for that process only', () => {
  const { call, started, session } = setup();
  const r = call('pty-start', { token: 't2', cmd: BIN, args: ['-c', DIR, 'init'], kind: 'init', password: 'newpw' });
  assert.equal(r.ok, true);
  assert.equal(started[0].password.toString(), 'newpw');
  assert.equal(session.has(), false, 'creating a wallet is no unlock');
  assert.equal(call('pty-start', { token: 't3', cmd: BIN, args: ['-c', DIR, 'init'], kind: 'init' }).ok, false);
});

test('another window or page gets nothing', () => {
  const { call, other, started } = setup();
  assert.equal(call('session-password-set', PASS, DIR, other), false);
  call('session-password-set', PASS, DIR);
  assert.deepEqual(call('pty-start', listenReq, other), { ok: false, error: 'refused' });
  assert.equal(started.length, 0);
});

test('reload, renderer crash, quit and process exit wipe it', () => {
  for (const [what, fire] of [
    ['reload', (w) => w.contents.emit('did-navigate')],
    ['crash', (w) => w.contents.emit('render-process-gone')],
    ['window closed', (w) => w.contents.emit('destroyed')],
    ['before-quit', (w) => w.app.emit('before-quit')],
    ['will-quit', (w) => w.app.emit('will-quit')],
    ['exit', (w) => w.proc.emit('exit')],
  ]) {
    const w = setup();
    w.app = new EventEmitter();
    w.proc = new EventEmitter();
    wipeWithWindow(w.contents, w.session);
    wipeWithApp({ app: w.app, proc: w.proc, session: w.session });
    w.call('session-password-set', PASS, DIR);
    const held = w.session.copy();
    fire(w);
    assert.equal(w.session.has(), false, what);
    assert.equal(held.toString(), PASS, 'only the copy given out is left, for the caller to zero');
  }
});

test('review: the password needs a wallet dir; another window can neither ask nor use it', () => {
  const { call, other, session } = setup();
  assert.equal(call('session-password-set', PASS), false);
  assert.equal(session.has(), false);
  call('session-password-set', PASS, DIR);
  assert.equal(call('session-password-has', other), false);
  assert.equal(call('session-password-has'), true);
  //any window may lock
  call('session-password-clear', other);
  assert.equal(session.has(), false);
});
