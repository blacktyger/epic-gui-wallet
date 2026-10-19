// Paths the GUI writes into epic-wallet.toml and epic-server.toml: run with `npm test` (node --test).
// A folder name with $&, $1, $', a quote or (on Linux/macOS) a backslash used to give a wrong path
// or a toml that epic-wallet could not parse.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tomlString } from '../src/shared/tomlString.js';

let root;
let ConfigService;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'toml-paths-'));
  //what configService needs from the preload script
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

//the value of `key = "..."` read back the way TOML reads a basic string (same escapes as JSON)
function readValue(toml, key) {
  const m = toml.match(new RegExp('^' + key + ' = (".*")$', 'm'));
  assert.ok(m, key + ' is a basic string on one line');
  return JSON.parse(m[1]);
}

const WALLET_TOML = [
  '[wallet]',
  'chain_type = "Mainnet"',
  'api_listen_port = 3415',
  'owner_api_include_foreign = false',
  'api_secret_path = "/old/.owner_api_secret"',
  'node_api_secret_path = "/old/.api_secret"',
  'check_node_api_http_addr = "http://127.0.0.1:3413"',
  'data_file_dir = "/old/wallet_data"',
  '',
  '[logging]',
  'stdout_log_level = "Warning"',
  'log_file_path = "/old/epic-wallet.log"',
  '',
  '[epicbox]',
  'epicbox_domain = "epicbox.epiccash.com"',
  'epicbox_port = 443',
  '',
].join('\n');

const ODD = ['plain', 'My Wallets', 'a$&b', 'pay$1', 'x$$y', "Marv$'s wallets", 'we"ird', 'back\\slash', 'Łukasz Żółć', 'สมชาย'];

test('tomlString escapes what a TOML basic string needs', () => {
  assert.equal(tomlString('C:\\Users\\Marv'), '"C:\\\\Users\\\\Marv"');
  assert.equal(tomlString('we"ird'), '"we\\"ird"');
  assert.equal(tomlString('Łukasz'), '"Łukasz"');
  assert.equal(tomlString('$&'), '"$&"');
});

for (const name of ODD) {
  test('epic-wallet.toml keeps the folder "' + name + '"', () => {
    const walletDir = path.join(root, name, 'test', 'main');
    fs.mkdirSync(walletDir, { recursive: true });
    fs.writeFileSync(path.join(walletDir, 'epic-wallet.toml'), WALLET_TOML);

    const cs = new ConfigService({ emit() {} });
    cs.config = { check_node_api_http_addr: 'https://node.example.org', nodesynced: true, epicbox_domain: 'epicbox.example.org' };
    cs.ownerApiSecretPath = path.join(walletDir, '.owner_api_secret');
    cs.apiSecretPath = path.join(walletDir, '.api_secret');
    assert.ok(cs.checkTomlFile(walletDir));

    const toml = fs.readFileSync(path.join(walletDir, 'epic-wallet.toml'), 'utf8');
    assert.equal(readValue(toml, 'data_file_dir'), path.join(walletDir, 'wallet_data'));
    assert.equal(readValue(toml, 'log_file_path'), path.join(walletDir, 'epic-wallet.log'));
    assert.equal(readValue(toml, 'api_secret_path'), cs.ownerApiSecretPath);
    assert.equal(readValue(toml, 'node_api_secret_path'), cs.apiSecretPath);
    assert.equal(readValue(toml, 'check_node_api_http_addr'), 'https://node.example.org');
    assert.equal(readValue(toml, 'epicbox_domain'), 'epicbox.example.org');
    assert.match(toml, /^owner_api_include_foreign = true$/m);
    //nothing else was pulled into the file by a replacement pattern
    assert.equal(toml.split('\n').length, WALLET_TOML.split('\n').length);
  });

  test('epic-server.toml keeps the folder "' + name + '"', () => {
    const walletDir = path.join(root, 'node-' + name, 'main');
    fs.mkdirSync(walletDir, { recursive: true });
    const cs = new ConfigService({ emit() {} });
    cs.tomlNetworkname = 'Mainnet';
    const tomlFile = cs.checkServerTomlFile(walletDir);
    assert.ok(tomlFile);

    const toml = fs.readFileSync(tomlFile, 'utf8');
    assert.equal(readValue(toml, 'db_root'), path.join(walletDir, 'chain_data'));
    assert.equal(readValue(toml, 'foundation_path'), path.join(walletDir, 'foundation.json'));
    assert.equal(readValue(toml, 'chain_type'), 'Mainnet');
  });
}
