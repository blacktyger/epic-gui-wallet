// Tests for src/shared/torControl.js: tor's control-port replies and commands (tor-616 §4). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createReplyParser, parseKeywords, parseEvent, createTorControl, parseControlFile } from '../src/shared/torControl.js';

test('the parser: one-line, multi-line, data blocks and events split over chunks', () => {
  const feed = createReplyParser();
  assert.deepEqual(feed('250 OK\r\n'), [{ code: 250, lines: ['OK'], async: false }]);
  assert.deepEqual(feed('250-ServiceID=abc\r\n250 O'), []);
  assert.deepEqual(feed('K\r\n'), [{ code: 250, lines: ['ServiceID=abc', 'OK'], async: false }]);
  assert.deepEqual(feed('250+config-text=\r\nSocksPort auto\r\n..dot\r\n.\r\n250 OK\r\n'),
    [{ code: 250, lines: ['config-text=\nSocksPort auto\n.dot', 'OK'], async: false }]);
  const r = feed('650 STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=45 TAG=loading_descriptors SUMMARY="Loading relay descriptors"\r\n552 Unrecognized key\r\n');
  assert.equal(r.length, 2);
  assert.equal(r[0].async, true);
  assert.deepEqual(r[1], { code: 552, lines: ['Unrecognized key'], async: false });
  assert.deepEqual(feed('650-HS_DESC_CONTENT x\r\n650 OK\r\n'), [{ code: 650, lines: ['HS_DESC_CONTENT x', 'OK'], async: true }]);
  assert.deepEqual(feed('garbage\r\n'), []);
});

test('keywords with quoted values', () => {
  assert.deepEqual(parseKeywords('PROGRESS=100 TAG=done SUMMARY="Done \\"really\\""'), { PROGRESS: '100', TAG: 'done', SUMMARY: 'Done "really"' });
});

test('events: bootstrap, a bootstrap warning, clock skew, HS_DESC', () => {
  assert.deepEqual(parseEvent('STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=100 TAG=done SUMMARY="Done"'),
    { type: 'bootstrap', progress: 100, tag: 'done', summary: 'Done', warning: '' });
  assert.equal(parseEvent('STATUS_CLIENT WARN BOOTSTRAP PROGRESS=5 TAG=conn WARNING="Connection refused" REASON=CONNECTREFUSED').warning, 'Connection refused');
  assert.deepEqual(parseEvent('STATUS_GENERAL WARN CLOCK_SKEW SKEW=-7200 SOURCE=OR:1.2.3.4:443'), { type: 'clock_skew', skew: -7200 });
  assert.deepEqual(parseEvent('HS_DESC UPLOADED mk7ca5rxicc6ps765gdj3irikfzer6ffd2jpysipnnpttl7jynzaluyd UNKNOWN $ABCDEF~relay'),
    { type: 'hs_desc', action: 'UPLOADED', service: 'mk7ca5rxicc6ps765gdj3irikfzer6ffd2jpysipnnpttl7jynzaluyd', hsdir: '$ABCDEF~relay', reason: '' });
  assert.equal(parseEvent('HS_DESC FAILED x NO_AUTH $A REASON=UPLOAD_REJECTED').reason, 'UPLOAD_REJECTED');
  assert.equal(parseEvent('CIRC 1 BUILT').type, 'other');
});

test('the control file', () => {
  assert.deepEqual(parseControlFile('PORT=127.0.0.1:41235\n'), { host: '127.0.0.1', port: 41235 });
  assert.equal(parseControlFile('PORT=10.0.0.1:1'), null);
  assert.equal(parseControlFile(''), null);
});

/* a fake tor: answers each command line with `answers[cmd]` (a function or text) */
function fakeTor(answers) {
  const s = new EventEmitter();
  s.sent = [];
  s.destroyed = false;
  s.destroy = () => { s.destroyed = true; };
  s.write = (line) => {
    const cmd = line.replace(/\r\n$/, '');
    s.sent.push(cmd);
    const verb = cmd.split(' ')[0];
    const a = answers[cmd] !== undefined ? answers[cmd] : answers[verb];
    if (a === undefined) return;
    setImmediate(() => s.emit('data', typeof a === 'function' ? a(cmd) : a));
  };
  return s;
}

test('commands: auth, ownership, socks port, ADD_ONION with DiscardPK, events between replies', async () => {
  const events = [];
  const sock = fakeTor({
    AUTHENTICATE: '250 OK\r\n',
    TAKEOWNERSHIP: '250 OK\r\n',
    RESETCONF: '250 OK\r\n',
    'GETINFO net/listeners/socks': '650 STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=10 TAG=conn_done SUMMARY="x"\r\n250-net/listeners/socks="127.0.0.1:39111"\r\n250 OK\r\n',
    ADD_ONION: '250-ServiceID=mk7ca5rxicc6ps765gdj3irikfzer6ffd2jpysipnnpttl7jynzaluyd\r\n250 OK\r\n',
    'GETINFO status/bootstrap-phase': '250-status/bootstrap-phase=NOTICE BOOTSTRAP PROGRESS=100 TAG=done SUMMARY="Done"\r\n250 OK\r\n',
  });
  const c = createTorControl({ socket: sock, onEvent: (e) => events.push(e) });
  await c.authenticate('ab'.repeat(32));
  await c.takeOwnership();
  assert.equal(await c.socksPort(), 39111);
  assert.equal(events[0].progress, 10);
  assert.equal((await c.bootstrapPhase()).progress, 100);
  const key = Buffer.alloc(64, 7).toString('base64');
  assert.equal(await c.addOnion(key, 3415), 'mk7ca5rxicc6ps765gdj3irikfzer6ffd2jpysipnnpttl7jynzaluyd');
  assert.deepEqual(sock.sent.slice(0, 3), ['AUTHENTICATE ' + 'ab'.repeat(32), 'TAKEOWNERSHIP', 'RESETCONF __OwningControllerProcess']);
  assert.equal(sock.sent.find(l => l.startsWith('ADD_ONION')), 'ADD_ONION ED25519-V3:' + key + ' Flags=DiscardPK Port=80,127.0.0.1:3415');
});

test('errors: a 5xx reply rejects with its code; bad arguments never reach tor', async () => {
  const sock = fakeTor({ AUTHENTICATE: '515 Authentication failed: Wrong length on authentication cookie.\r\n' });
  const c = createTorControl({ socket: sock });
  await assert.rejects(c.authenticate('cd'.repeat(32)), (e) => e.code === 515);
  await assert.rejects(c.authenticate('xyz'));
  await assert.rejects(c.addOnion('short', 80));
  await assert.rejects(c.addOnion(Buffer.alloc(64).toString('base64'), 70000));
  await assert.rejects(c.delOnion('../x'));
  await assert.rejects(c.signal('SHUTDOWN\r\nSIGNAL HALT'));
  await assert.rejects(c.command('GETINFO x\r\nSIGNAL HALT'));
  assert.equal(sock.sent.length, 1);
});

test('a command that gets no answer times out and closes the connection; close rejects the rest', async () => {
  let closed = 0;
  const sock = fakeTor({});
  //a timer the test waits for (the real one is unref'd)
  const c = createTorControl({ socket: sock, timeoutMs: 20, onClose: () => closed++,
    setTimer: (f, ms) => ({ t: setTimeout(f, ms) }), clearTimer: (o) => clearTimeout(o && o.t) });
  await assert.rejects(c.command('GETINFO version'), /timed out/);
  assert.equal(c.closed, true);
  assert.equal(sock.destroyed, true);
  assert.equal(closed, 1);
  await assert.rejects(c.command('GETINFO version'), /closed/);
  //tor going away rejects what waits
  const sock2 = fakeTor({});
  const c2 = createTorControl({ socket: sock2 });
  const p = c2.command('SIGNAL SHUTDOWN');
  sock2.emit('close');
  await assert.rejects(p, /closed/);
});
