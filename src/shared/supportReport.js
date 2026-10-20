/*
 * Support reports, the main process side (docs/support/DESIGN.md): which logs go in, the preview the
 * user reviews, and the exact same content sealed for sending or saving. Plain ESM; every input is
 * passed in (fs, path, the sanitizer, the transport), so it runs under `node --test`
 * (tests/supportReport.test.js).
 *
 * What is collected: the app's own logs (renderer.log, main.log and their .old.log), each listed
 * wallet's epic-wallet.log and each built-in node's epic-server.log written in the last 14 days, the
 * newest first within a kind. Each contributes its tail (the last MAX_FILE_TEXT after cleaning).
 * Nothing else: no settings, no tomls, no wallet data, no contacts.
 */
import { buildBundle, tailText, MAX_FILE_TEXT, MAX_DESCRIPTION, MAX_CONTACT } from './supportBundle.js';
import { looksLikePhrase } from './logSanitize.js';

export const MAX_AGE_DAYS = 14;
//a preview stays sendable this long; after a send or save, a little longer for "Save to a file" too
export const TOKEN_TTL = 30 * 60 * 1000;
export const TOKEN_AFTER_USE = 5 * 60 * 1000;
//read a little more than is kept: cleaning makes lines shorter
const READ_BYTES = Math.round(MAX_FILE_TEXT * 1.5);
const NETS = ['main', 'floo', 'user'];

/* the last `bytes` of a file as text ('' when it can't be read) */
export function readTail(fs, file, bytes = READ_BYTES) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    let text = buf.toString('utf8');
    //started mid-line: drop the partial first line
    if (size > len) text = text.slice(text.indexOf('\n') + 1);
    return text;
  } catch (e) {
    return '';
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (e) { /* closed */ }
  }
}

function mtime(fs, file) {
  try {
    const s = fs.statSync(file);
    return s.isFile() ? s.mtimeMs : 0;
  } catch (e) {
    return 0;
  }
}

/*
 * The log files to attach, most useful first: [{name, file}]. name is what the report shows (no
 * absolute path: "app/main.log", "wallets/w1/epic-wallet.log", "node/main/epic-server.log").
 * wallets: [{id, configDir}] from settings.json.
 */
export function logFiles({ fs, path, logsDir, root, wallets = [], now = Date.now(), maxAgeDays = MAX_AGE_DAYS }) {
  const fresh = (f) => f.mtime > 0 && now - f.mtime <= maxAgeDays * 864e5;
  const app = ['renderer.log', 'main.log'].map((n) => ({ name: 'app/' + n, file: path.join(logsDir, n) }));
  const appOld = ['renderer.old.log', 'main.old.log'].map((n) => ({ name: 'app/' + n, file: path.join(logsDir, n) }));
  const seen = new Set();
  const wal = [];
  for (const w of wallets) {
    if (!w || typeof w.configDir !== 'string' || !w.configDir || seen.has(w.configDir)) continue;
    seen.add(w.configDir);
    const id = String(w.id || 'wallet').replace(/[^\w.-]/g, '_');
    wal.push({ name: 'wallets/' + id + '/epic-wallet.log', file: path.join(w.configDir, 'epic-wallet.log') });
  }
  const node = NETS.map((n) => ({ name: 'node/' + n + '/epic-server.log', file: path.join(root, 'node', n, 'epic-server.log') }));
  const stamp = (list) => list.map((f) => Object.assign(f, { mtime: mtime(fs, f.file) })).filter(fresh)
    .sort((a, b) => b.mtime - a.mtime);
  //the newest wallet and node logs right after the app's, older wallets after the archives
  const w = stamp(wal), n = stamp(node);
  return [...stamp(app), ...w.slice(0, 1), ...n.slice(0, 1), ...stamp(appOld), ...w.slice(1), ...n.slice(1)]
    .map(({ name, file }) => ({ name, file }));
}

/*
 * The support service: preview → (send | save) with a token, so what is sent is exactly what the
 * user saw. deps:
 *   fs, path, logsDir, root, wallets(): [{id, configDir}], app(): {version, …},
 *   sanitize(text, {ids, description}) → {text, counts} (ids: the report's pseudonyms; description:
 *   the user's own text, cleaned without the session-password step), publicKey,
 *   post(bytes) → {ok, id} | {ok:false, error} (only the sealed bytes leave: description, contact and
 *   logs are all inside),
 *   now(), randomToken()
 */
export function createSupport(deps) {
  const now = deps.now || Date.now;
  const tokens = new Map();

  const sweep = () => {
    for (const [k, v] of tokens) if (now() > v.expires) tokens.delete(k);
  };

  //the description is sealed with the logs; it is cleaned like them too (a pasted path or IP), and the
  //preview shows it as it will go
  const cleanDescription = (d) => deps.sanitize(String(d == null ? '' : d).trim().slice(0, MAX_DESCRIPTION), { ids: new Map(), description: true }).text;

  function preview({ attachLogs, description } = {}) {
    sweep();
    const files = [];
    const counts = {};
    //one report: the same address or IP gets the same pseudonym in every file
    const ids = new Map();
    if (attachLogs) {
      for (const f of logFiles({ fs: deps.fs, path: deps.path, logsDir: deps.logsDir, root: deps.root,
        wallets: deps.wallets(), now: now() })) {
        const raw = readTail(deps.fs, f.file);
        if (!raw.trim()) continue;
        const clean = deps.sanitize(raw, { ids });
        for (const [k, v] of Object.entries(clean.counts || {})) counts[k] = (counts[k] || 0) + v;
        files.push({ name: f.name, text: clean.text });
      }
    }
    const token = deps.randomToken();
    const app = deps.app();
    //only the newest preview can be sent: an older one is dropped (each holds a few MB)
    tokens.clear();
    tokens.set(token, { files, app, expires: now() + TOKEN_TTL });
    //what the user sees is cut exactly as it will be sealed
    const shown = files.map((f) => {
      const t = tailText(f.text);
      return { name: f.name, bytes: Buffer.byteLength(t.text), text: t.text, cut: t.cut };
    });
    return { token, app, files: shown, counts, totalBytes: shown.reduce((s, f) => s + f.bytes, 0),
      description: cleanDescription(description), phrase: looksLikePhrase(description) };
  }

  function seal(token, description, contact) {
    sweep();
    const t = tokens.get(String(token));
    if (!t) return { error: 'expired' };
    if (!String(description == null ? '' : description).trim()) return { error: 'empty' };
    //what looks like a recovery phrase is never sent, not even sealed
    if (looksLikePhrase(description)) return { error: 'phrase' };
    const d = cleanDescription(description);
    const r = buildBundle({ description: d, contact: String(contact == null ? '' : contact).slice(0, MAX_CONTACT),
      app: t.app, files: t.files }, deps.publicKey);
    t.expires = Math.min(t.expires, now() + TOKEN_AFTER_USE);
    return { bundle: r.bundle, dropped: r.dropped, description: d };
  }

  async function send({ token, description, contact } = {}) {
    const s = seal(token, description, contact);
    if (s.error) return { ok: false, error: s.error };
    try {
      const r = await deps.post(s.bundle);
      return r && r.ok ? { ok: true, id: String(r.id || ''), dropped: s.dropped } : { ok: false, error: (r && r.error) || 'server' };
    } catch (e) {
      return { ok: false, error: 'offline' };
    }
  }

  async function save({ token, description, contact } = {}, write) {
    const s = seal(token, description, contact);
    if (s.error) return { ok: false, error: s.error };
    return write(s.bundle);
  }

  return { preview, send, save, tokens };
}

/* the intake's answer → {ok, id} | {ok:false, error} (docs/support/DESIGN.md) */
export function intakeResult(status, body) {
  let j = {};
  try { j = typeof body === 'string' ? JSON.parse(body) : (body || {}); } catch (e) { j = {}; }
  if (status === 200 && j.ok) return { ok: true, id: String(j.id || '').slice(0, 40) };
  if (status === 413) return { ok: false, error: 'too-big' };
  if (status === 429) return { ok: false, error: 'rate' };
  return { ok: false, error: 'server' };
}
