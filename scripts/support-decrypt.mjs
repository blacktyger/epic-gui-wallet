#!/usr/bin/env node
/*
 * Open a support report (.epicsupport, docs/support/DESIGN.md) with the developer's private key.
 *
 *   node scripts/support-decrypt.mjs <report.epicsupport | report id> [-k <key.pem>] [-o <dir>] [--print]
 *
 * A report id (e.g. r7k2m9q4) is fetched from the feedback bot's fleet API over the tailnet first:
 * GET <GFB_URL>/support/<id> with the gfb token (env GFB_URL / GFB_TOKEN, else ~/.config/gfb, as the
 * gfb CLI reads them; docs/support/INTAKE.md). The key is found by the report's key id
 * in ~/.config/epic-gui-support/support-<keyId>.pem unless -k names one. The report is written to
 * <dir> (default ~/epic-support-reports/<name>/, mode 700): report.txt (description, contact, app)
 * and one file per log under logs/. --print also prints report.txt.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openBundle, readHeader } from '../src/shared/supportBundle.js';

const KEY_DIR = path.join(os.homedir(), '.config', 'epic-gui-support');

/* GFB_URL and GFB_TOKEN: env first, then ~/.config/gfb (KEY=VALUE lines) */
function gfbConfig() {
  const c = {};
  try {
    for (const line of fs.readFileSync(path.join(os.homedir(), '.config', 'gfb'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*(GFB_[A-Z]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) c[m[1]] = m[2];
    }
  } catch (e) { /* no config file */ }
  return { url: process.env.GFB_URL || c.GFB_URL || '', token: process.env.GFB_TOKEN || c.GFB_TOKEN || '' };
}

function usage(code) {
  console.error('usage: support-decrypt <report.epicsupport | report id> [-k key.pem] [-o dir] [--print]');
  process.exit(code);
}

const args = process.argv.slice(2);
let keyFile = '', outDir = '', print = false, src = '';
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') usage(0);
  else if (a === '-k') keyFile = args[++i];
  else if (a === '-o') outDir = args[++i];
  else if (a === '--print') print = true;
  else if (!src) src = a;
  else usage(2);
}
if (!src) usage(2);

let bytes, name;
if (fs.existsSync(src)) {
  bytes = fs.readFileSync(src);
  name = path.basename(src).replace(/\.epicsupport$/, '');
} else if (/^#?[a-z0-9]{4,40}$/i.test(src)) {
  const id = src.replace(/^#/, '');
  const gfb = gfbConfig();
  if (!gfb.url || !gfb.token) {
    console.error('no GFB_URL / GFB_TOKEN (env or ~/.config/gfb): cannot fetch report ' + id);
    process.exit(1);
  }
  const url = gfb.url.replace(/\/+$/, '') + '/support/' + encodeURIComponent(id);
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + gfb.token }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    console.error('fetch ' + url + ': HTTP ' + res.status);
    process.exit(1);
  }
  bytes = Buffer.from(await res.arrayBuffer());
  name = 'report-' + id;
} else {
  console.error('no such file: ' + src);
  process.exit(2);
}

const h = readHeader(bytes);
if (!h) {
  console.error('not a support report (.epicsupport)');
  process.exit(1);
}
const keyId = h.keyId.toString('hex');
const kf = keyFile || path.join(KEY_DIR, 'support-' + keyId + '.pem');
if (!fs.existsSync(kf)) {
  console.error('no key for key id ' + keyId + ' (looked for ' + kf + ')');
  process.exit(1);
}

let report;
try {
  report = openBundle(bytes, fs.readFileSync(kf, 'utf8'));
} catch (e) {
  console.error('cannot open the report: ' + e.message);
  process.exit(1);
}

const dir = outDir || path.join(os.homedir(), 'epic-support-reports', name);
fs.mkdirSync(path.join(dir, 'logs'), { recursive: true, mode: 0o700 });
//a report is input from anyone with the public key: no terminal control characters in what is printed
const plain = (v) => String(v == null ? '' : v).replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, '?');
const a = Object.fromEntries(Object.entries(report.app || {}).map(([k, v]) => [k, plain(v)]));
const summary = [
  'Report created: ' + plain(report.created),
  'App: ' + [a.version, a.ui, a.lang && 'lang ' + a.lang].filter(Boolean).join(', '),
  'System: ' + [a.platform, a.release, a.arch, a.locale && 'locale ' + a.locale, a.electron && 'electron ' + a.electron].filter(Boolean).join(', '),
  'Contact: ' + (plain(report.contact) || '(none)'),
  '',
  'Description:',
  plain(report.description),
  '',
  'Logs: ' + (Array.isArray(report.files) && report.files.length ? report.files.filter((f) => f && typeof f === 'object').map((f) => plain(f.name) + ' (' + Number(f.bytes) + ' B' + (f.cut ? ', tail' : '') + ')').join(', ') : 'none attached'),
  ...(Array.isArray(report.dropped) && report.dropped.length ? ['Left out (size cap): ' + plain(report.dropped.join(', '))] : []),
  '',
].join('\n');
fs.writeFileSync(path.join(dir, 'report.txt'), summary, { mode: 0o600 });
//anyone can make a report: in the log files too, no terminal control characters (\n and \t stay)
const text = (v) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '?');
const used = new Set();
for (const [i, f] of (Array.isArray(report.files) ? report.files : []).entries()) {
  if (!f || typeof f !== 'object') continue;
  //names come from the report: one plain file name inside logs/, short, unique
  let safe = String(f.name).split(/[\\/]+/).filter((p) => p && p !== '.' && p !== '..').join('__')
    .replace(/[^\w.-]/g, '_').slice(0, 100) || 'log';
  if (used.has(safe)) safe = i + '-' + safe;
  used.add(safe);
  fs.writeFileSync(path.join(dir, 'logs', safe), text(f.text), { mode: 0o600 });
}
console.error('report written to ' + dir);
if (print) process.stdout.write(summary);
