#!/usr/bin/env node
/*
 * Fetch the pinned Tor Expert Bundle into resources/bin/<plat>/tor-bundle/ (never tor/: epic-wallet 4.x
 * would find and start that one itself). Node 22, no npm dependencies; the system `tar` (bsdtar on Windows).
 *
 *   node scripts/fetch-tor.mjs --platform linux,win|all [--gpg required|auto|skip] [--bump <bundleVersion>]
 *
 *   --gpg   required: fail without a good signature; auto (default): without gpg warn and go on with the
 *           SHA-256 pins only; skip: SHA-256 pins only
 *   --bump  fetch sha256sums-signed-build.txt (+ .asc), require a good GPG signature, download the
 *           tarballs and rewrite resources/tor/tor-bundle.json (tarball and extracted-file hashes).
 *           The only way the pins change.
 *
 * The signature is checked in a temporary GNUPGHOME: the key comes over WKD and VALIDSIG must name the
 * pinned primary-key fingerprint. The archive is untrusted: only the listed paths are copied out, and
 * only if they are plain files. See docs/RELEASE.md.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = path.join(ROOT, 'resources', 'tor', 'tor-bundle.json');
//GUI platform -> name in the tarball's file name, the folder of the files inside, the kept files
const PLATFORMS = {
  linux: { os: 'linux-x86_64', files: ['tor', 'libssl.so.3', 'libcrypto.so.3', 'libevent-2.1.so.7'] },
  win: { os: 'windows-x86_64', files: ['tor.exe'] },
  mac: { os: 'macos-x86_64', files: ['tor', 'libevent-2.1.7.dylib'] },
  macsilicon: { os: 'macos-aarch64', files: ['tor', 'libevent-2.1.7.dylib'] },
};
const LICENSE_SRC = 'docs/tor.txt';
const LICENSE_NAME = 'LICENSE.tor.txt';

const die = (m) => { console.error('fetch-tor: ' + m); process.exit(1); };
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function parseArgs(argv) {
  const a = { platforms: null, gpg: 'auto', bump: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => { if (i + 1 >= argv.length) die(k + ' needs a value'); return argv[++i]; };
    if (k === '--platform') a.platforms = v();
    else if (k === '--gpg') a.gpg = v();
    else if (k === '--bump') a.bump = v();
    else die('unknown argument ' + k);
  }
  if (!['required', 'auto', 'skip'].includes(a.gpg)) die('--gpg required|auto|skip');
  if (a.bump && !/^\d+(\.\d+)+$/.test(a.bump)) die('--bump <bundleVersion>, e.g. 15.0.25');
  if (!a.platforms && !a.bump) die('--platform linux,win|all');
  a.list = !a.platforms || a.platforms === 'all' ? Object.keys(PLATFORMS) : a.platforms.split(',').map((s) => s.trim());
  for (const p of a.list) if (!PLATFORMS[p]) die('unknown platform ' + p + ' (' + Object.keys(PLATFORMS).join(', ') + ')');
  return a;
}

function cacheDir(version) {
  const base = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'epic-gui-tor')
    : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'epic-gui-tor');
  const d = path.join(base, version);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

async function download(bases, version, name, dest) {
  let last;
  for (const b of bases) {
    const url = b + version + '/' + name;
    try {
      console.log('  download ' + url);
      const res = await fetch(url, { signal: AbortSignal.timeout(600000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const tmp = dest + '.part';
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      fs.renameSync(tmp, dest);
      return;
    } catch (e) {
      last = e;
      console.warn('  ' + url + ': ' + (e.message || e));
    }
  }
  die('could not download ' + name + ': ' + (last && last.message));
}

function have(cmd) {
  return spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 20000 }).status === 0;
}

/* gpg --verify in a temporary GNUPGHOME with the key from WKD; VALIDSIG's last field = pinned primary key */
function gpgVerify(pin, file, sig, mode) {
  if (mode === 'skip') { console.log('  gpg: skipped (--gpg skip)'); return; }
  if (!have('gpg')) {
    if (mode === 'required') die('gpg not found and --gpg required');
    console.warn('  gpg: not found, going on with the SHA-256 pins only');
    return;
  }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-tor-gnupg-'));
  fs.chmodSync(home, 0o700);
  try {
    const env = { ...process.env, GNUPGHOME: home };
    const run = (args) => spawnSync('gpg', ['--batch', ...args], { encoding: 'utf8', env, timeout: 120000 });
    const loc = run(['--auto-key-locate', 'nodefault,wkd', '--locate-keys', pin.wkd]);
    if (loc.status !== 0) die('gpg: could not fetch the key for ' + pin.wkd + ' over WKD: ' + (loc.stderr || '').trim().split('\n').pop());
    const v = run(['--status-fd', '1', '--verify', sig, file]);
    const valid = (v.stdout || '').split('\n').find((l) => l.startsWith('[GNUPG:] VALIDSIG '));
    if (v.status !== 0 || !valid) die('gpg: no good signature on ' + path.basename(file) + ': ' + (v.stderr || '').trim().split('\n').pop());
    const fields = valid.trim().split(/\s+/);
    const primary = fields[fields.length - 1].toUpperCase();
    if (primary !== pin.signingKey.toUpperCase()) die('gpg: signed by ' + primary + ', not the pinned ' + pin.signingKey);
    console.log('  gpg: good signature of ' + path.basename(file) + ' by ' + primary);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

/* extract into a fresh dir; return a reader of plain files only (no symlinks, no path traversal) */
function extract(tarball) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-tor-x-'));
  const r = spawnSync('tar', ['-xzf', tarball, '-C', dir], { encoding: 'utf8', timeout: 300000 });
  if (r.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); die('tar failed: ' + (r.stderr || r.error)); }
  const root = fs.realpathSync(dir);
  const get = (rel) => {
    const p = path.resolve(root, rel);
    if (!p.startsWith(root + path.sep)) die('path outside the archive: ' + rel);
    let st;
    try { st = fs.lstatSync(p); } catch (e) { die(rel + ' is not in the archive'); }
    if (!st.isFile()) die(rel + ' in the archive is not a plain file');
    if (fs.realpathSync(p) !== p) die(rel + ' in the archive goes through a link');
    return p;
  };
  return { dir, get };
}

function tarballName(pin, plat, version) {
  return 'tor-expert-bundle-' + PLATFORMS[plat].os + '-' + version + '.tar.gz';
}

async function cached(pin, version, name, wantSha, cache) {
  const file = path.join(cache, name);
  if (fs.existsSync(file)) {
    const have = sha256(file);
    if (have === wantSha) return file;
    fs.rmSync(file);
    die('cached ' + name + ' has SHA-256 ' + have + ', pinned ' + wantSha + ' (cache file deleted: run again to download it afresh)');
  }
  await download(pin.baseUrls, version, name, file);
  const got = sha256(file);
  if (got !== wantSha) {
    fs.rmSync(file, { force: true });
    die('SHA-256 of ' + name + ' is ' + got + ', pinned ' + wantSha + ' (download deleted)');
  }
  return file;
}

function torVersion(binary, plat) {
  if (plat !== 'linux' || process.platform !== 'linux') return null;
  const r = spawnSync(binary, ['--version'], { encoding: 'utf8', env: { ...process.env, LD_LIBRARY_PATH: path.dirname(binary) }, timeout: 20000 });
  return (r.stdout || '').match(/Tor version (\d+\.\d+\.\d+\.\d+)/)?.[1] || null;
}

async function fetchPlatform(pin, plat, a, cache) {
  const spec = pin.platforms[plat];
  if (!spec) die('no ' + plat + ' entry in tor-bundle.json');
  console.log(plat + ':');
  const name = spec.tarball;
  const file = await cached(pin, pin.bundleVersion, name, spec.sha256, cache);
  console.log('  sha256 ok ' + spec.sha256);
  //the signature covers sha256sums-signed-build.txt, not the tarballs: check it, then that the pin is in it
  const sums = path.join(cache, 'sha256sums-signed-build.txt');
  const asc = sums + '.asc';
  if (a.gpg !== 'skip') {
    for (const [f, n] of [[sums, 'sha256sums-signed-build.txt'], [asc, 'sha256sums-signed-build.txt.asc']]) {
      if (!fs.existsSync(f)) await download(pin.baseUrls, pin.bundleVersion, n, f);
    }
    gpgVerify(pin, sums, asc, a.gpg);
    const line = fs.readFileSync(sums, 'utf8').split('\n').find((l) => l.trim().endsWith('  ' + name) || l.trim().endsWith(' ' + name));
    if (!line || line.trim().split(/\s+/)[0] !== spec.sha256) die('the signed sha256sums do not list ' + name + ' with the pinned hash');
  }

  const x = extract(file);
  try {
    const out = path.join(ROOT, 'resources', 'bin', plat, 'tor-bundle');
    const stage = out + '.new';
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    for (const [f, want] of Object.entries(spec.files)) {
      const dest = path.join(stage, f);
      fs.copyFileSync(x.get('tor/' + f), dest);
      fs.chmodSync(dest, 0o755);
      const got = sha256(dest);
      if (got !== want) { fs.rmSync(stage, { recursive: true, force: true }); die(plat + ' ' + f + ': SHA-256 ' + got + ', pinned ' + want); }
    }
    const lic = path.join(stage, LICENSE_NAME);
    fs.copyFileSync(x.get(LICENSE_SRC), lic);
    fs.chmodSync(lic, 0o644);
    if (sha256(lic) !== spec.license) { fs.rmSync(stage, { recursive: true, force: true }); die(plat + ' ' + LICENSE_NAME + ' does not match the pinned hash'); }
    fs.writeFileSync(path.join(stage, 'VERSION'), 'Tor Expert Bundle ' + pin.bundleVersion + '\ntor ' + pin.tor + '\n');
    fs.rmSync(out, { recursive: true, force: true });
    fs.renameSync(stage, out);
    console.log('  ' + Object.keys(spec.files).length + ' files in ' + path.relative(ROOT, out));
  } finally {
    fs.rmSync(x.dir, { recursive: true, force: true });
  }
}

async function bump(pin, a) {
  const version = a.bump;
  const cache = cacheDir(version);
  console.log('bump to Tor Expert Bundle ' + version + ':');
  const sums = path.join(cache, 'sha256sums-signed-build.txt');
  for (const n of ['sha256sums-signed-build.txt', 'sha256sums-signed-build.txt.asc']) {
    fs.rmSync(path.join(cache, n), { force: true });
    await download(pin.baseUrls, version, n, path.join(cache, n));
  }
  if (a.gpg === 'skip') die('--bump needs a GPG check: use --gpg required (or auto with gpg installed)');
  gpgVerify(pin, sums, sums + '.asc', 'required');
  const listed = Object.fromEntries(fs.readFileSync(sums, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 2).map(([h, n]) => [n, h]));
  const next = { ...pin, bundleVersion: version, platforms: {} };
  let tor = null;
  for (const plat of Object.keys(PLATFORMS)) {
    const name = tarballName(pin, plat, version);
    const h = listed[name];
    if (!h) die('the signed sha256sums do not list ' + name);
    const file = await cached(pin, version, name, h, cache);
    const x = extract(file);
    try {
      const files = {};
      for (const f of PLATFORMS[plat].files) files[f] = sha256(x.get('tor/' + f));
      next.platforms[plat] = { tarball: name, sha256: h, files, license: sha256(x.get(LICENSE_SRC)) };
      tor = tor || torVersion(x.get('tor/tor'), plat);
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true });
    }
  }
  next.tor = tor || pin.tor;
  if (!tor) console.warn('  the tor version could not be read from the binary: kept ' + pin.tor + ', set it by hand');
  fs.writeFileSync(JSON_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log('wrote ' + path.relative(ROOT, JSON_PATH) + ' (tor ' + next.tor + '). Review the diff, then run fetch-tor.');
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const pin = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  if (a.bump) return bump(pin, a);
  const cache = cacheDir(pin.bundleVersion);
  for (const plat of a.list) await fetchPlatform(pin, plat, a, cache);
  if (a.list.includes('linux') && process.platform === 'linux') {
    const v = torVersion(path.join(ROOT, 'resources', 'bin', 'linux', 'tor-bundle', 'tor'), 'linux');
    console.log('linux tor --version: ' + v + (v === pin.tor ? '' : ' (pin says ' + pin.tor + ')'));
    if (v !== pin.tor) die('the Linux tor reports ' + v + ', not ' + pin.tor);
  }
  console.log('fetch-tor: ok');
}

main().catch((e) => die(e && e.stack || String(e)));
