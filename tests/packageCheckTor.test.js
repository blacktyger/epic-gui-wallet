'use strict';
//package-check's tor-bundle rule: exactly the pinned files in bin/<plat>/tor-bundle/, nothing else tor
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'package-check.js');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const PINNED = {
  linux: { tor: 'tor bin', 'libssl.so.3': 'ssl', 'libcrypto.so.3': 'crypto', 'libevent-2.1.so.7': 'event' },
  win: { 'tor.exe': 'tor exe' },
};
const LICENSE = 'GPL text';

function pinFile(dir) {
  const platforms = {};
  for (const [plat, files] of Object.entries(PINNED)) {
    platforms[plat] = { files: Object.fromEntries(Object.entries(files).map(([f, c]) => [f, sha(c)])), license: sha(LICENSE) };
  }
  const p = path.join(dir, 'pin.json');
  fs.writeFileSync(p, JSON.stringify({ bundleVersion: '1.0.0', tor: '0.0.0.1', platforms }));
  return p;
}

//a package folder with the bundle in place; `extra` = [relative path, content] stray files
function pkg(plat, { extra = [], omit = [], tamper = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkgcheck-'));
  const bundle = path.join(dir, 'app', 'resources', 'bin', plat, 'tor-bundle');
  fs.mkdirSync(bundle, { recursive: true });
  const put = (rel, c) => { fs.mkdirSync(path.dirname(path.join(dir, 'app', rel)), { recursive: true }); fs.writeFileSync(path.join(dir, 'app', rel), c); };
  const files = { ...PINNED[plat], VERSION: 'v', 'LICENSE.tor.txt': LICENSE };
  for (const [f, c] of Object.entries(files)) if (!omit.includes(f)) put(`resources/bin/${plat}/tor-bundle/${f}`, tamper[f] || c);
  for (const [rel, c] of extra) put(rel, c);
  return { dir, app: path.join(dir, 'app'), pin: pinFile(dir) };
}

//the tor-bundle line(s) of the report
function torRule(plat, p) {
  const r = spawnSync('node', [SCRIPT, '--platform', plat, '--dir', p.app, '--tor-pin', p.pin], { encoding: 'utf8' });
  const m = r.stdout.match(/^(PASS|FAIL|WAIVED)\s+tor-bundle\n?((?:\s{9}.*\n?)*)/m);
  assert.ok(m, 'no tor-bundle line in: ' + r.stdout + r.stderr);
  return { ok: m[1] === 'PASS', problems: m[2] };
}

for (const plat of Object.keys(PINNED)) {
  test(plat + ': the pinned bundle passes', () => {
    const p = pkg(plat);
    try { assert.equal(torRule(plat, p).ok, true, JSON.stringify(torRule(plat, p))); } finally { fs.rmSync(p.dir, { recursive: true, force: true }); }
  });

  test(plat + ': a missing pinned file fails', () => {
    const p = pkg(plat, { omit: [Object.keys(PINNED[plat])[0]] });
    try { const r = torRule(plat, p); assert.equal(r.ok, false); assert.match(r.problems, /missing/); } finally { fs.rmSync(p.dir, { recursive: true, force: true }); }
  });

  test(plat + ': a changed pinned file fails', () => {
    const f = Object.keys(PINNED[plat])[0];
    const p = pkg(plat, { tamper: { [f]: 'evil' } });
    try { const r = torRule(plat, p); assert.equal(r.ok, false); assert.match(r.problems, /pinned SHA-256/); } finally { fs.rmSync(p.dir, { recursive: true, force: true }); }
  });
}

test('a stray tor-gencert.exe fails', () => {
  const p = pkg('win', { extra: [['resources/bin/win/tor-bundle/tor-gencert.exe', 'x']] });
  try { const r = torRule('win', p); assert.equal(r.ok, false); assert.match(r.problems, /tor-gencert\.exe/); } finally { fs.rmSync(p.dir, { recursive: true, force: true }); }
});

test('bin/<plat>/tor/tor next to epic-wallet fails', () => {
  const p = pkg('linux', { extra: [['resources/bin/linux/tor/tor', 'x']] });
  try { const r = torRule('linux', p); assert.equal(r.ok, false); assert.match(r.problems, /bin\/linux\/tor\/tor/); } finally { fs.rmSync(p.dir, { recursive: true, force: true }); }
});

for (const rel of [
  'resources/bin/win/tor-bundle/pluggable_transports/lyrebird.exe',
  'resources/bin/win/tor-bundle/geoip',
  'resources/bin/win/libssl-1_1.dll',
  'resources/bin/win/libevent-2-1-6.dll',
  'resources/bin/win/zlib1.dll',
  'resources/bin/win/torrc',
  'resources/bin/win/conjure-client.exe',
]) {
  test('stray ' + rel + ' fails', () => {
    const p = pkg('win', { extra: [[rel, 'x']] });
    try { assert.equal(torRule('win', p).ok, false); } finally { fs.rmSync(p.dir, { recursive: true, force: true }); }
  });
}
