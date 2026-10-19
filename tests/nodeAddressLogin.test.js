// The node address in epic-wallet.toml after the login check (configService.startCheck): run with `npm test`.
// The one-time cleanup must reach the toml before epic-wallet starts, and the mainnet fallback node is
// for mainnet wallets only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let root;
let ConfigService;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'node-addr-login-'));
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

const short = { mainnet: 'main', floonet: 'floo', usernet: 'user' };

//an account set up by an older GUI: config.json and epic-wallet.toml in <home>/<net>
function account(name, network, config) {
  const home = path.join(root, name);
  const dir = path.join(home, short[network]);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ version: '5.0.4', locale: 'en', network, ...config }));
  fs.writeFileSync(path.join(dir, 'epic-wallet.toml'), [
    '[wallet]', 'check_node_api_http_addr = "http://old.example:3413"', 'data_file_dir = "/old/wallet_data"', '',
  ].join('\n'));
  const cs = new ConfigService({ emit() {} });
  cs.appConfig = { account_dirs: [{ account: name, userhomedir: home, network, isdefault: false }] };
  return { cs, dir };
}
const tomlAddr = (dir) => fs.readFileSync(path.join(dir, 'epic-wallet.toml'), 'utf8').match(/^check_node_api_http_addr = "(.*)"$/m)[1];
const savedConfig = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));

test('a dead 5.x fallback is replaced in config.json and epic-wallet.toml at the first login, once', async () => {
  const { cs, dir } = account('alpha', 'mainnet', { check_node_api_http_addr: 'https://fastepic.eu:3413', nodesynced: true });
  assert.equal(await cs.startCheck('alpha'), 'login');
  assert.equal(tomlAddr(dir), 'https://node.epiccash.com:3413');
  assert.equal(savedConfig(dir).check_node_api_http_addr, 'https://node.epiccash.com:3413');
  assert.equal(savedConfig(dir).node_address_checked, 1);
  assert.deepEqual(cs.nodeAddressChange, { from: 'https://fastepic.eu:3413', to: 'https://node.epiccash.com:3413', reason: 'dead_fallback' });

  //the next login says nothing
  const again = new ConfigService({ emit() {} });
  again.appConfig = cs.appConfig;
  await again.startCheck('alpha');
  assert.equal(again.nodeAddressChange, null);
});

test('a floonet wallet on the mainnet node gets the built-in node, also in the toml', async () => {
  const { cs, dir } = account('beta', 'floonet', { check_node_api_http_addr: 'https://node.epiccash.com:3413', nodesynced: true });
  await cs.startCheck('beta');
  assert.equal(tomlAddr(dir), 'http://127.0.0.1:3413');
  assert.equal(cs.nodeAddressChange.reason, 'mainnet_node_on_testnet');
});

test('the mainnet fallback is used while the built-in node syncs: mainnet only', async () => {
  for (const [name, network, expected] of [
    ['gamma', 'mainnet', 'https://node.epiccash.com:3413'],
    ['delta', 'floonet', 'http://127.0.0.1:3413'],
    ['epsilon', 'usernet', 'http://127.0.0.1:3413'],
  ]) {
    const { cs, dir } = account(name, network, { check_node_api_http_addr: 'http://127.0.0.1:3413', nodesynced: false });
    await cs.startCheck(name);
    assert.equal(tomlAddr(dir), expected, network);
    //the saved address stays the built-in node's
    assert.equal(savedConfig(dir).check_node_api_http_addr, 'http://127.0.0.1:3413');
  }
});
