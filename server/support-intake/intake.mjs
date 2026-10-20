#!/usr/bin/env node
/*
 * Epic GUI Wallet support intake (docs/SUPPORT.md). A small HTTP service on 127.0.0.1 behind nginx
 * (support.btlabs.co.uk). It takes sealed report bundles and nothing readable, stores each one for the
 * developer, and asks the feedback bot to DM the developer the report's id, time, size and app version.
 * Node built-ins only (Node ≥ 20). `node intake.mjs` runs it with the settings below from the environment.
 *
 *   POST /v1/report   {"v": 2, "bundle": "<base64 .epicsupport>", "app": "6.1.6"}   (app optional)
 *     200 {"ok":true,"id":"<8 chars a-z2-7>"} | 400 bad-request | 413 too-big | 429 rate | 503 full
 *   GET  /health      200 {"ok":true}
 *
 * Stored in DATA_DIR (mode 700): <id>.bundle (mode 600, the sealed bytes as received) and index.jsonl, one
 * line per report {id, received, size, app, keyId}. Bundles older than RETENTION_DAYS are deleted (the
 * index line stays, marked expired). No client IP is written anywhere: the abuse limiter keeps salted
 * hashes in memory only, with a salt that changes every day.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MAGIC = Buffer.from('EPICSUP1', 'ascii');
const MiB = 1024 * 1024;

export const DEFAULTS = Object.freeze({
  host: '127.0.0.1',
  port: 8795,
  dataDir: '/srv/epic-support/reports',
  keyIds: ['d9749febd701c2fe'],
  maxBody: 3 * MiB,
  maxBundle: 2 * MiB,
  perClient10Min: 3,
  perClientDay: 10,
  bad10Min: 20,
  globalDay: 200,
  maxStoreMB: 500,
  retentionDays: 30,
  readTimeoutMs: 30000,
  notifyUrl: '',
  notifyToken: '',
  //behind nginx on loopback: X-Real-IP is nginx's $remote_addr; never trusted from anyone else
  trustProxy: true,
});

/* settings from the environment (docs/SUPPORT.md) */
export function settingsFromEnv(env = process.env) {
  const num = (k, d) => (env[k] !== undefined && env[k] !== '' && Number.isFinite(Number(env[k])) ? Number(env[k]) : d);
  let notifyToken = '';
  if (env.SUPPORT_NOTIFY_TOKEN_FILE) {
    try { notifyToken = fs.readFileSync(env.SUPPORT_NOTIFY_TOKEN_FILE, 'utf8').trim(); } catch (e) { notifyToken = ''; }
  }
  return {
    ...DEFAULTS,
    host: env.SUPPORT_HOST || DEFAULTS.host,
    port: num('SUPPORT_PORT', DEFAULTS.port),
    dataDir: env.SUPPORT_DATA_DIR || DEFAULTS.dataDir,
    keyIds: env.SUPPORT_KEY_IDS ? env.SUPPORT_KEY_IDS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : DEFAULTS.keyIds,
    perClient10Min: num('SUPPORT_PER_CLIENT_10MIN', DEFAULTS.perClient10Min),
    perClientDay: num('SUPPORT_PER_CLIENT_DAY', DEFAULTS.perClientDay),
    bad10Min: num('SUPPORT_BAD_10MIN', DEFAULTS.bad10Min),
    globalDay: num('SUPPORT_GLOBAL_DAY', DEFAULTS.globalDay),
    maxStoreMB: num('SUPPORT_MAX_STORE_MB', DEFAULTS.maxStoreMB),
    retentionDays: num('SUPPORT_RETENTION_DAYS', DEFAULTS.retentionDays),
    notifyUrl: env.SUPPORT_NOTIFY_URL || '',
    notifyToken,
  };
}

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const newId = () => Array.from(crypto.randomBytes(8), (b) => B32[b & 31]).join('');
const ID_RE = /^[a-z2-7]{8}$/;
const APP_RE = /^[0-9A-Za-z.+-]{1,24}$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/* a sliding count of events per key in a window (in memory) */
function windowCounter(ms) {
  const m = new Map();
  const prune = (now) => { for (const [k, list] of m) { const keep = list.filter((t) => now - t < ms); if (keep.length) m.set(k, keep); else m.delete(k); } };
  return {
    count(k, now) { return (m.get(k) || []).filter((t) => now - t < ms).length; },
    add(k, now) { const l = m.get(k) || []; l.push(now); m.set(k, l); },
    take(k) { const l = m.get(k); if (l && l.length) l.pop(); },
    prune,
  };
}

/*
 * The intake. opts: DEFAULTS overrides plus now() and notify(meta) for tests.
 * → {server, sweep(), index()}
 */
export function createIntake(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const now = o.now || Date.now;
  fs.mkdirSync(o.dataDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(o.dataDir, 0o700);
  const indexFile = path.join(o.dataDir, 'index.jsonl');

  //what is stored: size per id (for the quota), from the index
  const stored = new Map();
  try {
    for (const line of fs.readFileSync(indexFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); if (e && ID_RE.test(e.id) && !e.expired) stored.set(e.id, e.size || 0); } catch (e) { /* a broken line */ }
    }
  } catch (e) { /* no index yet */ }
  const usedBytes = () => [...stored.values()].reduce((a, b) => a + b, 0);

  let salt = crypto.randomBytes(16), saltDay = new Date(now()).toISOString().slice(0, 10);
  const client = (req) => {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (day !== saltDay) { salt = crypto.randomBytes(16); saltDay = day; }
    const ip = (o.trustProxy && typeof req.headers['x-real-ip'] === 'string' && req.headers['x-real-ip']) || req.socket.remoteAddress || '';
    return crypto.createHash('sha256').update(salt).update(String(ip)).digest('base64').slice(0, 16);
  };
  const c10 = windowCounter(10 * 60e3), cDay = windowCounter(24 * 3600e3), bad = windowCounter(10 * 60e3), global = windowCounter(24 * 3600e3);
  setInterval(() => { const t = now(); for (const c of [c10, cDay, bad, global]) c.prune(t); }, 60e3).unref();

  const log = o.log || ((m) => console.log(new Date(now()).toISOString() + ' ' + m));
  const notify = o.notify || (async (meta) => {
    if (!o.notifyUrl || !o.notifyToken) return;
    const res = await fetch(o.notifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + o.notifyToken },
      body: JSON.stringify(meta), redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('notify HTTP ' + res.status);
  });

  function answer(res, status, body, extra = {}) {
    if (res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
    res.end(JSON.stringify(body));
  }
  const refuse = (res, status, error, extra) => answer(res, status, { ok: false, error }, extra);

  function store(bytes, app) {
    let id;
    do { id = newId(); } while (stored.has(id) || fs.existsSync(path.join(o.dataDir, id + '.bundle')));
    const file = path.join(o.dataDir, id + '.bundle');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, bytes, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
    const entry = { id, received: new Date(now()).toISOString(), size: bytes.length, app: app || '', keyId: bytes.subarray(8, 16).toString('hex') };
    fs.appendFileSync(indexFile, JSON.stringify(entry) + '\n', { mode: 0o600 });
    stored.set(id, bytes.length);
    return entry;
  }

  const server = http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0];
    if (url === '/health' && req.method === 'GET') return answer(res, 200, { ok: true });
    if (url !== '/v1/report') return refuse(res, 404, 'not-found');
    if (req.method !== 'POST') return refuse(res, 405, 'method', { Allow: 'POST' });
    const t = now();
    const who = client(req);
    const badReq = (status, error) => { c10.take(who); cDay.take(who); global.take('all'); bad.add(who, t); refuse(res, status, error); };
    if (bad.count(who, t) >= o.bad10Min) return refuse(res, 429, 'rate', { 'Retry-After': '600' });
    if (c10.count(who, t) >= o.perClient10Min) return refuse(res, 429, 'rate', { 'Retry-After': '600' });
    if (cDay.count(who, t) >= o.perClientDay) return refuse(res, 429, 'rate', { 'Retry-After': '3600' });
    if (global.count('all', t) >= o.globalDay) return refuse(res, 429, 'rate', { 'Retry-After': '3600' });
    //counted before the body is read: parallel requests of one client can't all pass
    c10.add(who, t); cDay.add(who, t); global.add('all', t);
    if (!/^application\/json(\s*;.*)?$/i.test(String(req.headers['content-type'] || ''))) { req.resume(); return badReq(400, 'bad-request'); }
    const len = Number(req.headers['content-length']);
    if (Number.isFinite(len) && len > o.maxBody) { req.resume(); return badReq(413, 'too-big'); }
    const chunks = [];
    let size = 0, done = false;
    const timer = setTimeout(() => { if (!done) { done = true; badReq(400, 'bad-request'); req.destroy(); } }, o.readTimeoutMs);
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > o.maxBody) { done = true; clearTimeout(timer); badReq(413, 'too-big'); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('error', () => { done = true; clearTimeout(timer); });
    req.on('end', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return badReq(400, 'bad-request'); }
      const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort().join() : '';
      if (!(keys === 'bundle,v' || keys === 'app,bundle,v') || body.v !== 2 || typeof body.bundle !== 'string') return badReq(400, 'bad-request');
      if (body.app !== undefined && (typeof body.app !== 'string' || !APP_RE.test(body.app))) return badReq(400, 'bad-request');
      if (body.bundle.length % 4 !== 0 || !B64_RE.test(body.bundle)) return badReq(400, 'bad-request');
      const bytes = Buffer.from(body.bundle, 'base64');
      if (bytes.length > o.maxBundle) return badReq(413, 'too-big');
      if (bytes.length < 16 + 32 + 12 + 16 || !bytes.subarray(0, 8).equals(MAGIC) || !o.keyIds.includes(bytes.subarray(8, 16).toString('hex'))) return badReq(400, 'bad-request');
      if (usedBytes() + bytes.length > o.maxStoreMB * MiB) { c10.take(who); cDay.take(who); global.take('all'); log('refused: store full'); return refuse(res, 503, 'full'); }
      let entry;
      try { entry = store(bytes, body.app); } catch (e) { log('store failed: ' + e.message); return refuse(res, 503, 'full'); }
      log('report ' + entry.id + ' stored, ' + entry.size + ' bytes, app ' + (entry.app || '?'));
      answer(res, 200, { ok: true, id: entry.id });
      Promise.resolve().then(() => notify({ id: entry.id, received: entry.received, size: entry.size, ...(entry.app ? { app: entry.app } : {}) }))
        .then(() => log('report ' + entry.id + ' notified'), (e) => log('report ' + entry.id + ' not notified: ' + e.message));
    });
  });
  server.requestTimeout = o.readTimeoutMs + 5000;
  server.headersTimeout = 10000;

  /* delete bundles older than the retention; their index lines stay, marked expired */
  function sweep() {
    if (!(o.retentionDays > 0)) return 0;
    const limit = now() - o.retentionDays * 864e5;
    let lines = [];
    try { lines = fs.readFileSync(indexFile, 'utf8').split('\n').filter((l) => l.trim()); } catch (e) { return 0; }
    let n = 0;
    const out = lines.map((l) => {
      let e;
      try { e = JSON.parse(l); } catch (x) { return l; }
      if (!e || e.expired || !ID_RE.test(e.id) || Date.parse(e.received) > limit) return l;
      try { fs.unlinkSync(path.join(o.dataDir, e.id + '.bundle')); } catch (x) { /* already gone */ }
      stored.delete(e.id);
      n++;
      return JSON.stringify({ ...e, expired: new Date(now()).toISOString() });
    });
    if (n) {
      fs.writeFileSync(indexFile + '.tmp', out.join('\n') + '\n', { mode: 0o600 });
      fs.renameSync(indexFile + '.tmp', indexFile);
      log('retention: ' + n + ' bundle(s) older than ' + o.retentionDays + ' days deleted');
    }
    return n;
  }

  return { server, sweep, settings: o };
}

//run as a service
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const s = settingsFromEnv();
  const { server, sweep } = createIntake(s);
  sweep();
  setInterval(sweep, 3600e3).unref();
  server.listen(s.port, s.host, () => console.log('support intake on http://' + s.host + ':' + s.port + '/v1/report, data in ' + s.dataDir
    + ', notify ' + (s.notifyUrl && s.notifyToken ? 'on' : 'OFF')));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
}
