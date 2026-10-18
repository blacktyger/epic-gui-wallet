// Tests for src/shared/processOwnership.js: run with `npm test` (node --test, no extra dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  redactCmd, redactArgs, redactProcess, describeSpawn, cmdMatchesEntry, findOwned, torrcPath,
  createProcessRegistry, SCAN_PATTERN,
} from '../src/shared/processOwnership.js';

const BIN = '/opt/EpicWallet/resources/bin/linux/epic-wallet';
const NODE = '/opt/EpicWallet/resources/bin/linux/epic';
const DIR = '/home/u/epicguiwallet/main';
const WBIN = 'C:\\Program Files\\EpicWallet\\resources\\bin\\win\\epic-wallet.exe';
const WDIR = 'C:\\Users\\John Doe\\epicguiwallet\\main';

function proc(pid, cmd, ppid = 1) {
  return { pid, ppid, cmd, name: cmd.split(' ')[0].split('/').pop(), bin: cmd.split(' ')[0] };
}

test('redactCmd hides --pass, --password and -p values', () => {
  assert.equal(redactCmd(`${BIN} --pass s3cret -c ${DIR} owner_api`), `${BIN} --pass <redacted> -c ${DIR} owner_api`);
  assert.equal(redactCmd('epic-wallet -p "my secret" listen'), 'epic-wallet -p <redacted> listen');
  assert.equal(redactCmd('epic-wallet --password=abc scan'), 'epic-wallet --password=<redacted> scan');
  assert.equal(redactCmd('cmd.exe /d /s /c ""C:\\x\\epic-wallet.exe" --pass hunter2 owner_api"'), 'cmd.exe /d /s /c ""C:\\x\\epic-wallet.exe" --pass <redacted> owner_api"');
  //not a flag: left as is
  assert.equal(redactCmd('/home/u/my-pass/epic-wallet listen'), '/home/u/my-pass/epic-wallet listen');
  assert.equal(redactCmd(undefined), undefined);
});

test('redactArgs and redactProcess', () => {
  assert.deepEqual(redactArgs(['--pass', 'x y', '-c', DIR, 'owner_api']), ['--pass', '<redacted>', '-c', DIR, 'owner_api']);
  assert.deepEqual(redactArgs(['-p', 'a', 'listen']), ['-p', '<redacted>', 'listen']);
  const p = { pid: 1, cmd: `${BIN} --pass pw owner_api`, bin: BIN };
  const r = redactProcess(p);
  assert.equal(r.cmd, `${BIN} --pass <redacted> owner_api`);
  assert.equal(p.cmd, `${BIN} --pass pw owner_api`, 'the original is not changed');
  assert.ok(!JSON.stringify(r).includes('pw '));
});

test('describeSpawn reads role, dir and network from the args', () => {
  assert.deepEqual(describeSpawn(BIN, ['--offline_mode', '-c', DIR, '--pass', 'x', 'owner_api']),
    { role: 'owner_api', bin: BIN, dir: DIR, network: 'mainnet' });
  assert.equal(describeSpawn(BIN, ['--floonet', '--pass', 'x', '-t', DIR, '-c', DIR, 'listen', '--method', 'epicbox', '--no_tor']).role, 'epicbox');
  assert.equal(describeSpawn(BIN, ['--floonet', '--pass', 'x', '-t', DIR, '-c', DIR, 'listen', '--method', 'epicbox']).network, 'floonet');
  assert.equal(describeSpawn(BIN, ['--pass', 'x', '-t', DIR, '-c', DIR, 'listen', '--method', 'http']).role, 'listen');
  assert.deepEqual(describeSpawn(BIN, ['--pass', 'x', '-t', DIR, 'scan', '-s', 0]), { role: 'scan', bin: BIN, dir: DIR, network: 'mainnet' });
  assert.deepEqual(describeSpawn(NODE, ['--usernet', 'server', '--config_file', DIR + '/epic-server.toml', 'run']),
    { role: 'node', bin: NODE, dir: DIR + '/epic-server.toml', network: 'usernet' });
  //Windows: quoted paths
  assert.deepEqual(describeSpawn('"' + WBIN + '"', ['-c', '"' + WDIR + '"', '--pass', 'x', 'owner_api']),
    { role: 'owner_api', bin: WBIN, dir: WDIR, network: 'mainnet' });
  //not tracked
  assert.equal(describeSpawn(BIN, ['--pass', 'x', '-c', DIR, 'init']), null);
  assert.equal(describeSpawn(NODE, ['server', 'run']), null, 'no config file: nothing to recognise it by');
  assert.equal(describeSpawn(BIN, null), null);
});

test('cmdMatchesEntry needs the same binary, dir and role', () => {
  const entry = describeSpawn(BIN, ['-c', DIR, '--pass', 'x', 'owner_api']);
  assert.ok(cmdMatchesEntry(entry, `${BIN} --offline_mode -c ${DIR} --pass x owner_api`));
  assert.ok(!cmdMatchesEntry(entry, `/home/u/epic/bin/epic-wallet -c ${DIR} --pass x owner_api`), 'another binary');
  assert.ok(!cmdMatchesEntry(entry, `${BIN} -c ${DIR}2 --pass x owner_api`), 'a dir that only starts the same');
  assert.ok(!cmdMatchesEntry(entry, `${BIN} -c /home/u/other --pass x owner_api`), 'another dir');
  assert.ok(!cmdMatchesEntry(entry, `${BIN} -c ${DIR} --pass x listen`), 'another role');
  const eb = describeSpawn(BIN, ['-t', DIR, '-c', DIR, 'listen', '--method', 'epicbox']);
  const http = describeSpawn(BIN, ['-t', DIR, '-c', DIR, 'listen', '--method', 'http']);
  const ebCmd = `${BIN} --pass x -t ${DIR} -c ${DIR} listen --method epicbox --no_tor`;
  assert.ok(cmdMatchesEntry(eb, ebCmd));
  assert.ok(!cmdMatchesEntry(http, ebCmd));
  //Windows: case, quotes and the cmd.exe wrapper
  const w = describeSpawn('"' + WBIN + '"', ['-c', '"' + WDIR + '"', '--pass', 'x', 'owner_api']);
  assert.ok(cmdMatchesEntry(w, `"c:\\program files\\epicwallet\\resources\\bin\\win\\epic-wallet.exe" --offline_mode -c "C:\\Users\\John Doe\\epicguiwallet\\main" --pass x owner_api`, true));
  assert.ok(cmdMatchesEntry(w, `C:\\WINDOWS\\system32\\cmd.exe /d /s /c ""${WBIN}" -c "${WDIR}" --pass x owner_api"`, true));
  assert.ok(!cmdMatchesEntry(w, `"C:\\epic\\epic-wallet.exe" -c "${WDIR}" --pass x owner_api`, true));
});

test('findOwned: only recorded pids whose command line still matches', () => {
  const owner = { pid: 100, at: 1, ...describeSpawn(BIN, ['-c', DIR, '--pass', 'x', 'owner_api']) };
  const reused = { pid: 200, at: 1, ...describeSpawn(BIN, ['-t', DIR, '-c', DIR, 'listen', '--method', 'http']) };
  const procs = [
    proc(100, `${BIN} -c ${DIR} --pass x owner_api`),
    proc(200, '/usr/bin/vim notes.txt'), //pid reused by something else
    proc(300, `/home/bt/epic/user-env/bin/epic-wallet --usernet -c /home/bt/epic/user-env listen`), //the user's own
    proc(301, `/home/bt/epic/bin/epic --floonet server run`),
    proc(302, `${BIN} -c ${DIR} --pass x owner_api`), //same command, but not a pid we started
  ];
  const { owned, live } = findOwned([owner, reused], procs);
  assert.deepEqual(owned.map(p => p.pid), [100]);
  assert.equal(owned[0].role, 'owner_api');
  assert.ok(!owned[0].cmd.includes('--pass x'), 'the listed command is redacted');
  assert.deepEqual(live, [owner]);
  assert.deepEqual(findOwned([owner], procs, { roles: ['listen'] }).owned, []);
  assert.deepEqual(findOwned([owner], procs, { dir: '/home/u/other' }).owned, []);
});

test('findOwned: node by network, Windows shell wrapper and its child', () => {
  const node = { pid: 10, at: 1, ...describeSpawn(NODE, ['--floonet', 'server', '--config_file', DIR + '/epic-server.toml', 'run']) };
  const procs = [proc(10, `${NODE} --floonet server --config_file ${DIR}/epic-server.toml run`)];
  assert.equal(findOwned([node], procs, { network: 'floonet' }).owned.length, 1);
  assert.equal(findOwned([node], procs, { network: 'mainnet' }).owned.length, 0);

  const w = { pid: 50, at: 1, ...describeSpawn('"' + WBIN + '"', ['-c', '"' + WDIR + '"', '--pass', 'x', 'owner_api']) };
  const wprocs = [
    { pid: 50, ppid: 4, cmd: `C:\\WINDOWS\\system32\\cmd.exe /d /s /c ""${WBIN}" -c "${WDIR}" --pass x owner_api"` },
    { pid: 51, ppid: 50, cmd: `"${WBIN}" -c "${WDIR}" --pass x owner_api` },
    { pid: 52, ppid: 50, cmd: 'C:\\WINDOWS\\system32\\conhost.exe 0x4' },
  ];
  assert.deepEqual(findOwned([w], wprocs, { win: true, dir: WDIR.toLowerCase() }).owned.map(p => p.pid), [50, 51]);
});

test('findOwned: Tor of our listener or orphaned, not of someone else\'s wallet', () => {
  const listen = { pid: 20, at: 1, ...describeSpawn(BIN, ['-t', DIR, '-c', DIR, 'listen', '--method', 'http']) };
  const torrc = torrcPath(DIR);
  assert.equal(torrc, DIR + '/tor/listener/torrc');
  const procs = [
    proc(20, `${BIN} --pass x -t ${DIR} -c ${DIR} listen --method http`),
    proc(21, `tor -f ${torrc}`, 20), //child of our listener
    proc(22, `tor -f ${torrc}`, 999), //orphan, parent gone (or a subreaper)
    proc(30, `/home/u/cli/epic-wallet -t ${DIR} listen`), //a CLI wallet on the same dir
    proc(31, `tor -f ${torrc}`, 30),
    proc(32, `tor -f /home/u/cli/tor/listener/torrc`, 1), //another dir
  ];
  const owned = findOwned([listen], procs, { tor: true }).owned;
  assert.deepEqual(owned.map(p => [p.pid, p.role]), [[20, 'listen'], [21, 'tor'], [22, 'tor']]);
  assert.deepEqual(findOwned([], procs, { tor: true }).owned.map(p => p.pid), [], 'no listener dir known: no Tor');
  //the account dir, without a record: only the orphan (21's parent is an epic-wallet we don't know)
  assert.deepEqual(findOwned([], procs, { tor: true, torDirs: [DIR] }).owned.map(p => p.pid), [22]);
  assert.equal(torrcPath('C:\\a b\\main\\', true), 'C:\\a b\\main\\tor\\listener\\torrc');
});

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'procown-'));
  return { file: path.join(dir, 'gui_processes.json'), done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function fakeSystem(procs) {
  const killed = [];
  return {
    killed,
    procs,
    findProcess: async (by, pattern) => {
      assert.equal(by, 'name');
      return procs.filter(p => pattern.test(p.cmd));
    },
    kill: async (pid) => {
      killed.push(pid);
      const i = procs.findIndex(p => p.pid == pid);
      if (i < 0) return false;
      procs.splice(i, 1);
      return true;
    },
  };
}

test('registry: record, list, stop only ours, forget', async () => {
  const { file, done } = tmpFile();
  try {
    const sys = fakeSystem([
      proc(100, `${BIN} -c ${DIR} --pass x owner_api`),
      proc(101, `${BIN} --pass x -t ${DIR} -c ${DIR} listen --method epicbox --no_tor`),
      proc(300, `/home/bt/epic/bin/epic-wallet -c /home/bt/epic/floo listen`),
      proc(301, `/home/bt/epic/bin/epic --floonet server run`),
    ]);
    const reg = createProcessRegistry({ fs, file, findProcess: sys.findProcess, kill: sys.kill });
    assert.equal(reg.record(100, BIN, ['-c', DIR, '--pass', 'x', 'owner_api']).role, 'owner_api');
    reg.record(101, BIN, ['--pass', 'x', '-t', DIR, '-c', DIR, 'listen', '--method', 'epicbox', '--no_tor']);
    assert.equal(reg.record(102, BIN, ['--pass', 'x', '-c', DIR, 'init']), null);
    assert.ok(!fs.readFileSync(file, 'utf8').includes('--pass'), 'no password in the record');
    assert.ok(!fs.readFileSync(file, 'utf8').includes('"x"'));

    const all = await reg.list(['owner_api', 'listen', 'epicbox', 'node', 'scan'], { tor: true });
    assert.deepEqual(all.map(p => p.pid).sort(), [100, 101]);

    //keep the background Epicbox listener, stop the rest
    const results = await reg.stop(await reg.list(['owner_api', 'listen', 'scan', 'node']));
    assert.deepEqual(results, [true]);
    assert.deepEqual(sys.killed, [100]);
    assert.deepEqual(reg.load().map(e => e.pid), [101]);

    //a later start: the recorded Epicbox listener is still known
    const reg2 = createProcessRegistry({ fs, file, findProcess: sys.findProcess, kill: sys.kill });
    assert.deepEqual((await reg2.list(['epicbox'], { dir: DIR })).map(p => p.pid), [101]);
    assert.deepEqual(await reg2.stopPids([300, 101]), [false, true], 'a foreign pid is not stopped');
    assert.deepEqual(sys.killed, [100, 101]);
    assert.deepEqual(sys.procs.map(p => p.pid), [300, 301], 'the user\'s own processes still run');
  } finally {
    done();
  }
});

test('registry: drops records of gone or reused pids, keeps ones spawned during a scan', async () => {
  const { file, done } = tmpFile();
  try {
    let t = 1000;
    const sys = fakeSystem([proc(100, '/usr/bin/vim')]);
    const reg = createProcessRegistry({ fs, file, findProcess: sys.findProcess, kill: sys.kill, now: () => t });
    reg.record(100, BIN, ['-c', DIR, '--pass', 'x', 'owner_api']);
    t = 2000;
    let release;
    const slowFind = (by, pattern) => new Promise(r => { release = () => r(sys.procs.filter(p => pattern.test(p.cmd))); });
    const reg2 = createProcessRegistry({ fs, file, findProcess: slowFind, kill: sys.kill, now: () => t });
    const pending = reg2.list(['owner_api']);
    t = 2500;
    reg.record(200, BIN, ['-t', DIR, '-c', DIR, 'listen', '--method', 'http']); //spawned while the scan runs
    release();
    assert.deepEqual(await pending, []);
    assert.deepEqual(reg.load().map(e => e.pid), [200]);
    assert.equal(sys.killed.length, 0, 'a reused pid is never killed');
  } finally {
    done();
  }
});

test('registry: Windows kills the tree once (cmd.exe), children count as stopped', async () => {
  const { file, done } = tmpFile();
  try {
    const sys = fakeSystem([
      { pid: 50, ppid: 4, cmd: `C:\\WINDOWS\\system32\\cmd.exe /d /s /c ""${WBIN}" -c "${WDIR}" --pass x owner_api"` },
      { pid: 51, ppid: 50, cmd: `"${WBIN}" -c "${WDIR}" --pass x owner_api` },
    ]);
    const kill = async (pid) => { sys.killed.push(pid); sys.procs.length = 0; return true; };
    const reg = createProcessRegistry({ fs, file, findProcess: sys.findProcess, kill, win: true });
    reg.record(50, '"' + WBIN + '"', ['-c', '"' + WDIR + '"', '--pass', 'x', 'owner_api']);
    const owned = await reg.list(['owner_api'], { dir: WDIR });
    assert.deepEqual(owned.map(p => p.pid), [50, 51]);
    assert.deepEqual(await reg.stop(owned), [true, true]);
    assert.deepEqual(sys.killed, [50]);
    assert.deepEqual(reg.load(), []);
  } finally {
    done();
  }
});

test('registry: a missing or broken file is an empty record', () => {
  const { file, done } = tmpFile();
  try {
    const reg = createProcessRegistry({ fs, file, findProcess: async () => [], kill: async () => true });
    assert.deepEqual(reg.load(), []);
    fs.writeFileSync(file, '{not json');
    assert.deepEqual(reg.load(), []);
    fs.writeFileSync(file, JSON.stringify([{ pid: 1, role: 'rm -rf' }, { pid: -1, role: 'node' }, null]));
    assert.deepEqual(reg.load(), []);
  } finally {
    done();
  }
});

test('the scan pattern covers wallet, node, cmd.exe wrappers and Tor', () => {
  for (const c of [BIN, NODE + ' server run', 'cmd.exe /c "C:\\x\\epic-wallet.exe"', 'tor -f /x/tor/listener/torrc']) {
    assert.ok(SCAN_PATTERN.test(c), c);
  }
});
