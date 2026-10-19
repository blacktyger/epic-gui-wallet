// Tests for src/shared/spawnCommand.js and the Windows command lines it leads to: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnCommand, plainBin, epicCwd } from '../src/shared/spawnCommand.js';
import { describeSpawn, cmdMatchesEntry, findOwned } from '../src/shared/processOwnership.js';

//what cmd.exe broke on: spaces, & | ^ % ! < > ( ), quotes, plus a trailing backslash
const HARD = ['a b c', 'p&ss', 'p|ss', 'p^ss', '100%', '%PATH%', 'hi!', '!x!', 'q"uo"te', "it's", 'a<b>c', '(x)', 'end\\', 'tab\there', ' lead', '-c', 'owner_api'];
const DIR_WIN = 'C:\\Users\\Jane Doe\\.epic\\main & co';
const BIN_WIN = 'C:\\Program Files\\EpicWallet\\resources\\bin\\win\\epic-wallet.exe';

test('no shell on any platform; the arguments are passed as they are', () => {
  for (const pass of HARD) {
    const c = spawnCommand('"' + BIN_WIN + '"', ['--pass', pass, '-c', DIR_WIN, 'owner_api']);
    assert.deepEqual(c.options, { shell: false, windowsHide: true });
    assert.equal(c.cmd, BIN_WIN);
    assert.deepEqual(c.args, ['--pass', pass, '-c', DIR_WIN, 'owner_api']);
  }
});

test('plainBin removes only the surrounding quotes a shell caller added', () => {
  assert.equal(plainBin('"C:\\a b\\epic.exe"'), 'C:\\a b\\epic.exe');
  assert.equal(plainBin('/opt/epic/epic-wallet'), '/opt/epic/epic-wallet');
  assert.equal(plainBin(' /x/y '), '/x/y');
});

test('a real child gets every hard argument and a path with spaces unchanged', () => {
  const args = ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--', '--pass', ...HARD, '-c', '/tmp/dir with spaces/main'];
  const c = spawnCommand(process.execPath, args);
  const r = spawnSync(c.cmd, c.args, Object.assign({ encoding: 'utf8' }, c.options));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), ['--pass', ...HARD, '-c', '/tmp/dir with spaces/main']);
});

test('Windows: the record is the binary itself, and its live command line still matches', () => {
  for (const pass of ['a b&c', 'q"x', 'owner_api', '-c']) {
    const entry = Object.assign({ pid: 40 }, describeSpawn(BIN_WIN, ['--pass', pass, '-c', DIR_WIN, 'listen', '--method', 'epicbox']));
    assert.equal(entry.role, 'epicbox');
    assert.equal(entry.dir, DIR_WIN);
    assert.equal(entry.bin, BIN_WIN);
    assert.ok(!JSON.stringify(entry).includes(pass === '-c' ? '"-c"' : pass));
    //how Windows shows the command line Node built (arguments with spaces quoted)
    const live = `"${BIN_WIN}" --pass "${pass.replace(/"/g, '\\"')}" -c "${DIR_WIN}" listen --method epicbox`;
    assert.equal(cmdMatchesEntry(entry, live, true), true, pass);
    //another dir that starts the same is not ours
    assert.equal(cmdMatchesEntry(entry, live.replace('main & co"', 'main & co2"'), true), false);
  }
});

test('Windows: a child of our epic-wallet.exe (its tor.exe) is not taken for the wallet; a 6.0.0 cmd.exe wrapper still is', () => {
  const entry = Object.assign({ pid: 40 }, describeSpawn(BIN_WIN, ['--pass', 'x', '-c', DIR_WIN, 'owner_api']));
  const wallet = { pid: 40, ppid: 1, name: 'epic-wallet.exe', cmd: `"${BIN_WIN}" --pass x -c "${DIR_WIN}" owner_api` };
  const other = { pid: 41, ppid: 40, name: 'epic-wallet.exe', cmd: `"${BIN_WIN}" --pass x -c "${DIR_WIN}" owner_api` };
  let r = findOwned([entry], [wallet, other], { win: true });
  assert.deepEqual(r.owned.map(o => o.pid), [40]);
  //6.0.0: the recorded pid is cmd.exe, epic-wallet.exe its child
  const wrapper = { pid: 40, ppid: 1, name: 'cmd.exe', cmd: `C:\\WINDOWS\\system32\\cmd.exe /d /s /c ""${BIN_WIN}" --pass x -c "${DIR_WIN}" owner_api"` };
  r = findOwned([entry], [wrapper, other], { win: true });
  assert.deepEqual(r.owned.map(o => o.pid).sort(), [40, 41]);
});

test('cwd: the child runs in the dir given (the wallet config dir), none when not given', (t) => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'cwd test '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const c = spawnCommand(process.execPath, ['-e', 'process.stdout.write(process.cwd())'], { cwd: dir });
  assert.deepEqual(c.options, { shell: false, windowsHide: true, cwd: dir });
  const r = spawnSync(c.cmd, c.args, Object.assign({ encoding: 'utf8' }, c.options));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.realpathSync(r.stdout), fs.realpathSync(dir));
  assert.equal('cwd' in spawnCommand('x', [], {}).options, false);
  assert.equal('cwd' in spawnCommand('x', []).options, false);
});

test('epicCwd: the wallet config dir (-c) or the node folder; a password is never taken for it', () => {
  assert.equal(epicCwd(['--usernet', '--pass', '-c', '-c', '/r/wallets/w1', 'init']), '/r/wallets/w1');
  assert.equal(epicCwd(['--usernet', '-c', '/r/wallets/w1', 'init']), '/r/wallets/w1');
  assert.equal(epicCwd(['--pass', 'x', '-t', '/old/main', '-c', '/r/wallets/w2', 'listen']), '/r/wallets/w2');
  assert.equal(epicCwd(['--floonet', 'server', '--config_file', '/r/node/floo/epic-server.toml', 'run']), '/r/node/floo');
  assert.equal(epicCwd(['server', '--config_file', 'C:\\Epic GUI\\node\\main\\epic-server.toml', 'run']), 'C:\\Epic GUI\\node\\main');
  assert.equal(epicCwd(['server', 'run']), '');
  assert.equal(epicCwd(undefined), '');
});
