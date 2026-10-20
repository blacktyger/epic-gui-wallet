// Tests for src/shared/walletToml.js: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderWalletToml, renderNodeToml, setTomlKeys, tomlValue, joinPath, networkPorts } from '../src/shared/walletToml.js';

const WALLET_TEMPLATE = fs.readFileSync(new URL('../resources/epic-wallet.toml', import.meta.url), 'utf8');
const NODE_TEMPLATE = fs.readFileSync(new URL('../resources/epic-server.toml', import.meta.url), 'utf8');

/* a small TOML reader for what the templates hold: [sections], key = "basic string" | number |
   bool | [array], comments. Basic strings are decoded by the TOML rules (not JSON.parse), so a
   value JSON.stringify wrote that TOML would read differently fails here. */
function decodeBasic(s) {
  assert.ok(s.startsWith('"') && s.endsWith('"') && s.length >= 2, 'basic string: ' + s);
  const body = s.slice(1, -1);
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"') throw new Error('unescaped quote in ' + s);
    if (c.charCodeAt(0) < 0x20 && c !== '\t') throw new Error('control char in ' + s);
    if (c !== '\\') { out += c; continue; }
    const e = body[++i];
    const simple = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
    if (e in simple) out += simple[e];
    else if (e === 'u') { out += String.fromCharCode(parseInt(body.slice(i + 1, i + 5), 16)); i += 4; }
    else if (e === 'U') { out += String.fromCodePoint(parseInt(body.slice(i + 1, i + 9), 16)); i += 8; }
    else throw new Error('bad escape \\' + e + ' in ' + s);
  }
  return out;
}

function readToml(text) {
  const out = {};
  let sec = '';
  out[sec] = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const h = /^\[([^\]]+)\]$/.exec(line);
    if (h) {
      sec = h[1];
      assert.ok(!(sec in out), 'section twice: ' + sec);
      out[sec] = {};
      continue;
    }
    const m = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    assert.ok(m, 'not a TOML line: ' + line);
    assert.ok(!(m[1] in out[sec]), 'key twice: ' + sec + '.' + m[1]);
    const v = m[2];
    out[sec][m[1]] = v.startsWith('"') ? decodeBasic(v) : v === 'true' ? true : v === 'false' ? false : /^-?\d+$/.test(v) ? Number(v) : v;
  }
  return out;
}

const HARD_WIN = 'C:\\Users\\Jane "JD" O\'Doe\\.epic-gui $& co\\wallets\\w2';
const HARD_OLD = 'D:\\Old Epic\\.epic\\alpha & beta\\main\\';

test('values: JSON strings are TOML basic strings, numbers and booleans plain', () => {
  for (const s of ['C:\\a b\\c', 'q"uo"te', '$&$1', 'tab\there', 'line\nbreak', 'ünï €', '\\\\server\\share']) {
    assert.equal(decodeBasic(tomlValue(s)), s);
  }
  assert.equal(tomlValue(443), '443');
  assert.equal(tomlValue(true), 'true');
  assert.throws(() => tomlValue(undefined));
  assert.equal(joinPath('C:\\x y\\', 'a'), 'C:\\x y\\a');
  assert.equal(joinPath('/home/j/', 'a'), '/home/j/a');
  assert.equal(joinPath('\\\\srv\\share', 'a'), '\\\\srv\\share\\a');
});

test('setTomlKeys: only the section given, commented keys left, missing keys added', () => {
  const t = '# top\n[a]\nx = 1\n#y = 2\n\n[b]\nx = 3\n';
  const r = readToml(setTomlKeys(t, 'b', { x: 'v', y: 'w' }));
  assert.deepEqual(r.a, { x: 1 });
  assert.deepEqual(r.b, { x: 'v', y: 'w' });
  const r2 = setTomlKeys(t, 'a', { y: 5 });
  assert.match(r2, /#y = 2/);
  assert.deepEqual(readToml(r2).a, { x: 1, y: 5 });
  assert.deepEqual(readToml(setTomlKeys(t, 'c', { z: true })).c, { z: true });
});

test('wallet toml per network: chain, ports, local node, every path ours', () => {
  const chains = { mainnet: 'Mainnet', floonet: 'Floonet', usernet: 'UserTesting' };
  for (const network of Object.keys(chains)) {
    const r = readToml(renderWalletToml({ template: WALLET_TEMPLATE, network, configDir: '/r/wallets/w1', dataDir: '/r/wallets/w1' }));
    const p = networkPorts(network);
    assert.equal(r.wallet.chain_type, chains[network]);
    assert.equal(r.wallet.api_listen_port, p.walletListener);
    assert.equal(r.wallet.owner_api_listen_port, 3420);
    assert.equal(r.wallet.check_node_api_http_addr, 'http://127.0.0.1:' + p.nodeApi);
    assert.equal(r.wallet.owner_api_include_foreign, true);
    assert.equal(r.wallet.data_file_dir, '/r/wallets/w1/wallet_data');
    assert.equal(r.wallet.api_secret_path, '/r/wallets/w1/.owner_api_secret');
    assert.ok(!('node_api_secret_path' in r.wallet), 'no node secret for a node that is not the built-in one');
    assert.equal(r.tor.send_config_dir, '/r/wallets/w1');
    assert.equal(r.tor.use_tor_listener, false);
    assert.equal(r.epicbox.epicbox_domain, 'epicbox.epiccash.com');
    assert.equal(r.epicbox.epicbox_port, 443);
    assert.equal(r.logging.stdout_log_level, 'Debug');
    assert.equal(r.logging.log_file_path, '/r/wallets/w1/epic-wallet.log');
    //no path of the template's placeholder is left
    assert.ok(!JSON.stringify(r).includes('WALLET_DIR'));
  }
  assert.deepEqual([3413, 13413, 23413].map((b, i) => networkPorts(['mainnet', 'floonet', 'usernet'][i]).walletListener), [3415, 13415, 23415]);
  assert.throws(() => renderWalletToml({ template: WALLET_TEMPLATE, network: 'testnet', configDir: '/a', dataDir: '/a' }));
  assert.throws(() => renderWalletToml({ template: WALLET_TEMPLATE, network: 'mainnet', configDir: '/a' }));
});

test('wallet toml matches what epic-wallet 4.1.0 itself writes, apart from the keys the GUI sets', () => {
  //the template is 4.1.0's mainnet default; the other networks differ only in these lines
  const r = readToml(renderWalletToml({ template: WALLET_TEMPLATE, network: 'floonet', configDir: '/r/w', dataDir: '/r/w' }));
  const t = readToml(WALLET_TEMPLATE);
  const set = { wallet: ['chain_type', 'api_listen_port', 'api_secret_path', 'node_api_secret_path', 'check_node_api_http_addr', 'owner_api_include_foreign', 'data_file_dir'],
    tor: ['use_tor_listener', 'send_config_dir'], epicbox: ['epicbox_domain', 'epicbox_port'], logging: ['stdout_log_level', 'log_file_path'] };
  assert.deepEqual(Object.keys(r), Object.keys(t));
  for (const sec of Object.keys(t)) {
    assert.deepEqual(Object.keys(r[sec]), Object.keys(t[sec]).filter(k => k !== 'node_api_secret_path'), sec);
    for (const k of Object.keys(t[sec])) if (!(set[sec] || []).includes(k)) assert.deepEqual(r[sec][k], t[sec][k], sec + '.' + k);
  }
});

test('no Tor: use_tor_listener is false in the template and in every toml written, also from an older true one', () => {
  assert.equal(readToml(WALLET_TEMPLATE).tor.use_tor_listener, false);
  //an older wallet's toml (6.1.2 and before: true) is rendered whole again from the template when it
  //is opened; even a template that still says true renders false
  const old = WALLET_TEMPLATE.replace(/^use_tor_listener = false$/m, 'use_tor_listener = true');
  assert.notEqual(old, WALLET_TEMPLATE);
  for (const network of ['mainnet', 'floonet', 'usernet']) {
    const text = renderWalletToml({ template: old, network, configDir: '/r/w', dataDir: '/old/main' });
    assert.equal(readToml(text).tor.use_tor_listener, false, network);
    assert.equal(text.match(/^\s*use_tor_listener\s*=/gm).length, 1);
  }
  //a template without the key gets it
  const none = WALLET_TEMPLATE.replace(/^use_tor_listener = false\r?\n/m, '');
  assert.equal(readToml(renderWalletToml({ template: none, network: 'mainnet', configDir: '/r/w', dataDir: '/r/w' })).tor.use_tor_listener, false);
});

test('wallet toml, Windows: an imported wallet whose data stays in its old folder, hard characters', () => {
  const text = renderWalletToml({ template: WALLET_TEMPLATE, network: 'mainnet', configDir: HARD_WIN, dataDir: HARD_OLD,
    nodeUrl: 'https://node.epiccash.com:3413', nodeApiSecretPath: 'C:\\Epic GUI\\node\\main\\.api_secret', epicboxDomain: 'epicbox.example.org' });
  const r = readToml(text);
  assert.equal(r.wallet.data_file_dir, 'D:\\Old Epic\\.epic\\alpha & beta\\main\\wallet_data');
  assert.equal(r.wallet.api_secret_path, HARD_WIN + '\\.owner_api_secret');
  assert.equal(r.wallet.node_api_secret_path, 'C:\\Epic GUI\\node\\main\\.api_secret');
  assert.equal(r.wallet.check_node_api_http_addr, 'https://node.epiccash.com:3413');
  assert.equal(r.tor.send_config_dir, HARD_WIN);
  assert.equal(r.logging.log_file_path, HARD_WIN + '\\epic-wallet.log');
  assert.equal(r.epicbox.epicbox_domain, 'epicbox.example.org');
  //nothing points into the old folder except wallet_data
  for (const [k, v] of Object.entries(r.wallet)) if (typeof v === 'string' && v.startsWith('D:')) assert.equal(k, 'data_file_dir');
  //the line itself, as epic-wallet reads it
  assert.ok(text.includes('data_file_dir = "D:\\\\Old Epic\\\\.epic\\\\alpha & beta\\\\main\\\\wallet_data"'));
  assert.ok(text.includes('\\"JD\\" O\'Doe'));
  //path.win32 agrees on the joins
  assert.equal(r.wallet.api_secret_path, path.win32.join(HARD_WIN, '.owner_api_secret'));
});

test('node toml per network: absolute paths, ports, chain type', () => {
  const chains = { mainnet: 'Mainnet', floonet: 'Floonet', usernet: 'UserTesting' };
  for (const network of Object.keys(chains)) {
    const p = networkPorts(network);
    const r = readToml(renderNodeToml({ template: NODE_TEMPLATE, network, nodeDir: '/r/node/x', foundationPath: '/r/node/x/foundation.json' }));
    assert.equal(r.server.chain_type, chains[network]);
    assert.equal(r.server.db_root, '/r/node/x/chain_data');
    assert.equal(r.server.api_secret_path, '/r/node/x/.api_secret');
    assert.equal(r.server.foundation_path, '/r/node/x/foundation.json');
    assert.equal(r.server.api_http_addr, '127.0.0.1:' + p.nodeApi);
    assert.equal(r.server.run_tui, false);
    assert.equal(r.server.skip_pow_validation, true);
    assert.equal(r['server.p2p_config'].port, p.nodeP2p);
    assert.equal(r['server.p2p_config'].seeding_type, network === 'usernet' ? 'None' : 'DNSSeed');
    assert.equal(r['server.stratum_mining_config'].wallet_listener_url, 'http://127.0.0.1:' + p.walletListener);
    assert.equal(r.logging.stdout_log_level, 'Debug');
  }
});

test('node toml, Windows: reused chain data in an old folder with spaces and quotes', () => {
  const nodeDir = 'C:\\Users\\Jane Doe\\.epic-gui\\node\\main';
  const chainDir = 'C:\\Users\\Jane Doe\\.epic\\"old" $& wallet\\main\\chain_data';
  const r = readToml(renderNodeToml({ template: NODE_TEMPLATE, network: 'mainnet', nodeDir, chainDir, foundationPath: nodeDir + '\\foundation.json' }));
  assert.equal(r.server.db_root, chainDir);
  assert.equal(r.server.api_secret_path, nodeDir + '\\.api_secret');
  assert.equal(r.server.foundation_path, nodeDir + '\\foundation.json');
});

test('chainTypeToNetwork / tomlNetwork: one rule for configService and legacyScan', async () => {
  const { chainTypeToNetwork, tomlNetwork, localNodeUrl } = await import('../src/shared/walletToml.js');
  assert.equal(chainTypeToNetwork('Mainnet'), 'mainnet');
  assert.equal(chainTypeToNetwork('Floonet'), 'floonet');
  assert.equal(chainTypeToNetwork('UserTesting'), 'usernet');
  assert.equal(chainTypeToNetwork('Usernet'), 'usernet');
  assert.equal(chainTypeToNetwork('usertesting'), 'usernet');
  assert.equal(chainTypeToNetwork('Testnet'), '');
  assert.equal(chainTypeToNetwork(undefined), '');
  assert.equal(tomlNetwork('[wallet]\nchain_type = "UserTesting"\n'), 'usernet');
  assert.equal(tomlNetwork('[wallet]\r\n  chain_type = "Floonet"\r\n'), 'floonet');
  assert.equal(tomlNetwork('[wallet]\n#chain_type = "Floonet"\nchain_type = "Mainnet"\n'), 'mainnet');
  assert.equal(tomlNetwork('[wallet]\n'), '');
  assert.equal(tomlNetwork(null), '');
  //every network's own template renders back to that network
  for (const network of ['mainnet', 'floonet', 'usernet']) {
    const t = renderWalletToml({ template: WALLET_TEMPLATE, network, configDir: '/c', dataDir: '/d' });
    assert.equal(tomlNetwork(t), network);
  }
  assert.equal(localNodeUrl('mainnet'), 'http://127.0.0.1:3413');
  assert.equal(localNodeUrl('floonet'), 'http://127.0.0.1:13413');
  assert.equal(localNodeUrl('usernet'), 'http://127.0.0.1:23413');
});

test('regression: a node address with a trailing slash never reaches epic-wallet (it would ask for //v2/foreign)', () => {
  for (const nodeUrl of ['https://node.example.org:3413/', 'https://node.example.org:3413//', '  https://node.example.org:3413/ ']) {
    const r = readToml(renderWalletToml({ template: WALLET_TEMPLATE, network: 'mainnet', configDir: '/a', dataDir: '/a', nodeUrl }));
    assert.equal(r.wallet.check_node_api_http_addr, 'https://node.example.org:3413');
  }
  //a path is kept (a node behind a reverse proxy), only its trailing slash goes
  const p = readToml(renderWalletToml({ template: WALLET_TEMPLATE, network: 'mainnet', configDir: '/a', dataDir: '/a', nodeUrl: 'https://host.example/epic/' }));
  assert.equal(p.wallet.check_node_api_http_addr, 'https://host.example/epic');
  const none = readToml(renderWalletToml({ template: WALLET_TEMPLATE, network: 'mainnet', configDir: '/a', dataDir: '/a', nodeUrl: '/' }));
  assert.equal(none.wallet.check_node_api_http_addr, 'http://127.0.0.1:3413');
});
