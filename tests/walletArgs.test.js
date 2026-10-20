// Tests for src/shared/walletArgs.js: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  ownerApiArgs, listenArgs, epicboxArgs, initArgs, statusMessageText, networkArgs, OWNER_API_START_DIR,
  PTY_KINDS, hasPassArg, withPassArg, checkPtyArgs,
} from '../src/shared/walletArgs.js';
import { createPtyHost } from '../src/shared/ptyHost.js';
import { checkSpawnArgs } from '../src/shared/walletArgs.js';
import { describeSpawn, redactArgs } from '../src/shared/processOwnership.js';

const BIN = '/opt/epic/resources/bin/linux/epic-wallet';
//a wallet made in 6.1: one folder; an imported one: 6.1's config dir, the data in the old folder
const NEW = '/home/jane/.epic-gui/wallets/w1';
const CONF = '/home/jane/.epic-gui/wallets/w2';
const OLD = '/home/jane/.epic/alpha/main';
const PASS = 'S3cret pass&word';
const NETS = ['mainnet', 'floonet', 'usernet'];

test('owner_api: no password, -c the config dir, -t a dir without a wallet inside it', () => {
  for (const network of NETS) {
    for (const [configDir, dataDir] of [[NEW, NEW], [CONF, OLD]]) {
      const startDir = path.join(configDir, OWNER_API_START_DIR);
      const args = ownerApiArgs({ network, configDir, dataDir, startDir, password: PASS });
      assert.ok(!args.some(a => /pass/i.test(a) || a === '-p' || a === PASS), args.join(' '));
      assert.deepEqual(args, [...networkArgs(network), '--offline_mode', '-c', configDir, '-t', startDir, 'owner_api']);
      //nothing of the imported wallet's folder is on the command line
      assert.ok(!args.some(a => a.startsWith(OLD)));
      //the process record names the wallet by its config dir
      const d = describeSpawn(BIN, args);
      assert.equal(d.role, 'owner_api');
      assert.equal(d.dir, configDir);
      assert.equal(d.network, network);
    }
  }
});

test('owner_api refuses a missing start dir, or one that holds the wallet', () => {
  assert.throws(() => ownerApiArgs({ network: 'mainnet', configDir: NEW }));
  assert.throws(() => ownerApiArgs({ network: 'mainnet', configDir: NEW, dataDir: NEW, startDir: NEW }));
  assert.throws(() => ownerApiArgs({ network: 'mainnet', configDir: CONF, dataDir: OLD, startDir: OLD }));
  assert.throws(() => ownerApiArgs({ network: 'mainnet', startDir: NEW + '/x' }));
});

test('listeners: -c the config dir, -t the data dir, no password (the pty prompt gets it)', () => {
  for (const network of NETS) {
    const cases = [
      [listenArgs({ network, configDir: CONF, dataDir: OLD, password: PASS }), 'listen'],
      [epicboxArgs({ network, configDir: CONF, dataDir: OLD, password: PASS }), 'epicbox'],
    ];
    for (const [args, role] of cases) {
      //even a caller that still passes one gets none
      assert.ok(!hasPassArg(args) && !args.includes(PASS), args.join(' '));
      assert.deepEqual(args.slice(0, networkArgs(network).length), networkArgs(network));
      assert.equal(args[args.indexOf('-c') + 1], CONF);
      assert.equal(args[args.indexOf('-t') + 1], OLD);
      const d = describeSpawn(BIN, args);
      assert.equal(d.role, role);
      assert.equal(d.dir, CONF);
      assert.equal(d.topDir, OLD);
      assert.equal(d.network, network);
    }
  }
  assert.deepEqual(listenArgs({ network: 'mainnet', configDir: NEW, dataDir: NEW }), ['-t', NEW, '-c', NEW, 'listen', '--method', 'http', '--no_tor']);
  assert.deepEqual(epicboxArgs({ network: 'floonet', configDir: CONF, dataDir: OLD }), ['--floonet', '-t', OLD, '-c', CONF, 'listen', '--method', 'epicbox', '--no_tor']);
  assert.throws(() => listenArgs({ network: 'mainnet', configDir: NEW }));
  assert.throws(() => epicboxArgs({ network: 'mainnet', dataDir: NEW }));
});

test('no Tor: every listener gets --no_tor, whatever a caller passes; the pty refuses a listener without it', () => {
  for (const network of NETS) {
    //an old caller's tor: true changes nothing
    for (const extra of [{}, { tor: true }, { tor: false }]) {
      const http = listenArgs(Object.assign({ network, configDir: CONF, dataDir: OLD }, extra));
      assert.equal(http.filter(a => a === '--no_tor').length, 1, http.join(' '));
      assert.equal(http[http.length - 1], '--no_tor');
    }
    const eb = epicboxArgs({ network, configDir: CONF, dataDir: OLD });
    assert.equal(eb.filter(a => a === '--no_tor').length, 1, eb.join(' '));
    //what a listener with Tor would look like: not started on the pty
    const withTor = listenArgs({ network, configDir: CONF, dataDir: OLD }).filter(a => a !== '--no_tor');
    assert.throws(() => checkPtyArgs('listen', withTor), /listen/);
    const ebTor = eb.filter(a => a !== '--no_tor');
    assert.throws(() => checkPtyArgs('epicbox', ebTor), /epicbox|listen/);
  }
});

test('init and recover: -c the new wallet folder, no password', () => {
  assert.deepEqual(initArgs({ network: 'usernet', configDir: NEW, password: PASS }), ['--usernet', '-c', NEW, 'init']);
  assert.deepEqual(initArgs({ network: 'mainnet', configDir: NEW, password: PASS, recover: true }), ['-c', NEW, 'init', '-r']);
  assert.deepEqual(initArgs({ network: 'floonet', configDir: NEW }).slice(0, 1), ['--floonet']);
  assert.equal(describeSpawn(BIN, initArgs({ network: 'mainnet', configDir: NEW })), null, 'init is not tracked');
  assert.throws(() => initArgs({ network: 'mainnet', password: PASS }));
});

test('checkPtyArgs accepts every 6.1 shape: listeners -t data dir -c config dir, init/recover -c only', () => {
  for (const network of NETS) {
    for (const [configDir, dataDir] of [[NEW, NEW], [CONF, OLD]]) {
      assert.deepEqual(checkPtyArgs('listen', listenArgs({ network, configDir, dataDir })), { dir: dataDir });
      assert.deepEqual(checkPtyArgs('epicbox', epicboxArgs({ network, configDir, dataDir })), { dir: dataDir });
    }
    assert.deepEqual(checkPtyArgs('init', initArgs({ network, configDir: NEW })), { dir: NEW });
    assert.deepEqual(checkPtyArgs('recover', initArgs({ network, configDir: NEW, recover: true })), { dir: NEW });
  }
  //Windows paths with spaces
  const conf = 'C:\\Users\\Jane Doe\\.epic-gui\\wallets\\w2';
  const old = 'C:\\Users\\Jane Doe\\.epic\\alpha & co\\main';
  assert.deepEqual(checkPtyArgs('listen', listenArgs({ network: 'mainnet', configDir: conf, dataDir: old })), { dir: old });
  //relative dirs, a listener without -t, another kind's command, a password: refused
  assert.throws(() => checkPtyArgs('listen', ['-t', 'wallets/w1', '-c', NEW, 'listen', '--method', 'http']), /dir/);
  assert.throws(() => checkPtyArgs('init', ['-c', '.', 'init']), /dir/);
  assert.throws(() => checkPtyArgs('listen', ['-c', CONF, 'listen', '--method', 'http', '--no_tor']), /missing dir/);
  assert.throws(() => checkPtyArgs('init', initArgs({ network: 'mainnet', configDir: NEW, recover: true })), /init command/);
  assert.throws(() => checkPtyArgs('listen', withPassArg(listenArgs({ network: 'mainnet', configDir: CONF, dataDir: OLD }), PASS)), /password/);
  //the owner API is never started on a pty
  assert.throws(() => checkPtyArgs('listen', ownerApiArgs({ network: 'mainnet', configDir: CONF, dataDir: OLD, startDir: CONF + '/owner_api_closed' })));
});

test('a listener runs only for the unlocked wallet: -t must be the dir the session password was set for', () => {
  const terms = [];
  const h = createPtyHost({
    loadPty: () => ({ spawn: (file, args, opts) => { const t = { pid: 100 + terms.length, args, opts, onData() {}, onExit() {}, write() {} }; terms.push(t); return t; } }),
    spawn: () => { throw new Error('no pipe spawn expected'); },
    killTree: async () => true,
    cwd: '/',
  });
  //session set for the imported wallet's data dir (walletService.start: setSessionPassword(password, dataDir))
  const args = listenArgs({ network: 'usernet', configDir: CONF, dataDir: OLD });
  assert.throws(() => h.start({ cmd: BIN, args, kind: 'listen', password: Buffer.from(PASS), dir: CONF }), /session/);
  assert.throws(() => h.start({ cmd: BIN, args: listenArgs({ network: 'usernet', configDir: NEW, dataDir: NEW }), kind: 'listen', password: Buffer.from(PASS), dir: OLD }), /session/);
  assert.equal(terms.length, 0);
  const r = h.start({ cmd: BIN, args, kind: 'listen', password: Buffer.from(PASS), dir: OLD });
  assert.equal(r.mode, 'pty');
  assert.deepEqual(terms[0].args, args);
});

test('every pty kind says how many password prompts it answers', () => {
  assert.deepEqual(PTY_KINDS.listen, { passwords: 1, phrase: false });
  assert.deepEqual(PTY_KINDS.epicbox, { passwords: 1, phrase: false });
  assert.deepEqual(PTY_KINDS.init, { passwords: 2, phrase: false });
  assert.deepEqual(PTY_KINDS.recover, { passwords: 2, phrase: true });
});

test('fallback only: withPassArg puts --pass before the dir options, as before', () => {
  assert.deepEqual(withPassArg(listenArgs({ network: 'floonet', configDir: CONF, dataDir: OLD }), PASS),
    ['--floonet', '--pass', PASS, '-t', OLD, '-c', CONF, 'listen', '--method', 'http', '--no_tor']);
  assert.deepEqual(withPassArg(initArgs({ network: 'mainnet', configDir: NEW, recover: true }), PASS), ['--pass', PASS, '-c', NEW, 'init', '-r']);
  const args = withPassArg(epicboxArgs({ network: 'mainnet', configDir: CONF, dataDir: OLD }), PASS);
  assert.ok(hasPassArg(args));
  const d = describeSpawn(BIN, args);
  assert.equal(d.role, 'epicbox');
  assert.equal(d.dir, CONF);
  assert.equal(d.topDir, OLD);
  assert.ok(!redactArgs(args).includes(PASS), 'redacted for logs');
  assert.ok(hasPassArg(['--pass=x']) && hasPassArg(['-p', 'x']) && !hasPassArg(['-c', NEW]));
});

test('Windows paths with spaces pass through unchanged', () => {
  const conf = 'C:\\Users\\Jane Doe\\.epic-gui\\wallets\\w2';
  const old = 'C:\\Users\\Jane Doe\\.epic\\alpha & co\\main';
  const args = listenArgs({ network: 'mainnet', configDir: conf, dataDir: old });
  assert.equal(args[args.indexOf('-c') + 1], conf);
  assert.equal(args[args.indexOf('-t') + 1], old);
  const o = ownerApiArgs({ network: 'mainnet', configDir: conf, dataDir: old, startDir: path.win32.join(conf, OWNER_API_START_DIR) });
  assert.equal(o[o.indexOf('-t') + 1], conf + '\\owner_api_closed');
});

test('no scan process: nothing builds scan args any more', async () => {
  const mod = await import('../src/shared/walletArgs.js');
  assert.ok(!Object.keys(mod).some(k => /scan/i.test(k)));
});

test('owner API status messages become one line', () => {
  assert.equal(statusMessageText({ Scanning: ['Checking 10 outputs', 40] }), 'Checking 10 outputs (40%)');
  assert.equal(statusMessageText({ ScanningComplete: 'Scanning Complete' }), 'Scanning Complete');
  assert.equal(statusMessageText({ FullScanWarn: '' }), 'FullScanWarn');
  assert.equal(statusMessageText(null), '');
});

test('checkSpawnArgs: the owner API and the node exactly as the app starts them', () => {
  const owner = ownerApiArgs({ network: 'floonet', configDir: NEW, dataDir: NEW, startDir: NEW + '/owner_api_closed' });
  assert.deepEqual(checkSpawnArgs('owner_api', owner), { configDir: NEW, startDir: NEW + '/owner_api_closed' });
  assert.deepEqual(checkSpawnArgs('node', ['server', '--config_file', '/home/jane/.epic-gui/node/main/epic-server.toml', 'run']),
    { configFile: '/home/jane/.epic-gui/node/main/epic-server.toml' });
  assert.deepEqual(checkSpawnArgs('node', ['--usernet', 'server', '--config_file', 'C:\\Users\\j\\.epic-gui\\node\\user\\epic-server.toml', 'run']),
    { configFile: 'C:\\Users\\j\\.epic-gui\\node\\user\\epic-server.toml' });
  for (const [role, args] of [
    ['owner_api', ['-c', NEW, 'send', '-m', 'file', '-d', '/home/jane/.bashrc', '1']],
    ['owner_api', ['--offline_mode', '-c', NEW, '-t', NEW, 'finalize', '-i', '/etc/passwd']],
    ['owner_api', ['--offline_mode', '-c', 'relative', '-t', NEW, 'owner_api']],
    ['owner_api', ['--pass', 'x', '--offline_mode', '-c', NEW, '-t', NEW, 'owner_api']],
    ['node', ['clean']],
    ['node', ['server', '--config_file', '/tmp/x.toml', 'run', '--extra']],
    ['node', 'server'],
    ['shell', ['-c', 'id']],
  ]) {
    assert.throws(() => checkSpawnArgs(role, args), undefined, JSON.stringify(args));
  }
});
