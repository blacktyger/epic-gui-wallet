#!/usr/bin/env node
/*
 * Package check for a release build: fails (exit 1) when the packaged app regresses.
 * Run by scripts/release.sh on the files a user gets: the extracted AppImage (squashfs-root) or
 * the extracted installer (the content of app-64.7z). Node only, no dependencies (app.asar is
 * read directly), so it also runs on Windows.
 *
 *   node scripts/package-check.js --platform linux|win --dir <extracted app> [--artifact <file>]
 *        [--version 6.1.3] [--budgets scripts/package-budgets.json] [--report out.json]
 *        [--waive <rule>]...
 *
 * Rules (ids are what --waive takes; a waived rule is still run and reported, it just doesn't fail):
 *   required        app.asar, its index.js/preload.js/index.html/package.json, the helper binaries,
 *                   node-pty and the resources/*.toml + foundation.json are there
 *   version         app.asar package.json version is --version
 *   asar-node-modules  no node_modules in app.asar and no app.asar.unpacked
 *   bundle-requires index.js and preload.js require() only Node built-ins and electron; the
 *                   renderer's js/*.js require() nothing
 *   source-maps     no *.map file, in the folder or in app.asar
 *   platform        only this platform's executables: no PE/Mach-O on Linux, no ELF/Mach-O on
 *                   Windows; resources/bin holds only bin/linux or bin/win; node-pty has no
 *                   other platform's prebuilds
 *   locales         locales/*.pak is exactly LOCALES (vue.config.js ELECTRON_LANGUAGES)
 *   stripped        Linux: no ELF in resources/bin/linux has a .symtab
 *   no-tor          no tor files at all (tor*, its DLLs)
 *   build-paths     no /home/<user>/ or C:\Users\<user> path in any file except the upstream
 *                   helper binaries (UPSTREAM)
 *   size            artifact, extracted folder and app.asar within the budgets
 */
'use strict';
const fs = require('fs');
const path = require('path');
const builtins = new Set(require('module').builtinModules);

const LOCALES = ['bg', 'cs', 'de', 'en-US', 'fa', 'hi'];
//upstream binaries (EpicCash releases): their own build paths (/root/.cargo, /home/biz, ...)
const UPSTREAM = {
  linux: ['resources/bin/linux/epic', 'resources/bin/linux/epic-wallet'],
  win: ['resources/bin/win/epic.exe', 'resources/bin/win/epic-wallet.exe'],
};
const HELPERS = {
  linux: ['resources/bin/linux/epic', 'resources/bin/linux/epic-wallet'],
  win: ['resources/bin/win/epic.exe', 'resources/bin/win/epic-wallet.exe'],
};
//tor and the 32-bit DLLs only tor.exe imports
const TOR_FILE = /^(tor([-.].*)?|libevent.*\.dll|libssl-1_1\.dll|libcrypto-1_1\.dll|libssp-0\.dll|libwinpthread-1\.dll|libgcc_s_dw2-1\.dll|zlib1\.dll|torrc.*|geoip6?)$/i;
//a /home/<user>/ path (not a URL's /Home/ or host/home/), or C:\Users\ (any case, \ or /)
const BUILD_PATH = /(?<![\w.-])\/home\/[\w.-]+\/|(?<![\w])[a-z]:[\\/]+users[\\/]+[\w.-]+/gi;

function parseArgs(argv) {
  const a = { waive: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => { if (i + 1 >= argv.length) throw new Error(k + ' needs a value'); return argv[++i]; };
    if (k === '--platform') a.platform = v();
    else if (k === '--dir') a.dir = v();
    else if (k === '--artifact') a.artifact = v();
    else if (k === '--version') a.version = v();
    else if (k === '--budgets') a.budgets = v();
    else if (k === '--report') a.report = v();
    else if (k === '--waive') a.waive.push(v());
    else throw new Error('unknown argument ' + k);
  }
  if (!['linux', 'win'].includes(a.platform)) throw new Error('--platform linux|win');
  if (!a.dir) throw new Error('--dir <extracted app>');
  return a;
}

/* every file under dir, as forward-slash paths relative to dir */
function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(dir, r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

/* app.asar: [pickle 4][header size][pickle: payload size, json length, json] then the files */
function readAsar(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const json = Buffer.alloc(head.readUInt32LE(12));
    fs.readSync(fd, json, 0, json.length, 16);
    const files = [];
    (function list(node, prefix) {
      for (const [name, n] of Object.entries(node.files || {})) {
        const p = prefix ? prefix + '/' + name : name;
        if (n.files) list(n, p);
        else files.push({ path: p, size: n.size, offset: n.offset, unpacked: !!n.unpacked, link: n.link });
      }
    })(JSON.parse(json.toString('utf8')), '');
    return { files, base: 8 + head.readUInt32LE(4) };
  } finally {
    fs.closeSync(fd);
  }
}

function kind(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(64);
    const n = fs.readSync(fd, b, 0, 64, 0);
    if (n >= 4 && b.readUInt32BE(0) === 0x7f454c46) return 'elf';
    const m = n >= 4 ? b.readUInt32BE(0) : 0;
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(m)) return 'macho';
    //0xcafebabe is also a Java class file; a fat Mach-O has a small arch count after it
    if (m === 0xcafebabe && n >= 8 && b.readUInt32BE(4) < 20) return 'macho';
    if (n >= 64 && b[0] === 0x4d && b[1] === 0x5a) {
      const pe = b.readUInt32LE(60);
      const sig = Buffer.alloc(4);
      if (fs.readSync(fd, sig, 0, 4, pe) === 4 && sig.toString('latin1') === 'PE\0\0') return 'pe';
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/* section names of an ELF64/ELF32 file (little or big endian) */
function elfSections(file) {
  const b = fs.readFileSync(file);
  const is64 = b[4] === 2;
  const le = b[5] === 1;
  const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const uN = (o) => (is64 ? Number(le ? b.readBigUInt64LE(o) : b.readBigUInt64BE(o)) : u32(o));
  const shoff = uN(is64 ? 0x28 : 0x20);
  const shentsize = u16(is64 ? 0x3a : 0x2e);
  const shnum = u16(is64 ? 0x3c : 0x30);
  const shstrndx = u16(is64 ? 0x3e : 0x32);
  if (!shoff || !shnum) return [];
  const sh = (i) => shoff + i * shentsize;
  const strOff = uN(sh(shstrndx) + (is64 ? 0x18 : 0x10));
  const names = [];
  for (let i = 0; i < shnum; i++) {
    const nameOff = strOff + u32(sh(i));
    names.push(b.toString('latin1', nameOff, b.indexOf(0, nameOff)));
  }
  return names;
}

function scanBuildPaths(buf, max = 3) {
  const hits = [];
  //latin1 for 8-bit strings; UTF-16LE (Windows) strings as well, by dropping the zero bytes
  for (const text of [buf.toString('latin1'), utf16Ascii(buf)]) {
    if (!text) continue;
    BUILD_PATH.lastIndex = 0;
    let m;
    while ((m = BUILD_PATH.exec(text)) && hits.length < max) {
      hits.push(text.slice(Math.max(0, m.index - 20), m.index + 50).replace(/[^\x20-\x7e]/g, '.'));
    }
  }
  return hits;
}

/* the ASCII characters of UTF-16LE runs (c 0 c 0 ...), other bytes as separators */
function utf16Ascii(buf) {
  if (buf.length < 16) return '';
  const out = Buffer.alloc(buf.length >> 1);
  let n = 0;
  for (let i = 0; i + 1 < buf.length; i += 2) out[n++] = buf[i + 1] === 0 && buf[i] >= 0x20 && buf[i] < 0x7f ? buf[i] : 0x0a;
  return out.toString('latin1', 0, n);
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const plat = a.platform;
  const dir = path.resolve(a.dir);
  const results = [];
  const rule = (id, problems, info) => results.push({ id, ok: problems.length === 0, waived: a.waive.includes(id), problems, info });

  const files = walk(dir);
  const total = files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  const asarPath = path.join(dir, 'resources', 'app.asar');
  const asar = fs.existsSync(asarPath) ? readAsar(asarPath) : null;
  const asarFd = asar ? fs.openSync(asarPath, 'r') : null;
  const asarRead = (p) => {
    if (!asar) return null;
    const f = asar.files.find((x) => x.path === p);
    if (!f || f.unpacked || f.link) return null;
    const b = Buffer.alloc(f.size);
    fs.readSync(asarFd, b, 0, f.size, asar.base + Number(f.offset));
    return b;
  };

  //required
  {
    const p = [];
    if (!asar) p.push('resources/app.asar missing');
    else for (const f of ['index.js', 'preload.js', 'index.html', 'package.json']) if (!asar.files.some((x) => x.path === f)) p.push('app.asar: ' + f + ' missing');
    const need = [...HELPERS[plat], 'resources/node-pty/package.json', 'resources/epic-wallet.toml', 'resources/epic-server.toml', 'resources/foundation.json'];
    const lower = new Set(files.map((f) => f.toLowerCase()));
    for (const f of need) if (!lower.has(f.toLowerCase())) p.push(f + ' missing');
    if (!files.some((f) => /^resources\/node-pty\/.*\.node$/.test(f))) p.push('resources/node-pty: no .node binary');
    rule('required', p);
  }

  //version
  {
    const p = [];
    const pj = asarRead('package.json');
    const v = pj ? JSON.parse(pj.toString('utf8')).version : null;
    if (a.version && v !== a.version) p.push('app.asar package.json version ' + v + ', expected ' + a.version);
    rule('version', p, { version: v });
  }

  //asar-node-modules
  {
    const p = [];
    if (asar) {
      const nm = asar.files.filter((f) => /(^|\/)node_modules\//.test(f.path));
      if (nm.length) p.push(nm.length + ' files under node_modules in app.asar, e.g. ' + nm.slice(0, 3).map((f) => f.path).join(', '));
    }
    if (fs.existsSync(asarPath + '.unpacked')) p.push('resources/app.asar.unpacked exists');
    rule('asar-node-modules', p);
  }

  //bundle-requires
  {
    const p = [];
    const req = /require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    for (const f of ['index.js', 'preload.js']) {
      const b = asarRead(f);
      if (!b) continue;
      const bad = new Set();
      for (const m of b.toString('utf8').matchAll(req)) {
        const name = m[1].replace(/^node:/, '');
        if (!builtins.has(name) && name !== 'electron' && !name.startsWith('.')) bad.add(m[1]);
      }
      if (bad.size) p.push(f + ' requires ' + [...bad].join(', '));
    }
    if (asar) for (const f of asar.files.filter((x) => /^js\/.*\.js$/.test(x.path))) {
      const b = asarRead(f.path);
      const m = b && b.toString('utf8').match(req);
      if (m) p.push(f.path + ': ' + m.slice(0, 3).join(', '));
    }
    rule('bundle-requires', p);
  }

  //source-maps
  {
    const maps = files.filter((f) => f.endsWith('.map')).concat(asar ? asar.files.filter((f) => f.path.endsWith('.map')).map((f) => 'app.asar/' + f.path) : []);
    rule('source-maps', maps.length ? [maps.length + ' .map files, e.g. ' + maps.slice(0, 3).join(', ')] : []);
  }

  //platform
  {
    const p = [];
    const foreign = plat === 'linux' ? ['pe', 'macho'] : ['elf', 'macho'];
    for (const f of files) {
      const k = kind(path.join(dir, f));
      if (foreign.includes(k)) p.push(f + ' is ' + k);
    }
    const binDir = path.join(dir, 'resources', 'bin');
    const bins = fs.existsSync(binDir) ? fs.readdirSync(binDir) : [];
    for (const d of bins) if (d !== plat) p.push('resources/bin/' + d + ' (other platform)');
    const other = files.filter((f) => f.startsWith('resources/node-pty/prebuilds/') && !f.startsWith('resources/node-pty/prebuilds/' + (plat === 'win' ? 'win32-x64' : 'linux-x64') + '/'));
    if (other.length) p.push('node-pty prebuilds of other platforms: ' + other.slice(0, 3).join(', '));
    rule('platform', p);
  }

  //locales
  {
    const got = files.filter((f) => /^locales\/[^/]+\.pak$/.test(f)).map((f) => path.basename(f, '.pak')).sort();
    const p = [];
    const extra = got.filter((l) => !LOCALES.includes(l));
    const missing = LOCALES.filter((l) => !got.includes(l));
    if (extra.length) p.push('unexpected locales: ' + extra.join(', '));
    if (missing.length) p.push('missing locales: ' + missing.join(', '));
    rule('locales', p, { locales: got });
  }

  //stripped
  if (plat === 'linux') {
    const p = [];
    for (const f of files.filter((x) => x.startsWith('resources/bin/linux/'))) {
      const full = path.join(dir, f);
      if (kind(full) !== 'elf') continue;
      const s = elfSections(full);
      if (s.includes('.symtab') || s.includes('.debug_info')) p.push(f + ' is not stripped');
    }
    rule('stripped', p);
  }

  //no-tor
  {
    const tor = files.filter((f) => TOR_FILE.test(path.basename(f)) && !f.startsWith('locales/'));
    rule('no-tor', tor.length ? ['tor files: ' + tor.join(', ')] : []);
  }

  //build-paths
  {
    const p = [];
    const skip = new Set(UPSTREAM[plat]);
    for (const f of files) {
      if (skip.has(f)) continue;
      const hits = scanBuildPaths(fs.readFileSync(path.join(dir, f)));
      if (hits.length) p.push(f + ': ' + hits.map((h) => JSON.stringify(h)).join(' '));
    }
    rule('build-paths', p, { allowlisted: [...skip] });
  }

  //size
  {
    const p = [];
    const sizes = { extracted: total, asar: asar ? fs.statSync(asarPath).size : 0 };
    if (a.artifact) sizes.artifact = fs.statSync(a.artifact).size;
    const budgets = a.budgets ? JSON.parse(fs.readFileSync(a.budgets, 'utf8'))[plat] : null;
    if (!budgets) p.push('no size budgets for ' + plat + (a.budgets ? ' in ' + a.budgets : ' (--budgets)'));
    else for (const [k, max] of Object.entries(budgets)) {
      if (sizes[k] === undefined) { p.push('no ' + k + ' size to check (--artifact)'); continue; }
      if (sizes[k] > max) p.push(k + ' ' + sizes[k] + ' bytes > budget ' + max);
    }
    rule('size', p, { sizes, budgets });
  }

  if (asarFd !== null) fs.closeSync(asarFd);
  const failed = results.filter((r) => !r.ok && !r.waived);
  for (const r of results) {
    const tag = r.ok ? 'PASS' : r.waived ? 'WAIVED' : 'FAIL';
    console.log(tag.padEnd(7) + r.id + (r.problems.length ? '\n         ' + r.problems.join('\n         ') : ''));
  }
  const report = { platform: plat, dir, ok: failed.length === 0, results };
  if (a.report) fs.writeFileSync(a.report, JSON.stringify(report, null, 2) + '\n');
  console.log(failed.length ? 'package-check: FAILED (' + failed.map((r) => r.id).join(', ') + ')' : 'package-check: ok');
  process.exit(failed.length ? 1 : 0);
}

try { main(); } catch (e) { console.error('package-check: ' + (e && e.stack || e)); process.exit(2); }
