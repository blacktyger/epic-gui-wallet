// Tests for src/shared/walletArgs.js: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ownerApiArgs, listenArgs, epicboxArgs, initArgs, statusMessageText, networkArgs, OWNER_API_START_DIR,
} from '../src/shared/walletArgs.js';
import { describeSpawn, redactArgs } from '../src/shared/processOwnership.js';

const BIN = '/opt/epic/resources/bin/linux/epic-wallet';
const DIR = '/home/jane/.epic/main';
const START = DIR + '/' + OWNER_API_START_DIR;
const PASS = 'S3cret pass&word';

test('owner_api: no password, wallet config from -c, a start dir without a wallet as -t', () => {
  for (const network of ['mainnet', 'floonet', 'usernet']) {
    const args = ownerApiArgs({ network, dir: DIR, startDir: START, password: PASS });
    assert.ok(!args.some(a => /pass/i.test(a) || a === '-p' || a === PASS), args.join(' '));
    assert.deepEqual(args, [...networkArgs(network), '--offline_mode', '-c', DIR, '-t', START, 'owner_api']);
    //the process record still names the wallet dir
    assert.deepEqual(describeSpawn(BIN, args), { role: 'owner_api', bin: BIN, dir: DIR, network });
  }
});

test('owner_api refuses a missing or wallet start dir', () => {
  assert.throws(() => ownerApiArgs({ network: 'mainnet', dir: DIR }));
  assert.throws(() => ownerApiArgs({ network: 'mainnet', dir: DIR, startDir: DIR }));
  assert.throws(() => ownerApiArgs({ network: 'mainnet', startDir: START }));
});

test('listeners and init still take the password (4.1.0 reads it only from a terminal otherwise)', () => {
  const cases = [
    [listenArgs({ network: 'mainnet', dir: DIR, password: PASS, tor: false }), 'listen'],
    [listenArgs({ network: 'floonet', dir: DIR, password: PASS, tor: true }), 'listen'],
    [epicboxArgs({ network: 'mainnet', dir: DIR, password: PASS }), 'epicbox'],
  ];
  for (const [args, role] of cases) {
    assert.equal(args[args.indexOf('--pass') + 1], PASS);
    assert.equal(describeSpawn(BIN, args).role, role);
    assert.equal(describeSpawn(BIN, args).dir, DIR);
    assert.ok(!redactArgs(args).includes(PASS), 'redacted for logs');
  }
  assert.deepEqual(listenArgs({ network: 'mainnet', dir: DIR, password: PASS, tor: false }).slice(-3), ['--method', 'http', '--no_tor']);
  assert.ok(!listenArgs({ network: 'mainnet', dir: DIR, password: PASS, tor: true }).includes('--no_tor'));
  assert.deepEqual(initArgs({ network: 'usernet', dir: DIR, password: PASS }), ['--usernet', '--pass', PASS, '-c', DIR, 'init']);
  assert.deepEqual(initArgs({ network: 'mainnet', dir: DIR, password: PASS, recover: true }), ['--pass', PASS, '-c', DIR, 'init', '-r']);
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
