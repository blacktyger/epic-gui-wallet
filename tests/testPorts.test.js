import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { portOffsetFromEnv, setPortOffset, ownerApiPort } from '../src/shared/testPorts.js';
import { networkPorts, localNodeUrl, renderWalletToml, renderNodeToml } from '../src/shared/walletToml.js';
import { contentSecurityPolicy, isWalletApiUrl, walletApiOrigin, WALLET_API_ORIGIN } from '../src/shared/security.js';
import { fallbackNodeAddress } from '../src/shared/importer.js';

const RES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'resources');
const WALLET_TEMPLATE = fs.readFileSync(path.join(RES, 'epic-wallet.toml'), 'utf8');
const NODE_TEMPLATE = fs.readFileSync(path.join(RES, 'epic-server.toml'), 'utf8');
const h = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/* what 6.1.5 (ec94b91, before the test offsets) rendered: sha256 prefixes of each output */
const GOLDEN = {
  'wallet-mainnet': '8d6bd0ecf7995741', 'node-mainnet': '13106656cbf1d4d9',
  'wallet-floonet': 'f49631834d616b00', 'node-floonet': '11a3f6b8e1f88004',
  'wallet-usernet': 'e16aa27d378c19a0', 'node-usernet': '8e66da47a920e3bf',
  csp: '966cb599c77a8249', cspDev: '6a0ac5f2e5e8e22c',
};
function rendered() {
  const out = {};
  for (const network of ['mainnet', 'floonet', 'usernet']) {
    out['wallet-' + network] = h(renderWalletToml({ template: WALLET_TEMPLATE, network, configDir: '/r/wallets/w1', dataDir: '/r/wallets/w1',
      nodeUrl: '', nodeApiSecretPath: '/r/node/.api_secret', epicboxDomain: 'epicbox.epicnet.us' }));
    out['node-' + network] = h(renderNodeToml({ template: NODE_TEMPLATE, network, nodeDir: '/r/node/main' }));
  }
  out.csp = h(contentSecurityPolicy());
  out.cspDev = h(contentSecurityPolicy({ dev: true, devServer: 'http://localhost:8080' }));
  return out;
}

test('the offset needs EPIC_GUI_TEST=1 and a whole number 1..9000', () => {
  assert.equal(portOffsetFromEnv({}), 0);
  assert.equal(portOffsetFromEnv(undefined), 0);
  assert.equal(portOffsetFromEnv({ EPIC_GUI_TEST_PORT_OFFSET: '100' }), 0);
  assert.equal(portOffsetFromEnv({ EPIC_GUI_TEST: 'true', EPIC_GUI_TEST_PORT_OFFSET: '100' }), 0);
  assert.equal(portOffsetFromEnv({ EPIC_GUI_TEST: '1' }), 0);
  assert.equal(portOffsetFromEnv({ EPIC_GUI_TEST: '1', EPIC_GUI_TEST_PORT_OFFSET: '100' }), 100);
  assert.equal(portOffsetFromEnv({ EPIC_GUI_TEST: '1', EPIC_GUI_TEST_PORT_OFFSET: ' 400 ' }), 400);
  assert.equal(portOffsetFromEnv({ EPIC_GUI_TEST: '1', EPIC_GUI_TEST_PORT_OFFSET: '9000' }), 9000);
  for (const bad of ['0', '9001', '-100', '1e3', '100.5', '0x64', '12345', 'abc'])
    assert.equal(portOffsetFromEnv({ EPIC_GUI_TEST: '1', EPIC_GUI_TEST_PORT_OFFSET: bad }), 0, bad);
});

test('no offset: every port and output exactly as in 6.1.5', () => {
  setPortOffset(0);
  assert.deepEqual(networkPorts('mainnet'), { nodeApi: 3413, nodeP2p: 3414, walletListener: 3415, stratum: 3416 });
  assert.deepEqual(networkPorts('floonet'), { nodeApi: 13413, nodeP2p: 13414, walletListener: 13415, stratum: 13416 });
  assert.equal(ownerApiPort(), 3420);
  assert.equal(walletApiOrigin(), 'http://127.0.0.1:3420');
  assert.equal(WALLET_API_ORIGIN, 'http://127.0.0.1:3420');
  assert.equal(localNodeUrl('mainnet'), 'http://127.0.0.1:3413');
  assert.equal(fallbackNodeAddress('', { network: 'usernet' }), 'http://127.0.0.1:23413');
  assert.ok(isWalletApiUrl('http://127.0.0.1:3420/v3/owner'));
  assert.deepEqual(rendered(), GOLDEN);
  setPortOffset(null);
});

test('an offset moves every port, the owner API address and the CSP', () => {
  setPortOffset(200);
  try {
    assert.deepEqual(networkPorts('mainnet'), { nodeApi: 3613, nodeP2p: 3614, walletListener: 3615, stratum: 3616 });
    assert.equal(ownerApiPort(), 3620);
    assert.equal(walletApiOrigin(), 'http://127.0.0.1:3620');
    assert.equal(localNodeUrl('mainnet'), 'http://127.0.0.1:3613');
    assert.equal(fallbackNodeAddress('', { network: 'floonet' }), 'http://127.0.0.1:13613');
    //the owner API secret goes to the moved port only
    assert.ok(isWalletApiUrl('http://127.0.0.1:3620/v3/owner'));
    assert.ok(!isWalletApiUrl('http://127.0.0.1:3420/v3/owner'));
    const csp = contentSecurityPolicy();
    assert.match(csp, /connect-src 'self' http:\/\/127\.0\.0\.1:3620(;|$)/);
    assert.doesNotMatch(csp, /3420/);
    const w = renderWalletToml({ template: WALLET_TEMPLATE, network: 'mainnet', configDir: '/r/w1', dataDir: '/r/w1', nodeUrl: '' });
    assert.match(w, /^api_listen_port = 3615$/m);
    assert.match(w, /^owner_api_listen_port = 3620$/m);
    assert.match(w, /^check_node_api_http_addr = "http:\/\/127\.0\.0\.1:3613"$/m);
    assert.doesNotMatch(w, /^[^#]*\b(3413|3415|3420)\b/m);
    const n = renderNodeToml({ template: NODE_TEMPLATE, network: 'mainnet', nodeDir: '/r/node/main' });
    assert.match(n, /^api_http_addr = "127\.0\.0\.1:3613"$/m);
    assert.match(n, /^port = 3614$/m);
    assert.match(n, /^stratum_server_addr = "127\.0\.0\.1:3616"$/m);
    assert.match(n, /^wallet_listener_url = "http:\/\/127\.0\.0\.1:3615"$/m);
    assert.doesNotMatch(n, /^[^#]*\b(3413|3414|3415|3416)\b/m);
  } finally {
    setPortOffset(null);
  }
});

test('the largest offset keeps each network below the next', () => {
  setPortOffset(9000);
  try {
    assert.ok(networkPorts('mainnet').stratum < 13413);
    assert.ok(ownerApiPort() < 13413);
    assert.ok(networkPorts('floonet').stratum < 23413);
    assert.ok(networkPorts('usernet').stratum <= 65535);
  } finally {
    setPortOffset(null);
  }
});
