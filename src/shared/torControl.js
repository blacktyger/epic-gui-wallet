/*
 * A minimal client for tor's control port (control-spec.txt), for torManager.js: authenticate with
 * the cookie, take ownership, read the SOCKS port and bootstrap phase, follow the STATUS_CLIENT,
 * STATUS_GENERAL and HS_DESC events, add and remove the wallet's onion service, shut tor down.
 *
 * Replies: "250 OK", multi-line "250-key=value" … "250 OK", data blocks "250+key=" … "." and
 * asynchronous events "650 …" (also multi-line) that may come between any two replies. Commands
 * are answered in order, so one queue matches them up.
 *
 * Plain ESM, the socket passed in (net.connect in torManager): tests/torControl.test.js. The
 * ADD_ONION key is never logged; DiscardPK keeps tor from sending it back.
 */

/* the reply parser: feed(text) → complete replies [{code, lines, async}] (the lines without the
   "250-" prefix; a data block's lines joined to its key line with \n) */
export function createReplyParser() {
  let buf = '';
  let lines = [];
  let data = null;
  return function feed(chunk) {
    buf += chunk;
    const out = [];
    let at;
    while ((at = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, at).replace(/\r$/, '');
      buf = buf.slice(at + 1);
      if (data) {
        if (line === '.') {
          lines.push(data.join('\n'));
          data = null;
        } else {
          //a leading dot is doubled in a data block
          data.push(line.startsWith('..') ? line.slice(1) : line);
        }
        continue;
      }
      const m = /^(\d{3})([ +-])(.*)$/.exec(line);
      if (!m) continue;
      if (m[2] === '+') {
        data = [m[3]];
        continue;
      }
      lines.push(m[3]);
      if (m[2] === ' ') {
        out.push({ code: Number(m[1]), lines, async: m[1] === '650' });
        lines = [];
      }
    }
    return out;
  };
}

/* KEY=value pairs of an event or reply line; values may be "quoted" (with \" escapes) */
export function parseKeywords(text) {
  const out = {};
  const re = /([A-Za-z0-9_/.-]+)=("((?:[^"\\]|\\.)*)"|\S*)/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    out[m[1]] = m[3] !== undefined ? m[3].replace(/\\(.)/g, '$1') : m[2];
  }
  return out;
}

/*
 * An event (an async reply's first line) → a plain object:
 *   {type: 'bootstrap', progress, tag, summary, warning}  STATUS_CLIENT … BOOTSTRAP (NOTICE or WARN)
 *   {type: 'clock_skew', skew}                           STATUS_GENERAL WARN CLOCK_SKEW
 *   {type: 'hs_desc', action, service, hsdir, reason}    HS_DESC UPLOADED|FAILED|UPLOAD|…
 *   {type: 'other', line}
 */
export function parseEvent(line) {
  const parts = String(line || '').split(' ');
  if (parts[0] === 'STATUS_CLIENT' && parts[2] === 'BOOTSTRAP') {
    const k = parseKeywords(parts.slice(3).join(' '));
    return { type: 'bootstrap', progress: Number(k.PROGRESS) || 0, tag: k.TAG || '', summary: k.SUMMARY || '',
      warning: parts[1] === 'WARN' ? (k.WARNING || k.REASON || 'warning') : '' };
  }
  if (parts[0] === 'STATUS_GENERAL' && parts[2] === 'CLOCK_SKEW') {
    const k = parseKeywords(parts.slice(3).join(' '));
    return { type: 'clock_skew', skew: Number(k.SKEW) || 0 };
  }
  if (parts[0] === 'HS_DESC') {
    const k = parseKeywords(parts.slice(5).join(' '));
    return { type: 'hs_desc', action: parts[1] || '', service: parts[2] || '', hsdir: parts[4] || '', reason: k.REASON || '' };
  }
  return { type: 'other', line: String(line || '') };
}

export class TorControlError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/*
 * A control connection over `socket` (a connected net.Socket, or anything with write/on/destroy).
 *   onEvent(event): parseEvent's object for every 650 event
 *   onClose(): the connection ended (tor exited, or shutdown)
 *   timeoutMs: a command not answered by then fails (and the connection is closed)
 */
export function createTorControl({ socket, onEvent = () => {}, onClose = () => {}, timeoutMs = 15000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const feed = createReplyParser();
  const queue = [];
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    for (const q of queue.splice(0)) {
      clearTimer(q.timer);
      q.reject(new TorControlError(0, 'control connection closed'));
    }
    try { socket.destroy(); } catch (e) { /* gone */ }
    onClose();
  }

  if (typeof socket.setEncoding === 'function') socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    for (const r of feed(String(chunk))) {
      if (r.async) {
        try { onEvent(parseEvent(r.lines[0]), r); } catch (e) { /* a listener's problem */ }
        continue;
      }
      const q = queue.shift();
      if (!q) continue;
      clearTimer(q.timer);
      if (r.code >= 200 && r.code < 300) q.resolve(r);
      else q.reject(new TorControlError(r.code, r.lines.join(' ')));
    }
  });
  socket.on('error', () => close());
  socket.on('close', () => close());
  socket.on('end', () => close());

  /* send one command line → its reply {code, lines}; rejects TorControlError on 4xx/5xx */
  function command(line) {
    if (closed) return Promise.reject(new TorControlError(0, 'control connection closed'));
    if (/[\r\n]/.test(line)) return Promise.reject(new TorControlError(0, 'bad command'));
    return new Promise((resolve, reject) => {
      const q = { resolve, reject, timer: null };
      q.timer = setTimer(() => {
        reject(new TorControlError(0, 'control command timed out'));
        const i = queue.indexOf(q);
        if (i >= 0) queue.splice(i, 1);
        //the next reply would be matched to the wrong command
        close();
      }, timeoutMs);
      if (q.timer && typeof q.timer.unref === 'function') q.timer.unref();
      queue.push(q);
      socket.write(line + '\r\n');
    });
  }

  async function getInfo(key) {
    const r = await command('GETINFO ' + key);
    const line = r.lines.find(l => l.startsWith(key + '='));
    if (line === undefined) throw new TorControlError(0, 'no ' + key + ' in the reply');
    return line.slice(key.length + 1);
  }

  return {
    command,
    getInfo,
    close,
    get closed() { return closed; },
    authenticate: (cookieHex) => {
      if (!/^[0-9a-f]{64}$/i.test(String(cookieHex))) return Promise.reject(new TorControlError(0, 'bad cookie'));
      return command('AUTHENTICATE ' + cookieHex);
    },
    /* tor exits once this connection closes; the torrc's __OwningControllerProcess is no longer needed */
    takeOwnership: async () => {
      await command('TAKEOWNERSHIP');
      await command('RESETCONF __OwningControllerProcess');
    },
    /* the SOCKS port tor picked (SocksPort auto): 0 when none */
    socksPort: async () => {
      const v = (await getInfo('net/listeners/socks')).split(' ')[0].replace(/"/g, '');
      const m = /:(\d+)$/.exec(v);
      return m ? Number(m[1]) : 0;
    },
    /* the current bootstrap phase as parseEvent's bootstrap object */
    bootstrapPhase: async () => parseEvent('STATUS_CLIENT NOTICE BOOTSTRAP ' + await getInfo('status/bootstrap-phase').then(v => v.replace(/^\S+\s+BOOTSTRAP\s+/, ''))),
    setEvents: (names) => command('SETEVENTS ' + names.join(' ')),
    /* the onion service for port 80 → 127.0.0.1:<targetPort>, with tor's 64-byte expanded key
       (base64); resolves the ServiceID (56 characters, no .onion) */
    addOnion: async (keyBase64, targetPort) => {
      if (!/^[A-Za-z0-9+/]{86}==$/.test(keyBase64)) throw new TorControlError(0, 'bad key');
      const port = Number(targetPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TorControlError(0, 'bad port');
      const r = await command('ADD_ONION ED25519-V3:' + keyBase64 + ' Flags=DiscardPK Port=80,127.0.0.1:' + port);
      const id = r.lines.find(l => l.startsWith('ServiceID='));
      if (!id) throw new TorControlError(0, 'no ServiceID');
      return id.slice('ServiceID='.length);
    },
    delOnion: (serviceId) => {
      if (!/^[a-z2-7]{56}$/.test(String(serviceId))) return Promise.reject(new TorControlError(0, 'bad service id'));
      return command('DEL_ONION ' + serviceId);
    },
    signal: (name) => {
      if (!/^[A-Z]+$/.test(String(name))) return Promise.reject(new TorControlError(0, 'bad signal'));
      return command('SIGNAL ' + name);
    },
  };
}

/* the control port's address from ControlPortWriteToFile ("PORT=127.0.0.1:9051"): {host, port} | null */
export function parseControlFile(text) {
  const m = /^PORT=(127\.0\.0\.1|\[::1\]):(\d{1,5})\s*$/m.exec(String(text || ''));
  if (!m) return null;
  const port = Number(m[2]);
  return port > 0 && port < 65536 ? { host: m[1].replace(/[[\]]/g, ''), port } : null;
}
