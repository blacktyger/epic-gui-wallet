#!/usr/bin/env node
/*
 * Fetch and open support reports (docs/SUPPORT.md) with the developer's private key.
 *
 *   npm run support:list [-- <n>]                  the newest reports on the intake (default 20)
 *   npm run support:fetch -- <report id> [--print] fetch one over ssh and open it
 *   node scripts/support-decrypt.mjs <report.epicsupport | report id> [-k <key.pem>] [-o <dir>] [--print]
 *
 * Reports live on the intake host (SUPPORT_SSH_HOST, default hostinger-eu) in SUPPORT_REMOTE_DIR (default
 * /srv/epic-support/reports, owner-only: read with sudo there). A file a user saved and sent by hand opens
 * the same way. The key is found by the report's key id in ~/.config/epic-gui-support/support-<keyId>.pem
 * unless -k names one. The report is written to <dir> (default ~/epic-support-reports/<name>/, mode 700):
 * report.txt (description, contact, app) and one file per log under logs/. --print also prints report.txt.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openBundle, readHeader } from '../src/shared/supportBundle.js';

const KEY_DIR = path.join(os.homedir(), '.config', 'epic-gui-support');
const HOST = process.env.SUPPORT_SSH_HOST || 'hostinger-eu';
const REMOTE = process.env.SUPPORT_REMOTE_DIR || '/srv/epic-support/reports';
const ID_RE = /^[a-z2-7]{8}$/;

/* a command on the intake host: its stdout as bytes (exits on a failure) */
function remote(cmd) {
  const r = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', HOST, cmd], { timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error('ssh ' + HOST + ': ' + (r.error ? r.error.message : String(r.stderr || '').trim() || 'exit ' + r.status));
    process.exit(1);
  }
  return r.stdout;
}

function usage(code) {
  console.error('usage: support-decrypt <report.epicsupport | report id> [-k key.pem] [-o dir] [--print]\n       support-decrypt --list [n]');
  process.exit(code);
}

const args = process.argv.slice(2);
let keyFile = '', outDir = '', print = false, src = '', list = 0;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') usage(0);
  else if (a === '-k') keyFile = args[++i];
  else if (a === '-o') outDir = args[++i];
  else if (a === '--print') print = true;
  else if (a === '--list') list = /^\d+$/.test(args[i + 1] || '') ? Number(args[++i]) : 20;
  else if (!src) src = a;
  else usage(2);
}

if (list) {
  const lines = remote('sudo -n cat ' + REMOTE + '/index.jsonl 2>/dev/null || true').toString('utf8').split('\n').filter((l) => l.trim());
  const rows = lines.map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter((e) => e && ID_RE.test(e.id));
  if (!rows.length) console.log('no reports');
  for (const e of rows.slice(-list).reverse()) {
    console.log([e.id, String(e.received || '').replace('T', ' ').slice(0, 19) + ' UTC', String(Math.ceil((e.size || 0) / 1024)).padStart(5) + ' KB',
      'app ' + (String(e.app || '?').replace(/[^\w.+-]/g, '') || '?'), e.expired ? 'expired' : ''].join('  ').trimEnd());
  }
  process.exit(0);
}
if (!src) usage(2);

let bytes, name;
if (fs.existsSync(src)) {
  bytes = fs.readFileSync(src);
  name = path.basename(src).replace(/\.epicsupport$|\.bundle$/, '');
} else if (ID_RE.test(src.replace(/^#/, ''))) {
  const id = src.replace(/^#/, '');
  bytes = remote('sudo -n cat ' + REMOTE + '/' + id + '.bundle');
  name = 'report-' + id;
} else {
  console.error('no such file, and not a report id (8 characters a-z, 2-7): ' + src);
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
