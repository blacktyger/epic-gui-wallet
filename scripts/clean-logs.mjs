#!/usr/bin/env node
/*
 * Clean log files the way support reports do (src/shared/logSanitize.js): home folders and the user
 * name → ~ / <user>, IPs, private hosts, wallet addresses, secrets, slates and phrases masked.
 *
 *   node scripts/clean-logs.mjs [--home <dir>] [--user <name>] [--host <name>] [-o <outdir>] <file|dir>...
 *
 * One file without -o: printed to stdout. Otherwise each file goes to <outdir>/<name>.clean.log
 * (a dir: its *.log files and log4rs rotations, *.gz read through zlib). Defaults: this machine's
 * home, user and host name. A summary of what was masked goes to stderr.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { sanitizeText } from '../src/shared/logSanitize.js';

const USAGE = 'usage: clean-logs [--home <dir>] [--user <name>] [--host <name>] [-o <outdir>] <file|dir>...';
const args = process.argv.slice(2);
const opts = { home: os.homedir(), username: os.userInfo().username, hostname: os.hostname() };
let out = '';
const inputs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
  else if (a === '--home') opts.home = args[++i];
  else if (a === '--user') opts.username = args[++i];
  else if (a === '--host') opts.hostname = args[++i];
  else if (a === '-o') out = args[++i];
  else inputs.push(a);
}
if (!inputs.length) { console.error(USAGE); process.exit(2); }

const files = [];
for (const p of inputs) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const n of fs.readdirSync(p).sort()) if (/\.log(\.\d+)?(\.gz)?$/.test(n)) files.push(path.join(p, n));
  } else files.push(p);
}

const total = {};
for (const f of files) {
  let buf = fs.readFileSync(f);
  if (f.endsWith('.gz')) buf = zlib.gunzipSync(buf, { maxOutputLength: 256 * 1024 * 1024 });
  const r = sanitizeText(buf.toString('utf8'), opts);
  for (const [k, v] of Object.entries(r.counts)) total[k] = (total[k] || 0) + v;
  if (!out && files.length === 1) {
    process.stdout.write(r.text);
  } else {
    const dir = out || '.';
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, path.basename(f).replace(/\.gz$/, '').replace(/\.log(\.\d+)?$/, (m, n) => (n || '') + '.clean.log'));
    fs.writeFileSync(target, r.text);
    console.error(f + ' → ' + target);
  }
}
console.error('masked: ' + Object.entries(total).filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join(', ') || 'nothing');
