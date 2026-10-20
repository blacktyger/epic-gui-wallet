'use strict';
// The support intake service (server/support-intake/intake.mjs): sealed bundles only, caps, rate limits,
// storage and the developer ping. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createIntake } from '../server/support-intake/intake.mjs';
import { buildBundle } from '../src/shared/supportBundle.js';
import { SUPPORT_PUBLIC_KEY } from '../src/shared/supportKey.js';

const bundle = buildBundle({ description: 'secret words', contact: 'me@example.org', files: [{ name: 'app/main.log', text: 'line\n' }] }, SUPPORT_PUBLIC_KEY).bundle;

async function start(extra = {}) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'intake-'));
  const pings = [], logs = [];
  let clock = Date.parse('2026-10-20T12:00:00Z');
  const intake = createIntake({ dataDir: path.join(dir, 'reports'), port: 0, now: () => clock, log: (m) => logs.push(m),
    notify: async (meta) => { pings.push(meta); }, ...extra });
  await new Promise((r) => intake.server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + intake.server.address().port;
  const post = (body, { ip = '203.0.113.7', type = 'application/json', method = 'POST', p = '/v1/report' } = {}) =>
    fetch(url + p, { method, headers: { 'Content-Type': type, 'X-Real-IP': ip }, body: method === 'GET' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), headers: r.headers }));
  return { intake, url, post, pings, logs, dir: path.join(dir, 'reports'), tick: (ms) => { clock += ms; },
    done: () => new Promise((r) => intake.server.close(() => { fs.rmSync(dir, { recursive: true, force: true }); r(); })) };
}
const good = (app) => ({ v: 2, bundle: bundle.toString('base64'), ...(app ? { app } : {}) });

test('a sealed bundle is stored owner-only with an index line; the developer is pinged with metadata only', async () => {
  const s = await start();
  try {
    const r = await s.post(good('6.1.6'));
    assert.equal(r.status, 200);
    assert.match(r.body.id, /^[a-z2-7]{8}$/);
    const file = path.join(s.dir, r.body.id + '.bundle');
    assert.deepEqual(fs.readFileSync(file), bundle);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(s.dir).mode & 0o777, 0o700);
    const idx = fs.readFileSync(path.join(s.dir, 'index.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(idx, [{ id: r.body.id, received: '2026-10-20T12:00:00.000Z', size: bundle.length, app: '6.1.6', keyId: 'd9749febd701c2fe' }]);
    await new Promise((res) => setTimeout(res, 20));
    assert.deepEqual(s.pings, [{ id: r.body.id, received: '2026-10-20T12:00:00.000Z', size: bundle.length, app: '6.1.6' }]);
    //nothing readable and no IP anywhere
    const all = s.logs.join('\n') + fs.readFileSync(path.join(s.dir, 'index.jsonl'), 'utf8');
    assert.doesNotMatch(all, /203\.0\.113\.7|secret words|me@example/);
  } finally { await s.done(); }
});

test('refused: other fields, v1, bad base64, wrong magic or key, wrong type, method or path', async () => {
  const s = await start({ perClient10Min: 100, perClientDay: 100, bad10Min: 100 });
  try {
    const b64 = bundle.toString('base64');
    const forged = Buffer.from(bundle); forged.write('00000000', 8, 'hex');
    const notMagic = Buffer.from(bundle); notMagic.write('EPICSUP2', 0, 'ascii');
    for (const [body, why] of [
      [{ v: 2, bundle: b64, description: 'hi' }, 'a description'], [{ v: 1, bundle: b64 }, 'v1'], [{ v: 2 }, 'no bundle'],
      [{ v: 2, bundle: b64, app: 'x y' }, 'bad app'], [{ v: 2, bundle: '!!!!' }, 'bad base64'], [{ v: 2, bundle: forged.toString('base64') }, 'unknown key'],
      [{ v: 2, bundle: notMagic.toString('base64') }, 'magic'], ['not json', 'not json'], [[1, 2], 'an array'],
    ]) assert.equal((await s.post(body)).status, 400, why);
    assert.equal((await s.post(good(), { type: 'text/plain' })).status, 400);
    assert.equal((await s.post(null, { method: 'GET' })).status, 405);
    assert.equal((await s.post(good(), { p: '/v1/other' })).status, 404);
    assert.equal((await s.post(null, { method: 'GET', p: '/health' })).status, 200);
    assert.equal(fs.readdirSync(s.dir).filter((f) => f.endsWith('.bundle')).length, 0);
    assert.equal(s.pings.length, 0);
  } finally { await s.done(); }
});

test('size caps: by Content-Length, while streaming, and the decoded bundle', async () => {
  const s = await start({ perClient10Min: 100, perClientDay: 100, bad10Min: 100, maxBody: 4096, maxBundle: 1024 });
  try {
    assert.equal((await s.post({ v: 2, bundle: 'A'.repeat(8000) })).status, 413);
    //no Content-Length: counted as it streams
    const big = await new Promise((resolve) => {
      const req = require_http().request(s.url + '/v1/report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, (res) => resolve(res.statusCode));
      req.on('error', () => resolve(413));
      for (let i = 0; i < 10; i++) req.write('A'.repeat(1000));
      req.end();
    });
    assert.equal(big, 413);
    const b = Buffer.concat([bundle, Buffer.alloc(1500)]);
    assert.equal((await s.post({ v: 2, bundle: b.toString('base64') })).status, 413);
  } finally { await s.done(); }
});

test('rate limits per client (in memory, no IP stored), bad requests and the daily cap', async () => {
  const s = await start({ globalDay: 5 });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await s.post(good())).status, 200);
    const r = await s.post(good());
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    //another client is not limited by the first
    assert.equal((await s.post(good(), { ip: '198.51.100.9' })).status, 200);
    s.tick(11 * 60e3);
    assert.equal((await s.post(good())).status, 200);
    //the daily cap for everyone (5)
    assert.equal((await s.post(good(), { ip: '192.0.2.44' })).status, 429);
    //a refused bad request does not use up a report slot, but bad ones are limited too
    const t = await start({ bad10Min: 3 });
    try {
      for (let i = 0; i < 3; i++) assert.equal((await t.post({ v: 1 })).status, 400);
      assert.equal((await t.post(good())).status, 429);
      assert.equal((await t.post(good(), { ip: '198.51.100.1' })).status, 200);
    } finally { await t.done(); }
  } finally { await s.done(); }
});

test('parallel requests of one client cannot pass the per-client limit', async () => {
  const s = await start();
  try {
    const all = await Promise.all(Array.from({ length: 6 }, () => s.post(good())));
    assert.equal(all.filter((r) => r.status === 200).length, 3);
  } finally { await s.done(); }
});

test('store quota: 503 when full; retention deletes old bundles and marks the index', async () => {
  const s = await start({ maxStoreMB: bundle.length * 1.5 / (1024 * 1024) });
  try {
    const a = await s.post(good());
    assert.equal(a.status, 200);
    assert.equal((await s.post(good(), { ip: '198.51.100.2' })).status, 503);
    s.tick(31 * 864e5);
    assert.equal(s.intake.sweep(), 1);
    assert.ok(!fs.existsSync(path.join(s.dir, a.body.id + '.bundle')));
    const idx = JSON.parse(fs.readFileSync(path.join(s.dir, 'index.jsonl'), 'utf8').trim());
    assert.equal(idx.id, a.body.id);
    assert.ok(idx.expired);
    //room again
    assert.equal((await s.post(good(), { ip: '198.51.100.3' })).status, 200);
  } finally { await s.done(); }
});

test('a failed ping does not fail the report', async () => {
  const s = await start({ notify: async () => { throw new Error('down'); } });
  try {
    assert.equal((await s.post(good())).status, 200);
    await new Promise((res) => setTimeout(res, 20));
    assert.ok(s.logs.some((l) => /not notified: down/.test(l)));
  } finally { await s.done(); }
});

import { createRequire } from 'node:module';
function require_http() { return createRequire(import.meta.url)('node:http'); }
