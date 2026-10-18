// Tests for src/shared/processOwnership.js: run with `npm test` (node --test, no extra dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  redactCmd, redactArgs, redactProcess, describeSpawn, cmdMatchesEntry, findOwned, torrcPaths,
  createProcessRegistry, createPidCheck, pickAdoptable, argsAfterBin, validEntry, SCAN_PATTERN,
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
  assert.ok(!('cmd' in owned[0]), 'no command line in the result: it is logged');
  assert.ok(!JSON.stringify(owned).includes('--pass'));
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
  const torrc = torrcPaths(DIR)[1];
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
  assert.deepEqual(torrcPaths('C:\\a b\\main\\', true), ['C:\\a b\\main\\wallet_tor\\torrc', 'C:\\a b\\main\\tor\\listener\\torrc']);
});

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(process.env.HAGEN_SCRATCH || os.tmpdir(), 'procown-'));
  return { file: path.join(dir, 'gui_processes.json'), done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function fakeSystem(procs) {
  const killed = [];
  return {
    killed,
    procs,
    pidAlive: async (pid) => procs.some(p => p.pid == pid),
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

test('registry: drops records of gone pids, keeps ones spawned during a scan, never kills a reused pid', async () => {
  const { file, done } = tmpFile();
  try {
    let t = 1000;
    const sys = fakeSystem([
      proc(100, '/home/u/cli/epic-wallet -c /home/u/cli owner_api'), //pid reused by someone else's wallet
      proc(300, '/usr/bin/vim'), //pid reused by something the scan does not list
      proc(400, '/home/u/epic/epic server run'), //so the scan is never empty
    ]);
    const reg = createProcessRegistry({ fs, file, findProcess: sys.findProcess, kill: sys.kill, pidAlive: sys.pidAlive, now: () => t });
    reg.record(100, BIN, ['-c', DIR, '--pass', 'x', 'owner_api']);
    reg.record(300, BIN, ['-t', DIR, '-c', DIR, 'listen', '--method', 'http']);
    reg.record(150, BIN, ['-t', DIR, 'scan']); //gone
    t = 2000;
    let release;
    const slowFind = (by, pattern) => new Promise(r => { release = () => r(sys.procs.filter(p => pattern.test(p.cmd))); });
    const reg2 = createProcessRegistry({ fs, file, findProcess: slowFind, kill: sys.kill, pidAlive: sys.pidAlive, now: () => t });
    const pending = reg2.list(['owner_api']);
    t = 2500;
    reg.record(200, BIN, ['-t', DIR, '-c', DIR, 'listen', '--method', 'http']); //spawned while the scan runs
    release();
    assert.deepEqual(await pending, [], 'a reused pid is not ours');
    //reused pids are kept while they run (a garbled scan line looks the same), the gone one is dropped
    assert.deepEqual(reg.load().map(e => e.pid), [100, 300, 200]);
    assert.deepEqual(await reg.stopPids([100, 300]), [false, false]);
    assert.equal(sys.killed.length, 0, 'a reused pid is never killed');
    //once the reused pid ends, its record goes
    sys.procs.splice(0, 1);
    await reg.list(['owner_api']);
    assert.deepEqual(reg.load().map(e => e.pid), [300, 200]);
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

// --- review fixes ---

test('M4: Tor of epic-wallet 4.1 (<dir>/wallet_tor/torrc) is ours too', () => {
  const listen = { pid: 20, at: 1, ...describeSpawn(BIN, ['-t', DIR, '-c', DIR, 'listen', '--method', 'http']) };
  assert.deepEqual(torrcPaths(DIR), [DIR + '/wallet_tor/torrc', DIR + '/tor/listener/torrc']);
  const procs = [
    proc(20, `${BIN} --pass x -t ${DIR} -c ${DIR} listen --method http`),
    proc(21, `/opt/EpicWallet/resources/bin/linux/tor -f ${DIR}/wallet_tor/torrc`, 20),
    proc(22, `tor -f /home/u/cli/wallet_tor/torrc`, 1), //another dir
  ];
  assert.deepEqual(findOwned([listen], procs, { tor: true }).owned.map(p => [p.pid, p.role]), [[20, 'listen'], [21, 'tor']]);
  //Windows, from the account dir alone (orphan)
  const wprocs = [{ pid: 7, ppid: 999, cmd: `"C:\\x\\tor.exe" -f "${WDIR}\\wallet_tor\\torrc"` }];
  assert.deepEqual(findOwned([], wprocs, { tor: true, torDirs: [WDIR], win: true }).owned.map(p => p.pid), [7]);
});

test('L2: a password never reads as a role or a dir, and is never stored', () => {
  //password "owner_api": still a scan
  assert.deepEqual(describeSpawn(BIN, ['--pass', 'owner_api', '-t', DIR, 'scan', '-s', 0]), { role: 'scan', bin: BIN, dir: DIR, network: 'mainnet' });
  //password "-c": the dir is still the -t one
  assert.equal(describeSpawn(BIN, ['--pass', '-c', '-t', DIR, 'scan']).dir, DIR);
  assert.equal(describeSpawn(BIN, ['-p', 'listen', '-c', DIR, 'owner_api']).role, 'owner_api');
  assert.equal(describeSpawn(BIN, ['--pass=owner_api', '-t', DIR, 'scan']).role, 'scan');
  //only a password that names a role: nothing to track
  assert.equal(describeSpawn(BIN, ['--pass', 'owner_api', '-c', DIR, 'init']), null);
  assert.ok(!JSON.stringify(describeSpawn(BIN, ['--pass', '-c', '-t', DIR, 'scan'])).includes('"-c"'));

  //live command lines: redacted before the role and dir checks
  const owner = describeSpawn(BIN, ['-c', DIR, 'owner_api']);
  const scan = describeSpawn(BIN, ['-t', DIR, 'scan']);
  assert.ok(!cmdMatchesEntry(owner, `${BIN} --pass owner_api -c ${DIR} scan`), 'the password is no role');
  assert.ok(cmdMatchesEntry(scan, `${BIN} --pass owner_api -t ${DIR} scan`));
  assert.ok(!cmdMatchesEntry(owner, `${BIN} --pass -c ${DIR} -c /home/u/other owner_api`), 'the password is no dir flag');
  assert.ok(!cmdMatchesEntry(owner, `${BIN} -c /home/u/other --pass ${DIR} owner_api`), 'the password is no dir');
});

test('L3: the executable is the first argument, exactly', () => {
  const node = describeSpawn(NODE, ['server', '--config_file', DIR + '/epic-server.toml', 'run']);
  assert.ok(cmdMatchesEntry(node, `${NODE} server --config_file ${DIR}/epic-server.toml run`));
  assert.ok(!cmdMatchesEntry(node, `${BIN} server --config_file ${DIR}/epic-server.toml run`), '/…/epic is not /…/epic-wallet');
  const owner = describeSpawn(BIN, ['-c', DIR, 'owner_api']);
  assert.ok(!cmdMatchesEntry(owner, `/usr/bin/strace ${BIN} -c ${DIR} owner_api`), 'the binary as a later argument');
  assert.ok(!cmdMatchesEntry(owner, `${BIN}2 -c ${DIR} owner_api`));
  //a path with spaces, as ps shows it (argv joined by spaces)
  const spaced = describeSpawn('/opt/Epic Wallet/resources/bin/linux/epic-wallet', ['-c', DIR, 'owner_api']);
  assert.ok(cmdMatchesEntry(spaced, `/opt/Epic Wallet/resources/bin/linux/epic-wallet -c ${DIR} owner_api`));
  assert.equal(argsAfterBin(`${BIN} -c x`, BIN), ' -c x');
  assert.equal(argsAfterBin(BIN, BIN), '');
  assert.equal(argsAfterBin(`${BIN}-x -c x`, BIN), null);
  //Windows: quoted or not, any case, through the cmd.exe wrapper, never a different exe
  const w = describeSpawn('"' + WBIN + '"', ['-c', '"' + WDIR + '"', 'owner_api']);
  assert.ok(cmdMatchesEntry(w, `"${WBIN.toUpperCase()}" -c "${WDIR}" owner_api`, true));
  assert.ok(cmdMatchesEntry(w, `cmd.exe /d /s /c ""${WBIN}" -c "${WDIR}" owner_api"`, true));
  assert.ok(!cmdMatchesEntry(w, `cmd.exe /d /s /c ""${WBIN.replace('epic-wallet.exe', 'epic.exe')}" -c "${WDIR}" owner_api"`, true));
  const wn = describeSpawn('C:\\Epic\\epic-wallet.exe', ['-c', 'C:\\w', 'owner_api']);
  assert.ok(cmdMatchesEntry(wn, 'c:/epic/EPIC-WALLET.EXE -c C:\\w owner_api', true));
});

test('L6: records with a relative path or another executable are dropped on load', () => {
  const { file, done } = tmpFile();
  try {
    const good = { pid: 5, at: 1, role: 'owner_api', bin: BIN, dir: DIR, network: 'mainnet' };
    fs.writeFileSync(file, JSON.stringify([
      good,
      { ...good, pid: 6, bin: 'epic-wallet' },
      { ...good, pid: 7, dir: 'main' },
      { ...good, pid: 8, bin: '/bin/bash' },
      { ...good, pid: 9, bin: '/opt/x/epic-wallet-evil' },
      { ...good, pid: 10, role: 'node', bin: NODE, dir: DIR + '/epic-server.toml' },
      { ...good, pid: 11, bin: 42 },
    ]));
    const reg = createProcessRegistry({ fs, file, findProcess: async () => [], kill: async () => true });
    assert.deepEqual(reg.load().map(e => e.pid), [5, 10]);
    //Windows paths and .exe
    assert.ok(validEntry({ pid: 1, role: 'listen', bin: 'C:\\x\\epic-wallet.exe', dir: 'C:\\w' }, true));
    assert.ok(validEntry({ pid: 1, role: 'node', bin: '"C:\\x\\EPIC.EXE"', dir: '\\\\srv\\share\\epic-server.toml' }, true));
    assert.ok(!validEntry({ pid: 1, role: 'listen', bin: 'C:\\x\\epic-wallet.exe', dir: 'w' }, true));
    assert.ok(!validEntry({ pid: 1, role: 'listen', bin: '/opt/x/epic-wallet', dir: DIR }, true), 'a POSIX path on Windows');
    assert.ok(!validEntry({ pid: 1, role: 'listen', bin: 'C:\\x\\cmd.exe', dir: 'C:\\w' }, true));
  } finally {
    done();
  }
});

test('M2: an empty scan forgets nothing; a pid that is gone on its own check is forgotten', async () => {
  const { file, done } = tmpFile();
  try {
    const procs = [];
    const alive = new Map([[100, false], [101, null], [102, true]]);
    let t = 0;
    const now = () => ++t;
    const reg = createProcessRegistry({ fs, file, kill: async () => true, now,
      findProcess: async () => procs.slice(), pidAlive: async (pid) => alive.get(pid) });
    reg.record(100, BIN, ['-c', DIR, '--pass', 'x', 'owner_api']);
    reg.record(101, NODE, ['server', '--config_file', DIR + '/epic-server.toml', 'run']);
    reg.record(102, BIN, ['--pass', 'x', '-t', DIR, '-c', DIR, 'listen', '--method', 'epicbox']);
    //PowerShell output that did not parse, or ps that failed: nothing is forgotten
    assert.deepEqual(await reg.list(['owner_api', 'node', 'epicbox']), []);
    assert.deepEqual(reg.load().map(e => e.pid), [100, 101, 102]);
    //a scan that shows something else: only the pid that is surely gone is dropped
    procs.push(proc(500, '/home/u/epic/epic --floonet server run'));
    await reg.list(['owner_api']);
    assert.deepEqual(reg.load().map(e => e.pid), [101, 102], 'unknown (null) and running pids stay');
    //a failing pid check keeps the record too
    const reg2 = createProcessRegistry({ fs, file, kill: async () => true, now, findProcess: async () => procs.slice(),
      pidAlive: async () => { throw new Error('x'); } });
    await reg2.list(['node']);
    assert.deepEqual(reg2.load().map(e => e.pid), [101, 102]);
  } finally {
    done();
  }
});

test('M2: createPidCheck (POSIX kill 0, Windows tasklist)', async () => {
  const err = (code) => () => { const e = new Error(code); e.code = code; throw e; };
  assert.equal(await createPidCheck({ processKill: () => true })(5), true);
  assert.equal(await createPidCheck({ processKill: err('ESRCH') })(5), false);
  assert.equal(await createPidCheck({ processKill: err('EPERM') })(5), true, 'EPERM: it runs, as another user');
  assert.equal(await createPidCheck({ processKill: err('EINVAL') })(5), null);
  assert.equal(await createPidCheck({ processKill: () => true })(-1), false);
  //the real thing: this process runs, a child that has exited does not
  const real = createPidCheck({ processKill: process.kill.bind(process) });
  assert.equal(await real(process.pid), true);
  const { spawnSync } = await import('node:child_process');
  assert.equal(await real(spawnSync(process.execPath, ['-e', '0']).pid), false);

  const tasklist = (stdout, error = null) => (cmd, args, opts, cb) => {
    assert.equal(cmd, 'tasklist');
    assert.deepEqual(args, ['/FI', 'PID eq 42', '/NH', '/FO', 'CSV']);
    cb(error, stdout);
  };
  const win = (stdout, error) => createPidCheck({ win: true, execFile: tasklist(stdout, error) })(42);
  assert.equal(await win('"cmd.exe","42","Console","1","4,000 K"\r\n'), true);
  assert.equal(await win('INFO: No tasks are running which match the specified criteria.\r\n'), false);
  assert.equal(await win('INFORMATION: Es werden keine Aufgaben ausgeführt.\r\n'), false);
  assert.equal(await win('"x.exe","4242","Console","1","1 K"\r\n'), null, 'a row of another pid: not sure');
  assert.equal(await win('', null), null);
  assert.equal(await win('', new Error('no tasklist')), null);
});

test('M3: the record dir is created, the file is private, temp names are per process', () => {
  const { file: base, done } = tmpFile();
  try {
    const file = path.join(path.dirname(base), 'sub', '.epic', 'gui_processes.json');
    const written = [];
    const spyFs = Object.assign({}, fs, { writeFileSync: (f, ...rest) => { written.push(f); return fs.writeFileSync(f, ...rest); } });
    const reg = createProcessRegistry({ fs: spyFs, file, findProcess: async () => [], kill: async () => true, selfPid: 4242 });
    assert.ok(reg.record(100, BIN, ['-c', DIR, 'owner_api']));
    assert.deepEqual(reg.load().map(e => e.pid), [100]);
    assert.deepEqual(written, [file + '.tmp.4242']);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['gui_processes.json'], 'no temp file left');
  } finally {
    done();
  }
});

test('M3: a rename that keeps failing falls back to a direct write; a failed write is logged', () => {
  const { file, done } = tmpFile();
  try {
    let renames = 0;
    const busy = (code) => () => { const e = new Error(code); e.code = code; throw e; };
    const warnings = [];
    const lockedFs = Object.assign({}, fs, { renameSync: () => { renames++; busy('EBUSY')(); } });
    const reg = createProcessRegistry({ fs: lockedFs, file, findProcess: async () => [], kill: async () => true,
      warn: (m) => warnings.push(m), selfPid: 7 });
    reg.record(100, BIN, ['-c', DIR, '--pass', 'hunter2', 'owner_api']);
    assert.equal(renames, 4, 'retried a few times');
    assert.deepEqual(reg.load().map(e => e.pid), [100]);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['gui_processes.json'], 'the temp file is removed');
    assert.deepEqual(warnings, [], 'the fallback worked: nothing to warn about');

    //nothing can be written: a warning, without the password
    const roFs = Object.assign({}, fs, { writeFileSync: busy('EACCES'), renameSync: busy('EACCES') });
    const reg2 = createProcessRegistry({ fs: roFs, file, findProcess: async () => [], kill: async () => true, warn: (m) => warnings.push(m) });
    reg2.record(101, BIN, ['-c', DIR, '--pass', 'hunter2', 'owner_api']);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /not saved.*EACCES/);
    assert.ok(!warnings[0].includes('hunter2'));
  } finally {
    done();
  }
});

test('M3: two writers (main and preload) merge, neither drops the other\'s records', async () => {
  const { file, done } = tmpFile();
  try {
    const sys = fakeSystem([
      proc(100, `${BIN} -c ${DIR} owner_api`),
      proc(200, `${NODE} server --config_file ${DIR}/epic-server.toml run`),
      proc(300, `${BIN} -t ${DIR} scan`),
    ]);
    const preload = createProcessRegistry({ fs, file, findProcess: sys.findProcess, kill: sys.kill, pidAlive: sys.pidAlive, selfPid: 1 });
    const main = createProcessRegistry({ fs, file, findProcess: sys.findProcess, kill: sys.kill, pidAlive: sys.pidAlive, selfPid: 2 });
    preload.record(100, BIN, ['-c', DIR, 'owner_api']);
    main.record(200, NODE, ['server', '--config_file', DIR + '/epic-server.toml', 'run']);
    preload.record(300, BIN, ['-t', DIR, 'scan']);
    assert.deepEqual(main.load().map(e => e.pid), [100, 200, 300]);
    //main stops the owner_api: the others stay
    await main.stop(await main.list(['owner_api']));
    assert.deepEqual(preload.load().map(e => e.pid), [200, 300]);
    preload.forget(300);
    assert.deepEqual(main.load().map(e => e.pid), [200]);
  } finally {
    done();
  }
});

test('M1: pickAdoptable takes only the bundled binaries on this account', () => {
  const nodeConfig = DIR + '/epic-server.toml';
  const opts = { walletBin: BIN, nodeBin: NODE, dir: DIR, nodeConfig, network: 'mainnet' };
  const procs = [
    proc(1, `${BIN} --pass x -t ${DIR} -c ${DIR} listen --method epicbox --no_tor`),
    proc(2, `${NODE} server --config_file ${nodeConfig} run`),
    proc(3, `${BIN} --offline_mode -c ${DIR} --pass x owner_api`),
    proc(4, `/home/u/epic/epic-wallet -t ${DIR} -c ${DIR} listen --method epicbox`), //the user's own binary
    proc(5, `${BIN} -t /home/u/epicguiwallet/floo -c /home/u/epicguiwallet/floo listen --method epicbox`), //another account
    proc(6, `${NODE} --floonet server --config_file ${nodeConfig} run`), //another network
    proc(7, `/opt/Other/resources/bin/linux/epic server --config_file ${nodeConfig} run`), //another app's bundle
    proc(8, `${NODE} server run`), //no config: can't tell
    proc(9, `${BIN} --pass x -c ${DIR} init`), //not a tracked command
  ];
  const picked = pickAdoptable(procs, opts);
  assert.deepEqual(picked, [
    { pid: 1, role: 'epicbox', bin: BIN, dir: DIR, network: 'mainnet' },
    { pid: 2, role: 'node', bin: NODE, dir: nodeConfig, network: 'mainnet' },
    { pid: 3, role: 'owner_api', bin: BIN, dir: DIR, network: 'mainnet' },
  ]);
  assert.ok(!JSON.stringify(picked).includes('--pass'));
  //they are then found like spawned ones
  const entries = picked.map(e => ({ at: 1, ...e }));
  assert.deepEqual(findOwned(entries, procs).owned.map(p => p.pid), [1, 2, 3]);
  //never a binary outside the app's resources/bin, even if the caller passes one
  assert.deepEqual(pickAdoptable([proc(4, `/home/u/epic/epic-wallet -t ${DIR} -c ${DIR} listen --method epicbox`)],
    { ...opts, walletBin: '/home/u/epic/epic-wallet' }), []);
  assert.deepEqual(pickAdoptable(procs, { ...opts, dir: 'relative' }).map(e => e.pid), [2]);
  assert.deepEqual(pickAdoptable(procs, { ...opts, network: 'floonet' }).map(e => e.pid), [1, 3, 6]);

  //Windows: the cmd.exe wrapper of the old version, not its child too (taskkill /t takes it along)
  const wb = WBIN;
  const wprocs = [
    { pid: 50, ppid: 4, cmd: `C:\\WINDOWS\\system32\\cmd.exe /d /s /c ""${wb}" --pass x -t "${WDIR}" -c "${WDIR}" listen --method epicbox --no_tor"` },
    { pid: 51, ppid: 50, cmd: `"${wb}" --pass x -t "${WDIR}" -c "${WDIR}" listen --method epicbox --no_tor` },
  ];
  assert.deepEqual(pickAdoptable(wprocs, { walletBin: '"' + wb + '"', dir: WDIR.toLowerCase(), win: true }).map(e => [e.pid, e.role]), [[50, 'epicbox']]);
  //the wrapper is gone, its child still runs: the child
  assert.deepEqual(pickAdoptable(wprocs.slice(1), { walletBin: '"' + wb + '"', dir: WDIR, win: true }).map(e => e.pid), [51]);
});

test('M1: adopt runs once, only while there is no record file', async () => {
  const { file, done } = tmpFile();
  try {
    const sys = fakeSystem([]);
    const reg = createProcessRegistry({ fs, file, findProcess: sys.findProcess, kill: sys.kill, pidAlive: sys.pidAlive });
    const opts = { walletBin: BIN, nodeBin: NODE, dir: DIR, nodeConfig: DIR + '/epic-server.toml', network: 'mainnet' };
    //nothing runs (or the scan failed): no file, so the next start tries again
    assert.deepEqual(await reg.adopt(opts), []);
    assert.ok(!fs.existsSync(file));
    sys.procs.push(proc(1, `${BIN} --pass x -t ${DIR} -c ${DIR} listen --method epicbox --no_tor`));
    sys.procs.push(proc(2, `/home/u/epic/epic-wallet -c ${DIR} owner_api`));
    assert.deepEqual((await reg.adopt(opts)).map(e => e.pid), [1]);
    assert.ok(!fs.readFileSync(file, 'utf8').includes('--pass'));
    assert.deepEqual((await reg.list(['epicbox'], { dir: DIR })).map(p => p.pid), [1], 'reused, not started again');
    //once: a later start adopts nothing more
    sys.procs.push(proc(3, `${BIN} -c ${DIR} owner_api`));
    assert.deepEqual(await reg.adopt(opts), []);
    assert.deepEqual(reg.load().map(e => e.pid), [1]);
    //a failing scan does not throw
    const reg2 = createProcessRegistry({ fs, file: file + '2', findProcess: async () => { throw new Error('ps'); }, kill: sys.kill });
    assert.deepEqual(await reg2.adopt(opts), []);
  } finally {
    done();
  }
});
