// Tests for src/shared/walletArgs.js: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  ownerApiArgs, listenArgs, epicboxArgs, initArgs, statusMessageText, networkArgs, OWNER_API_START_DIR,
} from '../src/shared/walletArgs.js';
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

test('listeners: -c the config dir, -t the data dir, the password (4.1.0 reads it only from a terminal otherwise)', () => {
  for (const network of NETS) {
    const cases = [
      [listenArgs({ network, configDir: CONF, dataDir: OLD, password: PASS, tor: false }), 'listen'],
      [listenArgs({ network, configDir: CONF, dataDir: OLD, password: PASS, tor: true }), 'listen'],
      [epicboxArgs({ network, configDir: CONF, dataDir: OLD, password: PASS }), 'epicbox'],
    ];
    for (const [args, role] of cases) {
      assert.deepEqual(args.slice(0, networkArgs(network).length), networkArgs(network));
      assert.equal(args[args.indexOf('--pass') + 1], PASS);
      assert.equal(args[args.indexOf('-c') + 1], CONF);
      assert.equal(args[args.indexOf('-t') + 1], OLD);
      const d = describeSpawn(BIN, args);
      assert.equal(d.role, role);
      assert.equal(d.dir, CONF);
      assert.equal(d.topDir, OLD);
      assert.equal(d.network, network);
      assert.ok(!redactArgs(args).includes(PASS), 'redacted for logs');
    }
  }
  assert.deepEqual(listenArgs({ network: 'mainnet', configDir: NEW, dataDir: NEW, password: PASS, tor: false }).slice(-3), ['--method', 'http', '--no_tor']);
  assert.ok(!listenArgs({ network: 'mainnet', configDir: NEW, dataDir: NEW, password: PASS, tor: true }).includes('--no_tor'));
  assert.throws(() => listenArgs({ network: 'mainnet', configDir: NEW, password: PASS }));
  assert.throws(() => epicboxArgs({ network: 'mainnet', dataDir: NEW, password: PASS }));
});

test('init and recover: -c the new wallet folder', () => {
  assert.deepEqual(initArgs({ network: 'usernet', configDir: NEW, password: PASS }), ['--usernet', '--pass', PASS, '-c', NEW, 'init']);
  assert.deepEqual(initArgs({ network: 'mainnet', configDir: NEW, password: PASS, recover: true }), ['--pass', PASS, '-c', NEW, 'init', '-r']);
  assert.deepEqual(initArgs({ network: 'floonet', configDir: NEW, password: PASS }).slice(0, 1), ['--floonet']);
  assert.equal(describeSpawn(BIN, initArgs({ network: 'mainnet', configDir: NEW, password: PASS })), null, 'init is not tracked');
  assert.throws(() => initArgs({ network: 'mainnet', password: PASS }));
});

test('Windows paths with spaces pass through unchanged', () => {
  const conf = 'C:\\Users\\Jane Doe\\AppData\\Local\\EpicCash\\Wallet\\wallets\\w2';
  const old = 'C:\\Users\\Jane Doe\\.epic\\alpha & co\\main';
  const args = listenArgs({ network: 'mainnet', configDir: conf, dataDir: old, password: PASS, tor: true });
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
