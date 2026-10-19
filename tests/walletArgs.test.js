// Tests for src/shared/walletArgs.js: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ownerApiArgs, listenArgs, epicboxArgs, initArgs, statusMessageText, networkArgs, OWNER_API_START_DIR,
  PTY_KINDS, hasPassArg, withPassArg,
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

test('listeners and init: no password anywhere in their args (the pty prompt gets it)', () => {
  const cases = [
    [listenArgs({ network: 'mainnet', dir: DIR, password: PASS, tor: false }), 'listen'],
    [listenArgs({ network: 'floonet', dir: DIR, password: PASS, tor: true }), 'listen'],
    [epicboxArgs({ network: 'mainnet', dir: DIR, password: PASS }), 'epicbox'],
    [epicboxArgs({ network: 'usernet', dir: DIR, password: PASS }), 'epicbox'],
  ];
  for (const [args, role] of cases) {
    //even a caller that still passes one gets none
    assert.ok(!hasPassArg(args) && !args.includes(PASS), args.join(' '));
    assert.equal(describeSpawn(BIN, args).role, role);
    assert.equal(describeSpawn(BIN, args).dir, DIR);
  }
  assert.deepEqual(listenArgs({ network: 'mainnet', dir: DIR, tor: false }), ['-t', DIR, '-c', DIR, 'listen', '--method', 'http', '--no_tor']);
  assert.ok(!listenArgs({ network: 'mainnet', dir: DIR, tor: true }).includes('--no_tor'));
  assert.deepEqual(epicboxArgs({ network: 'floonet', dir: DIR }), ['--floonet', '-t', DIR, '-c', DIR, 'listen', '--method', 'epicbox', '--no_tor']);
  assert.deepEqual(initArgs({ network: 'usernet', dir: DIR, password: PASS }), ['--usernet', '-c', DIR, 'init']);
  assert.deepEqual(initArgs({ network: 'mainnet', dir: DIR, password: PASS, recover: true }), ['-c', DIR, 'init', '-r']);
  //init is not a tracked process
  assert.equal(describeSpawn(BIN, initArgs({ network: 'mainnet', dir: DIR })), null);
});

test('every pty kind says how many password prompts it answers', () => {
  assert.deepEqual(PTY_KINDS.listen, { passwords: 1, phrase: false });
  assert.deepEqual(PTY_KINDS.epicbox, { passwords: 1, phrase: false });
  assert.deepEqual(PTY_KINDS.init, { passwords: 2, phrase: false });
  assert.deepEqual(PTY_KINDS.recover, { passwords: 2, phrase: true });
});

test('fallback only: withPassArg puts --pass before the dir options, as before', () => {
  assert.deepEqual(withPassArg(listenArgs({ network: 'floonet', dir: DIR, tor: false }), PASS),
    ['--floonet', '--pass', PASS, '-t', DIR, '-c', DIR, 'listen', '--method', 'http', '--no_tor']);
  assert.deepEqual(withPassArg(initArgs({ network: 'mainnet', dir: DIR, recover: true }), PASS), ['--pass', PASS, '-c', DIR, 'init', '-r']);
  const args = withPassArg(epicboxArgs({ network: 'mainnet', dir: DIR }), PASS);
  assert.ok(hasPassArg(args));
  assert.deepEqual(describeSpawn(BIN, args), { role: 'epicbox', bin: BIN, dir: DIR, network: 'mainnet' });
  assert.ok(!redactArgs(args).includes(PASS), 'redacted for logs');
  assert.ok(hasPassArg(['--pass=x']) && hasPassArg(['-p', 'x']) && !hasPassArg(['-c', DIR]));
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
