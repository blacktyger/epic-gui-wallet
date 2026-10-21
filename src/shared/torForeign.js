/*
 * The one network call the page may make over Tor (background.js 'tor-foreign', tor-616 §4/§5):
 * a JSON-RPC POST of check_version or receive_tx to http://<onion>/v2/foreign, through the
 * wallet's own tor (SOCKS5 on 127.0.0.1). Nothing else: the target must be a valid onion, the
 * path and port are fixed, the body and the answer are bounded.
 *
 *   checkForeignRequest(req) → {onion, body, user} | {error}
 *   foreignCall({connect, socksPort, onion, body, user, ...timeouts}) → {ok: true, result} |
 *     {ok: false, code, detail}; result is the parsed JSON-RPC answer ({jsonrpc, id, result|error})
 *
 * SOCKS5 with the domain-name address type: tor resolves the onion, never this computer's DNS.
 * Username/password auth gives each send its own circuit (IsolateSOCKSAuth); the "password" is
 * a fixed word. Tor's ExtendedErrors (0xF0-0xF7) say what went wrong with an onion (§5 table).
 *
 * Plain ESM, connect (net.connect) passed in: tests/torForeign.test.js. Never logs a slate.
 */
import { parseOnion } from './onion.js';

export const METHODS = ['check_version', 'receive_tx'];
export const BODY_MAX = 1024 * 1024;
export const REPLY_MAX = 4 * 1024 * 1024;
//tor itself waits up to 120 s before it says an onion isn't there: too long for a person to wait.
//torSend tries check_version once more after this timeout, so a send waits at most ~2.4 min to connect
export const CONNECT_TIMEOUT_MS = 72000;
export const REPLY_TIMEOUT_MS = 120000;

/* SOCKS reply codes → the §5 error codes */
export function socksCode(rep) {
  if ([0xf0, 0xf2, 0xf7, 0x04, 0x05].includes(rep)) return 'unreachable';
  if (rep === 0xf6) return 'invalid';
  if (rep === 0xf4 || rep === 0xf5) return 'auth';
  return 'broken';
}

const USER = /^[A-Za-z0-9_-]{1,64}$/;

/* the page's request {onion, method, params, isolation} → what is sent, or {error} */
export function checkForeignRequest(req) {
  if (!req || typeof req !== 'object') return { error: 'bad request' };
  const p = parseOnion(req.onion);
  if (!p.valid) return { error: 'invalid', reason: p.reason };
  if (!METHODS.includes(req.method)) return { error: 'method not allowed' };
  let params;
  if (req.method === 'check_version') {
    if (req.params !== undefined && !(Array.isArray(req.params) && req.params.length === 0)) return { error: 'bad params' };
    params = [];
  } else {
    //receive_tx [slate, dest_acct_name, message, ...]: the GUI sends the slate and nulls (adapters/http.rs)
    const ps = req.params;
    if (!Array.isArray(ps) || ps.length !== 4 || !ps[0] || typeof ps[0] !== 'object' || Array.isArray(ps[0])
      || ps.slice(1).some(x => x !== null)) return { error: 'bad params' };
    params = ps;
  }
  const body = JSON.stringify({ jsonrpc: '2.0', method: req.method, id: 1, params });
  if (Buffer.byteLength(body) > BODY_MAX) return { error: 'too large' };
  const user = req.isolation === undefined ? '' : String(req.isolation);
  if (user && !USER.test(user)) return { error: 'bad isolation' };
  return { onion: p.host, body, user };
}

/* an HTTP/1.1 response (the whole bytes, Connection: close) → {status, body} | null */
export function parseHttpResponse(buf) {
  const end = buf.indexOf('\r\n\r\n');
  if (end < 0) return null;
  const head = buf.subarray(0, end).toString('latin1').split('\r\n');
  const m = /^HTTP\/1\.[01] (\d{3})/.exec(head[0] || '');
  if (!m) return null;
  const headers = {};
  for (const h of head.slice(1)) {
    const i = h.indexOf(':');
    if (i > 0) headers[h.slice(0, i).trim().toLowerCase()] = h.slice(i + 1).trim();
  }
  let body = buf.subarray(end + 4);
  if (/chunked/i.test(headers['transfer-encoding'] || '')) {
    //only hex sizes (a peer's "-6" must never move `at` backwards and loop the main process),
    //every chunk moves forward, the total stays within REPLY_MAX
    const parts = [];
    let at = 0;
    let total = 0;
    for (;;) {
      const nl = body.indexOf('\r\n', at);
      if (nl < 0) return null;
      const field = body.subarray(at, nl).toString('latin1').split(';')[0].trim();
      if (!/^[0-9a-f]{1,8}$/i.test(field)) return null;
      const size = parseInt(field, 16);
      if (size === 0) break;
      total += size;
      if (total > REPLY_MAX) return null;
      const next = nl + 2 + size + 2;
      if (next > body.length) return null;
      parts.push(body.subarray(nl + 2, nl + 2 + size));
      at = next;
    }
    body = Buffer.concat(parts);
  } else if (headers['content-length'] !== undefined) {
    const n = Number(headers['content-length']);
    if (!Number.isInteger(n) || n > body.length) return null;
    body = body.subarray(0, n);
  }
  return { status: Number(m[1]), body: body.toString('utf8') };
}

/*
 * One POST over SOCKS. connect({host, port}) → a net.Socket (connecting).
 * Errors: unreachable | invalid | broken | auth (SOCKS), not_epic (HTTP status or not JSON-RPC),
 * tor_off (no SOCKS port), too_large (answer over REPLY_MAX).
 */
export function foreignCall({ connect, socksPort, onion, body, user, connectTimeoutMs = CONNECT_TIMEOUT_MS,
  replyTimeoutMs = REPLY_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  return new Promise((resolve) => {
    if (!(socksPort > 0)) return resolve({ ok: false, code: 'tor_off', detail: '' });
    let sock;
    let done = false;
    let stage = 'greeting';
    let buf = Buffer.alloc(0);
    let timer = null;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimer(timer);
      try { sock && sock.destroy(); } catch (e) { /* gone */ }
      resolve(r);
    };
    const fail = (code, detail) => finish({ ok: false, code, detail: detail || '' });
    const arm = (ms, code, detail) => {
      clearTimer(timer);
      timer = setTimer(() => fail(code, detail), ms);
    };
    arm(connectTimeoutMs, 'unreachable', 'timeout');
    try {
      sock = connect({ host: '127.0.0.1', port: socksPort });
    } catch (e) {
      return fail('tor_off', e && e.code || '');
    }
    const name = Buffer.from(user || 'epic-gui');
    const host = Buffer.from(onion, 'ascii');
    sock.on('connect', () => sock.write(Buffer.from([5, 1, 2])));
    sock.on('error', (e) => fail(stage === 'greeting' && e && e.code === 'ECONNREFUSED' ? 'tor_off' : 'broken', e && e.code || ''));
    sock.on('close', () => {
      if (stage !== 'http') return fail('broken', 'closed');
      const res = parseHttpResponse(buf);
      if (!res) return fail('broken', 'incomplete answer');
      if (res.status !== 200) return fail('not_epic', 'HTTP ' + res.status);
      let json;
      try { json = JSON.parse(res.body); } catch (e) { return fail('not_epic', 'not JSON'); }
      if (!json || typeof json !== 'object' || json.jsonrpc !== '2.0' || (json.result === undefined && json.error === undefined)) {
        return fail('not_epic', 'not JSON-RPC');
      }
      finish({ ok: true, result: json });
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'http') {
        if (buf.length > REPLY_MAX) fail('too_large', '');
        return;
      }
      if (stage === 'greeting') {
        if (buf.length < 2) return;
        if (buf[0] !== 5 || buf[1] !== 2) return fail('broken', 'socks method');
        buf = buf.subarray(2);
        stage = 'auth';
        sock.write(Buffer.concat([Buffer.from([1, name.length]), name, Buffer.from([1]), Buffer.from('x')]));
      }
      if (stage === 'auth') {
        if (buf.length < 2) return;
        if (buf[1] !== 0) return fail('broken', 'socks auth');
        buf = buf.subarray(2);
        stage = 'connect';
        const port = Buffer.from([0, 80]);
        sock.write(Buffer.concat([Buffer.from([5, 1, 0, 3, host.length]), host, port]));
      }
      if (stage === 'connect') {
        if (buf.length < 2) return;
        if (buf[1] !== 0) return fail(socksCode(buf[1]), 'socks 0x' + buf[1].toString(16).padStart(2, '0'));
        //05 00 00 ATYP addr port
        if (buf.length < 4) return;
        const len = buf[3] === 1 ? 4 : buf[3] === 4 ? 16 : buf[3] === 3 ? (buf.length > 4 ? 1 + buf[4] : Infinity) : -1;
        if (len < 0) return fail('broken', 'socks reply');
        if (buf.length < 4 + len + 2) return;
        buf = buf.subarray(4 + len + 2);
        stage = 'http';
        arm(replyTimeoutMs, 'broken', 'no answer');
        const payload = Buffer.from(body, 'utf8');
        sock.write(Buffer.concat([Buffer.from('POST /v2/foreign HTTP/1.1\r\nHost: ' + onion + '\r\nContent-Type: application/json\r\n'
          + 'Content-Length: ' + payload.length + '\r\nConnection: close\r\n\r\n', 'latin1'), payload]));
      }
    });
  });
}
