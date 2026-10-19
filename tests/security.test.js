// Tests for src/shared/security.js and src/shared/nodeFetch.js: run with `npm test` (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { httpUrl, isWalletApiUrl, isInside, createScopedFs, nodeRequest, contentSecurityPolicy, isAppUrl } from '../src/shared/security.js';
import { bridgedFetch } from '../src/shared/nodeFetch.js';

test('httpUrl: http(s) with a host only, no user:password@', () => {
  assert.equal(httpUrl('https://explorer.epic.tech/blockdetail/12'), 'https://explorer.epic.tech/blockdetail/12');
  assert.equal(httpUrl('http://status.btlabs.uk'), 'http://status.btlabs.uk/');
  for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'smb://host/share', 'https://u:p@host/', '/etc/passwd',
    'C:\\Windows\\system32\\calc.exe', '', null, 42, 'ms-settings:', 'https://' + 'a'.repeat(2100)]) {
    assert.equal(httpUrl(bad), '', String(bad));
  }
});

test('isWalletApiUrl: the owner and foreign API on 127.0.0.1:3420 only', () => {
  assert.ok(isWalletApiUrl('http://127.0.0.1:3420/v3/owner'));
  assert.ok(isWalletApiUrl('http://127.0.0.1:3420/v2/foreign'));
  for (const bad of ['https://node.epiccash.com:3413/v3/owner', 'http://127.0.0.1:3413/v2/owner', 'http://localhost:3420/v3/owner',
    'http://127.0.0.1:3420/v1/status', 'http://evil.example/v3/owner', '']) {
    assert.equal(isWalletApiUrl(bad), false, bad);
  }
});

test('isInside: by path, .. resolved, Windows in any case', () => {
  assert.ok(isInside('/home/u/.epic-gui/wallets/w1', '/home/u/.epic-gui', path.posix));
  assert.ok(isInside('/home/u/.epic-gui', '/home/u/.epic-gui', path.posix));
  assert.equal(isInside('/home/u/.epic-gui/../.ssh/id_rsa', '/home/u/.epic-gui', path.posix), false);
  assert.equal(isInside('/home/u/.epic-gui-other', '/home/u/.epic-gui', path.posix), false);
  assert.ok(isInside('c:\\users\\u\\.EPIC-GUI\\settings.json', 'C:\\Users\\u\\.epic-gui', path.win32));
  assert.equal(isInside('D:\\x', 'C:\\Users\\u\\.epic-gui', path.win32), false);
  assert.equal(isInside('/a/b\0', '/a', path.posix), false);
});

function fakeFs() {
  const calls = [];
  const fs = new Proxy({}, { get: (t, op) => (...args) => { calls.push([op, ...args]); return op === 'existsSync' ? true : 'ok'; } });
  return { fs, calls };
}

test('scoped fs: writes in the app folders, reads also in resources, refuses the rest', () => {
  const { fs, calls } = fakeFs();
  const write = ['/home/u/.epic-gui'];
  const read = ['/opt/app/resources'];
  const sfs = createScopedFs({ fs, pathMod: path.posix, dirs: () => ({ read, write }) });
  assert.equal(sfs.writeFileSync('/home/u/.epic-gui/settings.json', '{}'), 'ok');
  assert.equal(sfs.readFileSync('/opt/app/resources/epic-wallet.toml', 'utf8'), 'ok');
  assert.equal(sfs.copyFileSync('/opt/app/resources/foundation.json', '/home/u/.epic-gui/node/main/foundation.json'), 'ok');
  assert.throws(() => sfs.writeFileSync('/opt/app/resources/x', ''), { code: 'EACCES' });
  assert.throws(() => sfs.readFileSync('/home/u/.ssh/id_rsa'), { code: 'EACCES' });
  assert.throws(() => sfs.readdirSync('/home/u'), { code: 'EACCES' });
  assert.throws(() => sfs.rmSync('/home/u/.epic-gui/../Documents', { recursive: true }), { code: 'EACCES' });
  assert.throws(() => sfs.renameSync('/home/u/.epic-gui/a', '/home/u/.bashrc'), { code: 'EACCES' });
  assert.throws(() => sfs.writeFileSync(3, 'fd'), { code: 'EACCES' });
  //a yes/no anywhere
  assert.equal(sfs.existsSync('/media/usb/wallet_data/wallet.seed'), true);
  //a folder picked later is allowed from then on
  write.push('/media/usb/new-root');
  assert.equal(sfs.mkdirSync('/media/usb/new-root', { recursive: true }), 'ok');
  assert.deepEqual(calls.map(c => c[0]), ['writeFileSync', 'readFileSync', 'copyFileSync', 'existsSync', 'mkdirSync']);
});

test('scoped fs: only the sync calls the app uses', () => {
  const sfs = createScopedFs({ fs: fakeFs().fs, pathMod: path.posix, dirs: () => ({ read: [], write: [] }) });
  for (const op of ['symlinkSync', 'chmodSync', 'openSync', 'createWriteStream', 'readFile', 'cpSync', 'appendFileSync']) {
    assert.equal(sfs[op], undefined, op);
  }
});

test('nodeRequest: node API paths, GET/POST, Authorization to this machine only', () => {
  const r = nodeRequest({ url: 'https://node.epiccash.com:3413/v1/status', headers: { Authorization: 'Basic x', 'Content-Type': 'application/json', Cookie: 'a' }, redirect: 'manual' });
  assert.deepEqual(r.headers, { 'Content-Type': 'application/json' });
  assert.equal(r.method, 'GET');
  assert.equal(r.redirect, 'manual');
  const local = nodeRequest({ url: 'http://127.0.0.1:3413/v2/owner', method: 'post', headers: { authorization: 'Basic x' }, body: '{}' });
  assert.deepEqual(local.headers, { Authorization: 'Basic x' });
  assert.equal(local.method, 'POST');
  assert.equal(local.body, '{}');
  for (const bad of [{ url: 'file:///etc/passwd' }, { url: 'https://evil.example/upload' }, { url: 'https://n:3413/v1/status?x=1' },
    { url: 'https://n:3413/v2/foreign', method: 'PUT' }, { url: 'https://n:3413/v2/foreign', method: 'POST', body: 'x'.repeat(5000) }, null]) {
    assert.ok(nodeRequest(bad).error, JSON.stringify(bad));
  }
});

test('CSP: the app only, the wallet API on this machine, no eval outside development', () => {
  const p = contentSecurityPolicy();
  assert.match(p, /script-src 'self'(;|$)/);
  assert.doesNotMatch(p, /unsafe-eval/);
  assert.match(p, /connect-src 'self' http:\/\/127\.0\.0\.1:3420(;|$)/);
  assert.match(p, /object-src 'none'/);
  const d = contentSecurityPolicy({ dev: true, devServer: 'http://localhost:8080' });
  assert.match(d, /'unsafe-eval'/);
  assert.match(d, /ws:\/\/\*:8080/);
});

test('isAppUrl: app:// and the dev server only', () => {
  assert.ok(isAppUrl('app://./index.html'));
  assert.ok(isAppUrl('http://localhost:8080/#/x', 'http://localhost:8080/'));
  assert.equal(isAppUrl('https://justboil.me'), false);
  assert.equal(isAppUrl('http://localhost:8081/', 'http://localhost:8080/'), false);
  assert.equal(isAppUrl('file:///etc/passwd'), false);
});

test('bridgedFetch: a Response-like reply, errors and aborts like fetch', async () => {
  const sent = [];
  const f = bridgedFetch(async (req) => { sent.push(req); return req.url.endsWith('/v1/status') ? { status: 401, text: '' } : { status: 200, text: '{"a":1}' }; });
  const ok = await f('https://n/v1/version', { method: 'GET', redirect: 'manual' });
  assert.equal(ok.ok, true);
  assert.deepEqual(await ok.json(), { a: 1 });
  const denied = await f('https://n/v1/status');
  assert.equal(denied.status, 401);
  assert.equal(denied.ok, false);
  assert.equal(sent[0].redirect, 'manual');

  const redirect = await bridgedFetch(async () => ({ status: 301, text: '' }))('http://n/v1/version');
  assert.equal(redirect.type, 'opaqueredirect');

  await assert.rejects(bridgedFetch(async () => ({ error: 'not reachable' }))('https://n/v1/version'), TypeError);
  const c = new AbortController();
  const pending = bridgedFetch(() => new Promise(() => {}))('https://n/v1/version', { signal: c.signal });
  c.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
