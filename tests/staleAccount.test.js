// An account whose folder was moved or deleted by hand: run with `npm test` (node --test).
// 6.1.0 went on to start epic-wallet in ~/.epic and hung at "Starting the wallet service".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let root;
let ConfigService;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-account-'));
  global.window = {
    config: {
      getUserHomedir: () => root,
      getPlatform: () => 'linux',
      getArch: () => 'x64',
      getResourcePath: () => path.resolve('resources'),
    },
    nodePath: path,
    nodeFs: fs,
    nodeChildProcess: {},
    debug: false,
  };
  ({ default: ConfigService } = await import('../src/shared/configService.js'));
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete global.window;
});

test('a deleted account folder gives init and names the folder; nothing is written', async () => {
  const gone = path.join(root, 'Desktop', 'EpicCash_Wallets', 'test');
  const cs = new ConfigService({ emit() {} });
  cs.appConfig = { account_dirs: [{ account: 'test', userhomedir: gone, network: 'mainnet', isdefault: false }] };
  const before = fs.readdirSync(path.join(root, '.epic'));

  assert.equal(await cs.startCheck('test'), 'init');
  assert.equal(cs.missingWalletDir, gone);
  //the wallet dir is not switched to the missing account (it stays at the ~/.epic default)
  assert.equal(cs.defaultAccountWalletdir, path.join(root, '.epic'));
  assert.deepEqual(fs.readdirSync(path.join(root, '.epic')), before);
  assert.equal(fs.existsSync(gone), false);
});

test('an account whose folder exists has no missing folder', async () => {
  const home = path.join(root, 'wallets', 'alpha');
  fs.mkdirSync(path.join(home, 'main'), { recursive: true });
  const cs = new ConfigService({ emit() {} });
  cs.appConfig = { account_dirs: [{ account: 'alpha', userhomedir: home, network: 'mainnet', isdefault: false }] };
  cs.missingWalletDir = 'left over from an earlier check';

  await cs.startCheck('alpha');
  assert.equal(cs.missingWalletDir, '');
  assert.equal(cs.defaultAccountWalletdir, path.join(home, 'main'));
});

test('a new wallet still defaults to ~/.epic after another account was checked', async () => {
  const home = path.join(root, 'My Wallets', 'test');
  fs.mkdirSync(path.join(home, 'main'), { recursive: true });
  const cs = new ConfigService({ emit() {} });
  cs.appConfig = { account_dirs: [{ account: 'test', userhomedir: home, network: 'mainnet', isdefault: false }] };

  await cs.startCheck('test');
  //defaultAccountWalletdir is now test's dir; walletdirField uses defaultWalletRoot for a new wallet
  assert.equal(cs.defaultAccountWalletdir, path.join(home, 'main'));
  assert.equal(cs.defaultWalletRoot, path.join(root, '.epic'));
});
