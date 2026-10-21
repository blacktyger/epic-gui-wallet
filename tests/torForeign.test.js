// Tests for src/shared/torForeign.js: the page's one call over Tor, through a fake SOCKS5 server (tor-616 §4/§5). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { checkForeignRequest, foreignCall, parseHttpResponse, socksCode, BODY_MAX } from '../src/shared/torForeign.js';

const ONION = 'mk7ca5rxicc6ps765gdj3irikfzer6ffd2jpysipnnpttl7jynzaluyd';
const VERSION_OK = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { Ok: { foreign_api_version: 2, supported_slate_versions: ['V3', 'V2'] } } });

/*
 * A fake tor SOCKS port. opts.rep: the CONNECT reply code; opts.http(request) → the raw HTTP answer
 * (string) or null to hang; opts.silent: never answer the greeting. Records what it saw.
 */
async function fakeSocks(opts = {}) {
  const seen = [];
  const server = net.createServer((s) => {
    let buf = Buffer.alloc(0);
    let stage = 'greeting';
    const rec = { methods: null, user: '', atyp: 0, host: '', port: 0, request: '' };
    seen.push(rec);
    s.on('error', () => {});
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (opts.silent) return;
      if (stage === 'greeting' && buf.length >= 3) {
        rec.methods = [...buf.subarray(2, 2 + buf[1])];
        buf = buf.subarray(2 + buf[1]);
        s.write(Buffer.from([5, 2]));
        stage = 'auth';
      }
      if (stage === 'auth' && buf.length >= 2 && buf.length >= 3 + buf[1]) {
        const ul = buf[1];
        const pl = buf[2 + ul];
        if (buf.length < 3 + ul + pl) return;
        rec.user = buf.subarray(2, 2 + ul).toString();
        buf = buf.subarray(3 + ul + pl);
        s.write(Buffer.from([1, 0]));
        stage = 'connect';
      }
      if (stage === 'connect' && buf.length >= 5) {
        rec.atyp = buf[3];
        const hl = buf[4];
        if (buf.length < 5 + hl + 2) return;
        rec.host = buf.subarray(5, 5 + hl).toString();
        rec.port = buf.readUInt16BE(5 + hl);
        buf = buf.subarray(5 + hl + 2);
        const rep = opts.rep || 0;
        s.write(Buffer.from([5, rep, 0, 1, 0, 0, 0, 0, 0, 0]));
        if (rep) return s.end();
        stage = 'http';
      }
      if (stage === 'http') {
        rec.request = buf.toString();
        if (!rec.request.includes('\r\n\r\n')) return;
        const len = Number((/Content-Length: (\d+)/.exec(rec.request) || [])[1]);
        if (buf.length < rec.request.indexOf('\r\n\r\n') + 4 + len) return;
        const ans = opts.http ? opts.http(rec.request) : 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ' + Buffer.byteLength(VERSION_OK) + '\r\n\r\n' + VERSION_OK;
        stage = 'done';
        if (ans !== null) s.end(ans);
      }
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { port: server.address().port, seen, close: () => new Promise(r => { server.close(r); server.unref(); }) };
}

const connect = (o) => net.connect(o);
const call = (port, extra = {}) => {
  const r = checkForeignRequest({ onion: ONION, method: 'check_version', params: [], isolation: 'send-1' });
  return foreignCall(Object.assign({ connect, socksPort: port, ...r }, extra));
};

test('check_version over SOCKS5: user/pass auth with the send\'s own name, onion as a domain name, POST /v2/foreign on port 80', async () => {
  const f = await fakeSocks();
  const r = await call(f.port);
  await f.close();
  assert.deepEqual(r, { ok: true, result: JSON.parse(VERSION_OK) });
  const s = f.seen[0];
  assert.deepEqual(s.methods, [2]);
  assert.equal(s.user, 'send-1');
  assert.equal(s.atyp, 3, 'domain name: tor resolves the onion, never local DNS');
  assert.equal(s.host, ONION + '.onion');
  assert.equal(s.port, 80);
  assert.match(s.request, /^POST \/v2\/foreign HTTP\/1\.1\r\nHost: mk7ca5\S+\.onion\r\n/);
  assert.match(s.request, /\r\n\r\n\{"jsonrpc":"2\.0","method":"check_version","id":1,"params":\[\]\}$/);
});

test('a chunked answer is read too', async () => {
  const f = await fakeSocks({ http: () => 'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n' + Buffer.byteLength(VERSION_OK).toString(16) + '\r\n' + VERSION_OK + '\r\n0\r\n\r\n' });
  const r = await call(f.port);
  await f.close();
  assert.equal(r.ok, true);
  assert.equal(r.result.result.Ok.foreign_api_version, 2);
});

test('each extended SOCKS error maps to its code', async () => {
  const want = { 0xf0: 'unreachable', 0xf2: 'unreachable', 0xf7: 'unreachable', 0xf6: 'invalid', 0xf3: 'broken', 0x01: 'broken',
    0x06: 'broken', 0xf4: 'auth', 0xf5: 'auth', 0xf1: 'broken', 0x04: 'unreachable' };
  for (const [rep, code] of Object.entries(want)) {
    const f = await fakeSocks({ rep: Number(rep) });
    const r = await call(f.port);
    await f.close();
    assert.equal(r.ok, false);
    assert.equal(r.code, code, 'rep 0x' + Number(rep).toString(16));
    assert.equal(socksCode(Number(rep)), code);
  }
});

test('not an Epic wallet: HTTP 404, HTML, JSON that isn\'t JSON-RPC', async () => {
  for (const [http, detail] of [
    ['HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n', 'HTTP 404'],
    ['HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\n<html>', 'not JSON'],
    ['HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}', 'not JSON-RPC'],
  ]) {
    const f = await fakeSocks({ http: () => http });
    const r = await call(f.port);
    await f.close();
    assert.deepEqual(r, { ok: false, code: 'not_epic', detail });
  }
});

test('timeouts: no SOCKS answer → unreachable; no HTTP answer → broken; a dropped stream → broken', async () => {
  let f = await fakeSocks({ silent: true });
  let r = await call(f.port, { connectTimeoutMs: 50 });
  await f.close();
  assert.deepEqual(r, { ok: false, code: 'unreachable', detail: 'timeout' });
  f = await fakeSocks({ http: () => null });
  r = await call(f.port, { replyTimeoutMs: 50 });
  await f.close();
  assert.deepEqual(r, { ok: false, code: 'broken', detail: 'no answer' });
  f = await fakeSocks({ http: () => 'HTTP/1.1 200 OK\r\nContent-Length: 500\r\n\r\n{"jsonrpc"' });
  r = await call(f.port);
  await f.close();
  assert.deepEqual(r, { ok: false, code: 'broken', detail: 'incomplete answer' });
});

test('no tor: no SOCKS port, or nothing listening', async () => {
  assert.equal((await call(0)).code, 'tor_off');
  const f = await fakeSocks();
  const port = f.port;
  await f.close();
  assert.equal((await call(port)).code, 'tor_off');
});

test('the allowlist: only a valid onion, only check_version and receive_tx, bounded, fixed shapes', () => {
  assert.equal(checkForeignRequest(null).error, 'bad request');
  assert.equal(checkForeignRequest({ onion: 'example.com', method: 'check_version' }).error, 'invalid');
  assert.equal(checkForeignRequest({ onion: ONION.slice(0, 55) + 'a', method: 'check_version' }).error, 'invalid');
  assert.equal(checkForeignRequest({ onion: '127.0.0.1:3415', method: 'check_version' }).error, 'invalid');
  for (const method of ['build_coinbase', 'verify_slate_messages', 'finalize_invoice_tx', 'receive_tx ', '']) {
    assert.equal(checkForeignRequest({ onion: ONION, method, params: [] }).error, 'method not allowed', method);
  }
  assert.equal(checkForeignRequest({ onion: ONION, method: 'check_version', params: [1] }).error, 'bad params');
  assert.equal(checkForeignRequest({ onion: ONION, method: 'receive_tx', params: [{}, 'acct', null, null] }).error, 'bad params');
  assert.equal(checkForeignRequest({ onion: ONION, method: 'receive_tx', params: [{}] }).error, 'bad params');
  assert.equal(checkForeignRequest({ onion: ONION, method: 'receive_tx', params: ['slate', null, null, null] }).error, 'bad params');
  assert.equal(checkForeignRequest({ onion: ONION, method: 'receive_tx', params: [{ x: 'a'.repeat(BODY_MAX) }, null, null, null] }).error, 'too large');
  assert.equal(checkForeignRequest({ onion: ONION, method: 'check_version', isolation: 'a b' }).error, 'bad isolation');
  const ok = checkForeignRequest({ onion: 'http://' + ONION + '.onion/', method: 'receive_tx', params: [{ id: 'x' }, null, null, null] });
  assert.equal(ok.onion, ONION + '.onion');
  assert.deepEqual(JSON.parse(ok.body), { jsonrpc: '2.0', method: 'receive_tx', id: 1, params: [{ id: 'x' }, null, null, null] });
});

test('parseHttpResponse refuses what isn\'t HTTP', () => {
  assert.equal(parseHttpResponse(Buffer.from('garbage')), null);
  assert.equal(parseHttpResponse(Buffer.from('SSH-2.0\r\n\r\n')), null);
});

test('parseHttpResponse: a negative or non-hex chunk size is an incomplete answer, never a loop', () => {
  const head = 'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n';
  assert.equal(parseHttpResponse(Buffer.from(head + '-6\r\nabcdef\r\n0\r\n\r\n')), null);
  assert.equal(parseHttpResponse(Buffer.from(head + '+6\r\nabcdef\r\n0\r\n\r\n')), null);
  assert.equal(parseHttpResponse(Buffer.from(head + '0x6\r\nabcdef\r\n0\r\n\r\n')), null);
  assert.equal(parseHttpResponse(Buffer.from(head + '\r\nabcdef\r\n0\r\n\r\n')), null);
  //too long a size, or a chunk past the end of what arrived
  assert.equal(parseHttpResponse(Buffer.from(head + 'fffffffff\r\nab\r\n0\r\n\r\n')), null);
  assert.equal(parseHttpResponse(Buffer.from(head + '10\r\nab\r\n0\r\n\r\n')), null);
  assert.equal(parseHttpResponse(Buffer.from(head + '400001\r\nab\r\n0\r\n\r\n')), null);
});

test('parseHttpResponse: chunk extensions and upper-case hex are fine', () => {
  const head = 'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n';
  const r = parseHttpResponse(Buffer.from(head + '3;name=x\r\nabc\r\nA\r\n0123456789\r\n0\r\n\r\n'));
  assert.deepEqual(r, { status: 200, body: 'abc0123456789' });
});

test('foreignCall: a 200 chunked reply with chunk size -6 ends as broken, not a hang', async () => {
  const f = await fakeSocks({ http: () => 'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n-6\r\nabcdef\r\n0\r\n\r\n' });
  const r = await call(f.port, { replyTimeoutMs: 5000 });
  await f.close();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'broken');
});
