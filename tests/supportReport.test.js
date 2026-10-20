'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logFiles, readTail, createSupport, intakeResult, TOKEN_TTL } from '../src/shared/supportReport.js';
import { generateKeyPair, openBundle, MAX_FILE_TEXT } from '../src/shared/supportBundle.js';

const dev = generateKeyPair();

function scratch() {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'support-'));
  const put = (rel, text, ageDays = 0) => {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    const t = (Date.now() - ageDays * 864e5) / 1000;
    fs.utimesSync(f, t, t);
    return f;
  };
  return { root, put, done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('logFiles: app logs first, then the newest wallet and node log, archives, older ones; nothing stale', () => {
  const s = scratch();
  try {
    s.put('logs/main.log', 'm');
    s.put('logs/renderer.log', 'r');
    s.put('logs/main.old.log', 'mo', 1);
    s.put('logs/2026_10_1.log', 'old daily file: not attached');
    s.put('wallets/w1/epic-wallet.log', 'w1', 2);
    s.put('wallets/w2/epic-wallet.log', 'w2', 0.5);
    s.put('wallets/w3/epic-wallet.log', 'w3', 30);
    s.put('wallets/w1/epic-wallet.toml', 'not a log');
    s.put('node/main/epic-server.log', 'n', 1);
    s.put('node/floo/epic-server.log', 'f', 3);
    const wallets = ['w1', 'w2', 'w3', 'w4'].map((id) => ({ id, configDir: path.join(s.root, 'wallets', id) }));
    wallets.push({ id: '../evil', configDir: path.join(s.root, 'wallets', 'w1') }, null, { id: 'x' });
    const names = logFiles({ fs, path, logsDir: path.join(s.root, 'logs'), root: s.root, wallets }).map((f) => f.name);
    assert.deepEqual(names, ['app/renderer.log', 'app/main.log', 'wallets/w2/epic-wallet.log', 'node/main/epic-server.log',
      'app/main.old.log', 'wallets/w1/epic-wallet.log', 'node/floo/epic-server.log']);
  } finally { s.done(); }
});

test('readTail: the end of a long file from a line start; a missing file is empty', () => {
  const s = scratch();
  try {
    const f = s.put('logs/main.log', Array.from({ length: 5000 }, (_, i) => 'line ' + i).join('\n') + '\n');
    const t = readTail(fs, f, 100);
    assert.ok(t.startsWith('line '));
    assert.ok(t.endsWith('line 4999\n'));
    assert.ok(t.length <= 100);
    assert.equal(readTail(fs, path.join(s.root, 'nope')), '');
  } finally { s.done(); }
});

function service(s, extra = {}) {
  let n = 0, clock = Date.parse('2026-10-20T12:00:00Z');
  const posted = [];
  const svc = createSupport(Object.assign({
    fs, path, logsDir: path.join(s.root, 'logs'), root: s.root,
    wallets: () => [{ id: 'w1', configDir: path.join(s.root, 'wallets', 'w1') }],
    app: () => ({ version: '6.1.6', platform: 'linux' }),
    sanitize: (t) => ({ text: t.replace(/\/home\/jan/g, '~'), counts: { paths: (t.match(/\/home\/jan/g) || []).length } }),
    publicKey: dev.publicKey,
    post: async (bytes, description) => { posted.push({ bytes, description }); return { ok: true, id: '51' }; },
    now: () => clock,
    randomToken: () => 'tok' + (++n),
  }, extra));
  return { svc, posted, tick: (ms) => { clock += ms; } };
}

test('preview → send: the sealed report holds exactly the previewed, cleaned logs', async () => {
  const s = scratch();
  try {
    s.put('logs/main.log', 'started in /home/jan/.epic-gui\n');
    s.put('wallets/w1/epic-wallet.log', 'wallet line\n');
    const { svc, posted } = service(s);
    const p = svc.preview({ attachLogs: true });
    assert.deepEqual(p.files.map((f) => f.name), ['app/main.log', 'wallets/w1/epic-wallet.log']);
    assert.equal(p.files[0].text, 'started in ~/.epic-gui\n');
    assert.equal(p.counts.paths, 1);
    const r = await svc.send({ token: p.token, description: '  No connection  ', contact: '@jan' });
    assert.deepEqual(r, { ok: true, id: '51', dropped: [] });
    assert.equal(posted[0].description, 'No connection');
    const report = openBundle(posted[0].bytes, dev.privatePem);
    assert.equal(report.description, 'No connection');
    assert.equal(report.contact, '@jan');
    assert.deepEqual(report.app, { version: '6.1.6', platform: 'linux' });
    assert.deepEqual(report.files.map((f) => [f.name, f.text]), p.files.map((f) => [f.name, f.text]));
    assert.ok(!posted[0].bytes.includes(Buffer.from('/home/jan')));
    //the description is posted readable: cleaned like the logs, and the preview shows it so
    const q = svc.preview({ description: ' logs in /home/jan/.epic-gui ' });
    assert.equal(q.description, 'logs in ~/.epic-gui');
    await svc.send({ token: q.token, description: ' logs in /home/jan/.epic-gui ' });
    assert.equal(posted[1].description, 'logs in ~/.epic-gui');
    assert.equal(openBundle(posted[1].bytes, dev.privatePem).description, 'logs in ~/.epic-gui');
  } finally { s.done(); }
});

test('no logs when the box is unticked; empty description refused; tokens expire', async () => {
  const s = scratch();
  try {
    s.put('logs/main.log', 'x\n');
    const { svc, posted, tick } = service(s);
    const p = svc.preview({ attachLogs: false });
    assert.deepEqual(p.files, []);
    assert.deepEqual(await svc.send({ token: p.token, description: '   ' }), { ok: false, error: 'empty' });
    assert.deepEqual(await svc.send({ token: 'forged', description: 'x' }), { ok: false, error: 'expired' });
    const r = await svc.send({ token: p.token, description: 'x' });
    assert.equal(openBundle(posted[0].bytes, dev.privatePem).files.length, 0);
    assert.ok(r.ok);
    //after a send the same preview can still be saved for a few minutes, then not
    tick(4 * 60 * 1000);
    let saved = null;
    assert.deepEqual(await svc.save({ token: p.token, description: 'x' }, async (b) => { saved = b; return { ok: true, path: 'f' }; }), { ok: true, path: 'f' });
    assert.ok(Buffer.isBuffer(saved));
    tick(2 * 60 * 1000);
    assert.deepEqual(await svc.send({ token: p.token, description: 'x' }), { ok: false, error: 'expired' });
    const q = svc.preview({});
    tick(TOKEN_TTL + 1);
    assert.deepEqual(await svc.send({ token: q.token, description: 'x' }), { ok: false, error: 'expired' });
    assert.equal(svc.tokens.size, 0);
  } finally { s.done(); }
});

test('send errors: transport failure is offline; the intake answers map to the UI codes', async () => {
  const s = scratch();
  try {
    const { svc } = service(s, { post: async () => { throw new Error('ENOTFOUND'); } });
    const p = svc.preview({});
    assert.deepEqual(await svc.send({ token: p.token, description: 'x' }), { ok: false, error: 'offline' });
    assert.deepEqual(intakeResult(200, '{"ok":true,"id":"52"}'), { ok: true, id: '52' });
    assert.deepEqual(intakeResult(413, ''), { ok: false, error: 'too-big' });
    assert.deepEqual(intakeResult(429, '{"ok":false}'), { ok: false, error: 'rate' });
    assert.deepEqual(intakeResult(200, 'not json'), { ok: false, error: 'server' });
    assert.deepEqual(intakeResult(502, '<html>'), { ok: false, error: 'server' });
  } finally { s.done(); }
});

test('a huge log is attached as its tail only', () => {
  const s = scratch();
  try {
    s.put('logs/main.log', 'x'.repeat(100) + '\n'.repeat(1) + ('y'.repeat(99) + '\n').repeat(20000));
    const { svc } = service(s);
    const p = svc.preview({ attachLogs: true });
    assert.ok(p.files[0].cut);
    assert.ok(p.files[0].bytes <= MAX_FILE_TEXT + 40);
  } finally { s.done(); }
});

test('a description that looks like a recovery phrase is never sent or saved; only the newest preview counts', async () => {
  const s = scratch();
  try {
    const { svc, posted } = service(s);
    const phrase = 'my words: Abandon ability able about above absent absorb abstract absurd abuse access accident';
    const p = svc.preview({ description: phrase });
    assert.equal(p.phrase, true);
    assert.deepEqual(await svc.send({ token: p.token, description: phrase }), { ok: false, error: 'phrase' });
    let wrote = false;
    assert.deepEqual(await svc.save({ token: p.token, description: phrase }, async () => { wrote = true; return { ok: true }; }), { ok: false, error: 'phrase' });
    assert.equal(wrote, false);
    assert.equal(posted.length, 0);
    assert.equal(svc.preview({ description: 'The node does not sync since yesterday' }).phrase, false);
    //a new preview drops the older one
    const a = svc.preview({});
    const b = svc.preview({});
    assert.deepEqual(await svc.send({ token: a.token, description: 'x' }), { ok: false, error: 'expired' });
    assert.ok((await svc.send({ token: b.token, description: 'x' })).ok);
  } finally { s.done(); }
});

test('the intake URL: built in, or a local override; an https override only in a development build', async () => {
  const { supportUrl, SUPPORT_URL } = await import('../src/shared/supportKey.js');
  assert.equal(supportUrl({}), SUPPORT_URL);
  assert.equal(supportUrl({ EPIC_SUPPORT_URL: 'http://127.0.0.1:18447/v1/report' }), 'http://127.0.0.1:18447/v1/report');
  assert.equal(supportUrl({ EPIC_SUPPORT_URL: 'https://evil.example/v1/report' }), SUPPORT_URL);
  assert.equal(supportUrl({ EPIC_SUPPORT_URL: 'https://staging.example/v1/report' }, { packaged: false }), 'https://staging.example/v1/report');
  assert.equal(supportUrl({ EPIC_SUPPORT_URL: 'http://evil.example/' }, { packaged: false }), SUPPORT_URL);
  assert.equal(supportUrl({ EPIC_SUPPORT_URL: 'not a url' }), SUPPORT_URL);
});
