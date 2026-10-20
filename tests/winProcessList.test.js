// Tests for src/shared/winProcessList.js: the Windows process list the process record uses (JSON from
// PowerShell, not find-process's parse of Format-List text). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createWinFindProcess, parseProcessJson, PS_LIST } from '../src/shared/winProcessList.js';
import { cmdMatchesEntry, describeSpawn, findOwned, SCAN_PATTERN } from '../src/shared/processOwnership.js';

const require = createRequire(import.meta.url);

const BIN = 'C:\\Program Files\\Epic Wallet\\resources\\bin\\win\\epic-wallet.exe';
const BASE = 'C:\\EpicRig\\profiles\\gate-3a68af42f-20261020-115827\\confirm615-modern\\Users\\wintest\\.epic-gui\\wallets\\';
const ARGS = ['-t', BASE + 'w1', '-c', BASE + 'w3', 'listen', '--method', 'http', '--no_tor'];
//node-pty's command line (quoted, the path has spaces)
const CMD = '"' + BIN + '" ' + ARGS.join(' ');

function entryFor(pid, args = ARGS) {
  return Object.assign({ pid, at: 1 }, describeSpawn(BIN, args));
}

/* Format-List text as PowerShell writes it, wrapping the value at width at a space */
function formatList(rows, width) {
  const label = (k) => k.padEnd(15) + ' : ';
  return rows.map(r => {
    const lines = [];
    for (const [k, v] of Object.entries(r)) {
      let rest = String(v);
      let first = true;
      while (rest.length) {
        const room = width - label(k).length;
        let cut = rest.length <= room ? rest.length : rest.lastIndexOf(' ', room);
        if (cut <= 0) cut = room;
        lines.push((first ? label(k) : ' '.repeat(label(k).length)) + rest.slice(0, cut));
        //the space it broke at is not written
        rest = rest.slice(cut).replace(/^ /, '');
        first = false;
      }
    }
    return lines.join('\r\n');
  }).join('\r\n\r\n') + '\r\n';
}

test('why: find-process joins a wrapped Format-List value without the space, so the listener is not ours any more', () => {
  const utils = require('find-process/lib/utils');
  const text = formatList([{ Name: 'epic-wallet.exe', ProcessId: 56052, ParentProcessId: 4000, CommandLine: CMD, ExecutablePath: BIN }], 120);
  const [row] = utils.parseTable(text);
  assert.notEqual(row.CommandLine, CMD);
  assert.equal(row.CommandLine.replace(/\s/g, ''), CMD.replace(/\s/g, ''));
  assert.equal(cmdMatchesEntry(entryFor(56052), row.CommandLine, true), false);
});

test('parseProcessJson: rows as find-process gives them; a missing field is empty, not null', () => {
  const out = '\uFEFFsome warning\r\nEPIC_PROCS ' + JSON.stringify([
    { pid: 56052, ppid: 4000, name: 'epic-wallet.exe', bin: BIN, cmd: CMD },
    { pid: 4, ppid: 0, name: 'System', bin: null, cmd: null },
    { pid: 0, ppid: 0, name: 'Idle', bin: '', cmd: '' },
  ]) + '\r\n';
  assert.deepEqual(parseProcessJson(out), [
    { pid: 56052, ppid: 4000, name: 'epic-wallet.exe', bin: BIN, cmd: CMD },
    { pid: 4, ppid: 0, name: 'System', bin: '', cmd: '' },
  ]);
  //PowerShell 5.1 writes one object, not an array, for a one-element list in some versions
  assert.equal(parseProcessJson('EPIC_PROCS ' + JSON.stringify({ pid: 7, ppid: 1, name: 'a', bin: '', cmd: 'epic' })).length, 1);
  assert.deepEqual(parseProcessJson('EPIC_PROCS []'), []);
  assert.equal(parseProcessJson('EPIC_PROCS ' + JSON.stringify({ value: [{ pid: 7, ppid: 1, name: 'a', bin: '', cmd: 'epic' }], Count: 1 })).length, 1);
  assert.throws(() => parseProcessJson('Get-CimInstance : Access denied'), /no answer/);
});

test('createWinFindProcess: PowerShell by full path, encoded command, pattern by env; command lines of any length come back whole', async () => {
  const calls = [];
  const rows = [];
  //every length from short to long: each wraps at another place in Format-List
  for (let pad = 0; pad < 60; pad++) {
    const args = ['-t', BASE + 'w1', '-c', BASE + 'w' + 'x'.repeat(pad), 'listen', '--method', pad % 2 ? 'epicbox' : 'http', '--no_tor'];
    rows.push({ pid: 1000 + pad, ppid: 4000, name: 'epic-wallet.exe', bin: BIN, cmd: '"' + BIN + '" ' + args.join(' '), args });
  }
  rows.push({ pid: 9, ppid: 1, name: 'notepad.exe', bin: 'C:\\Windows\\notepad.exe', cmd: 'notepad.exe x.txt' });
  const run = async (file, args, opts) => {
    calls.push({ file, args, opts });
    return { stdout: 'EPIC_PROCS ' + JSON.stringify(rows.map(({ args: a, ...r }) => r)) };
  };
  const find = createWinFindProcess({ run, env: { SystemRoot: 'D:\\Win', PATH: 'x' } });
  const list = await find('name', SCAN_PATTERN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(calls[0].args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
  assert.equal(Buffer.from(calls[0].args[3], 'base64').toString('utf16le'), PS_LIST);
  assert.equal(calls[0].opts.env.EPIC_PROC_PATTERN, SCAN_PATTERN.source);
  assert.equal(calls[0].opts.env.PATH, 'x');
  assert.ok(calls[0].opts.timeout > 0);
  //notepad is not epic
  assert.equal(list.length, 60);
  const entries = rows.slice(0, 60).map(r => entryFor(r.pid, r.args));
  const { owned } = findOwned(entries, list, { win: true });
  assert.equal(owned.length, 60);
  assert.ok(entries.every(e => owned.some(o => o.pid === e.pid && o.role === e.role)));
});

test('PS_LIST: JSON, compressed, UTF-8 without a BOM; no Format-List output', () => {
  assert.match(PS_LIST, /ConvertTo-Json -InputObject \$rows -Compress/);
  assert.match(PS_LIST, /UTF8Encoding \$false/);
  assert.match(PS_LIST, /\$env:EPIC_PROC_PATTERN/);
  assert.doesNotMatch(PS_LIST, /\| *select /i);
});

test('createWinFindProcess: a failed PowerShell rejects (the record keeps its entries)', async () => {
  const find = createWinFindProcess({ run: async () => { throw new Error('powershell.exe not found'); } });
  await assert.rejects(find('name', SCAN_PATTERN), /not found/);
  await assert.rejects(find('pid', 5), /only by name/);
});
