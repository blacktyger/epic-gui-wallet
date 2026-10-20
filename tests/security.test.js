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
  const fs = new Proxy({}, { get: (t, op) => (...args) => {
    calls.push([op, ...args]);
    return op === 'existsSync' ? true : op === 'realpathSync' ? args[0] : op === 'statSync' ? { mode: 0o100644 } : 'ok';
  } });
  return { fs, calls };
}

test('scoped fs: writes in the app folders, reads also in resources, refuses the rest', () => {
  const { fs, calls } = fakeFs();
  const write = ['/home/u/.epic-gui'];
  const read = ['/opt/app/resources'];
  const sfs = createScopedFs({ fs, pathMod: path.posix, copyFrom: read, dirs: () => ({ read, write }) });
  sfs.writeFileSync('/home/u/.epic-gui/settings.json', '{}');
  assert.equal(sfs.readFileSync('/opt/app/resources/epic-wallet.toml', 'utf8'), 'ok');
  sfs.copyFileSync('/opt/app/resources/foundation.json', '/home/u/.epic-gui/node/main/foundation.json');
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
  //what was done, without the checks around it (where a write lands, its mode)
  const ops = calls.map(c => c[0]).filter(o => !['existsSync', 'realpathSync', 'statSync'].includes(o));
  assert.deepEqual(ops, ['writeFileSync', 'readFileSync', 'copyFileSync', 'mkdirSync']);
});

test('scoped fs: nothing written executable, copies only from the resources', () => {
  const { fs, calls } = fakeFs();
  const sfs = createScopedFs({ fs, pathMod: path.posix, copyFrom: ['/opt/app/resources'],
    dirs: () => ({ read: ['/opt/app/resources', '/media/usb/picked'], write: ['/home/u/.epic-gui'] }) });
  sfs.writeFileSync('/home/u/.epic-gui/run.sh', '#!/bin/sh', { encoding: 'utf8', mode: 0o755 });
  sfs.writeFileSync('/home/u/.epic-gui/a.toml', 'x', { encoding: 'utf8', mode: 0o600 });
  sfs.writeFileSync('/home/u/.epic-gui/b.txt', 'x', 'utf8');
  const writes = calls.filter(c => c[0] === 'writeFileSync');
  assert.equal(writes[0][3].mode, 0o644);
  assert.equal(writes[1][3].mode, 0o600);
  assert.equal(writes[2][3], 'utf8');
  assert.throws(() => sfs.copyFileSync('/media/usb/picked/tool', '/home/u/.epic-gui/tool'), { code: 'EACCES' });
  //settingsStore's backup, inside the app folder
  sfs.copyFileSync('/home/u/.epic-gui/settings.json', '/home/u/.epic-gui/settings.json.bak');
  assert.ok(calls.some(c => c[0] === 'copyFileSync' && c[2] === '/home/u/.epic-gui/settings.json.bak'));
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
  const rpc = (method, extra = {}) => JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [], ...extra });
  const local = nodeRequest({ url: 'http://127.0.0.1:3413/v2/owner', method: 'post', headers: { authorization: 'Basic x' }, body: rpc('get_status') });
  assert.deepEqual(local.headers, { Authorization: 'Basic x' });
  assert.equal(local.method, 'POST');
  assert.equal(local.body, rpc('get_status'));
  assert.equal(nodeRequest({ url: 'https://n:3413/v2/foreign', method: 'POST', body: rpc('get_tip') }).body, rpc('get_tip'));
  for (const bad of [{ url: 'file:///etc/passwd' }, { url: 'https://evil.example/upload' }, { url: 'https://n:3413/v1/status?x=1' },
    { url: 'https://n:3413/v2/foreign', method: 'PUT' }, { url: 'https://n:3413/v2/foreign', method: 'POST', body: 'x'.repeat(5000) },
    { url: 'https://n:3413/v2/foreign', method: 'POST', body: rpc('get_tip', { seed: 'twelve words' }) },
    { url: 'https://n:3413/v2/foreign', method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_tip', params: ['secret'] }) },
    { url: 'https://n:3413/v2/foreign', method: 'POST', body: rpc('push_transaction') },
    { url: 'https://n:3413/v2/owner', method: 'POST', body: rpc('get_version') },
    { url: 'https://n:3413/v2/foreign', method: 'GET' }, { url: 'https://n:3413/v1/status', method: 'POST', body: '{}' }, null]) {
    assert.ok(nodeRequest(bad).error, JSON.stringify(bad));
  }
});

test('nodeRequest: get_kernel takes a kernel excess and a min height only (send-all status, QA T03)', () => {
  const kernel = (params) => JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_kernel', params });
  const excess = '09' + 'ab'.repeat(32);
  assert.equal(nodeRequest({ url: 'https://n:3413/v2/foreign', method: 'POST', body: kernel([excess, 3760000, null]) }).body, kernel([excess, 3760000, null]));
  assert.equal(nodeRequest({ url: 'https://n:3413/v2/foreign', method: 'POST', body: kernel([excess, null, null]) }).body, kernel([excess, null, null]));
  for (const params of [[excess], [excess, 1, 2], ['zz' + excess.slice(2), 1, null], [excess.toUpperCase(), 1, null], [excess + 'ab', 1, null],
    [excess, -1, null], [excess, 1.5, null], [excess, '1', null], [{ seed: 'twelve words' }, null, null], []]) {
    assert.ok(nodeRequest({ url: 'https://n:3413/v2/foreign', method: 'POST', body: kernel(params) }).error, JSON.stringify(params));
  }
  //the owner API never gets it
  assert.ok(nodeRequest({ url: 'https://n:3413/v2/owner', method: 'POST', body: kernel([excess, 1, null]) }).error);
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

test('scoped fs: lstatSync as a plain object, in the read scope only', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'sfs-'));
  try {
    fs.writeFileSync(path.join(dir, 'a'), 'x');
    const sfs = createScopedFs({ fs, pathMod: path, dirs: () => ({ read: [], write: [dir] }) });
    const st = sfs.lstatSync(path.join(dir, 'a'));
    assert.equal(Object.getPrototypeOf(st), Object.prototype);
    assert.deepEqual([st.isFile(), st.isDirectory(), st.isSymbolicLink(), st.size], [true, false, false, 1]);
    assert.throws(() => sfs.lstatSync('/etc/passwd'), { code: 'EACCES' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scoped fs (real files): a copy or a write loses its x bits; a symlink does not lead a write out', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX modes and symlinks');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const base = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'sfs-'));
  try {
    const res = path.join(base, 'resources');
    const root = path.join(base, 'root');
    const outside = path.join(base, 'outside');
    for (const d of [res, root, outside]) fs.mkdirSync(d);
    fs.writeFileSync(path.join(res, 'tool'), '#!/bin/sh', { mode: 0o755 });
    fs.symlinkSync(outside, path.join(root, 'link'));
    const sfs = createScopedFs({ fs, pathMod: path, copyFrom: [res], dirs: () => ({ read: [res], write: [root] }) });
    sfs.copyFileSync(path.join(res, 'tool'), path.join(root, 'copy'));
    assert.equal(fs.statSync(path.join(root, 'copy')).mode & 0o111, 0);
    fs.chmodSync(path.join(root, 'copy'), 0o755);
    sfs.writeFileSync(path.join(root, 'copy'), 'other');
    assert.equal(fs.statSync(path.join(root, 'copy')).mode & 0o111, 0);
    assert.throws(() => sfs.writeFileSync(path.join(root, 'link', 'x'), 'escape'), { code: 'EACCES' });
    assert.throws(() => sfs.mkdirSync(path.join(root, 'link', 'a', 'b'), { recursive: true }), { code: 'EACCES' });
    assert.equal(fs.existsSync(path.join(outside, 'x')), false);
    //a root that is itself a symlink is fine: it is compared by where it leads too
    const sfs2 = createScopedFs({ fs, pathMod: path, dirs: () => ({ read: [], write: [path.join(root, 'link')] }) });
    sfs2.writeFileSync(path.join(root, 'link', 'ok'), 'in');
    assert.equal(fs.readFileSync(path.join(outside, 'ok'), 'utf8'), 'in');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
