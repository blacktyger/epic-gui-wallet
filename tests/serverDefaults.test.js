// The test gate's node and Epicbox server for new wallets (src/shared/settingsStore.js
// serverDefaultsFromEnv / setServerDefaults): an outage of node.epiccash.com or
// epicbox.epiccash.com must not fail the gate. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverDefaultsFromEnv, setServerDefaults, walletDefaults, WALLET_DEFAULTS } from '../src/shared/settingsStore.js';

test('nothing set: the official defaults', () => {
  assert.deepEqual(serverDefaultsFromEnv({}), {});
  assert.deepEqual(serverDefaultsFromEnv(undefined), {});
  setServerDefaults({});
  assert.equal(walletDefaults('mainnet').check_node_api_http_addr, 'https://node.epiccash.com:3413');
  assert.equal(walletDefaults('mainnet').epicbox_domain, 'epicbox.epiccash.com');
});

test('the gate sets a healthy node and Epicbox server: new mainnet wallets start with them', () => {
  const d = serverDefaultsFromEnv({ EPIC_GUI_DEFAULT_NODE: 'https://node.epicnet.us:3413/', EPIC_GUI_DEFAULT_EPICBOX: 'Epicbox.EpicNet.us' });
  assert.deepEqual(d, { check_node_api_http_addr: 'https://node.epicnet.us:3413', epicbox_domain: 'epicbox.epicnet.us' });
  setServerDefaults(d);
  try {
    assert.equal(walletDefaults('mainnet').check_node_api_http_addr, 'https://node.epicnet.us:3413');
    assert.equal(walletDefaults('mainnet').epicbox_domain, 'epicbox.epicnet.us');
    //floonet keeps its own local node, takes the Epicbox server
    assert.equal(walletDefaults('floonet').check_node_api_http_addr, 'http://127.0.0.1:13413');
    assert.equal(walletDefaults('floonet').epicbox_domain, 'epicbox.epicnet.us');
    //the constants stay as they are
    assert.equal(WALLET_DEFAULTS.check_node_api_http_addr, 'https://node.epiccash.com:3413');
  } finally {
    setServerDefaults({});
  }
});

test('anything that is not a plain node URL or domain is ignored', () => {
  for (const node of ['node.epicnet.us', 'ftp://x.y', 'https://x.y/path', 'https://a b', 'javascript:alert(1)', 'https://x.y:3413?q=1']) {
    assert.deepEqual(serverDefaultsFromEnv({ EPIC_GUI_DEFAULT_NODE: node }), {}, node);
  }
  for (const box of ['localhost', 'wss://epicbox.epicnet.us', 'a..b', 'x/y.z', 'epicbox.epicnet.us:443']) {
    assert.deepEqual(serverDefaultsFromEnv({ EPIC_GUI_DEFAULT_EPICBOX: box }), {}, box);
  }
  assert.deepEqual(serverDefaultsFromEnv({ EPIC_GUI_DEFAULT_NODE: 'http://127.0.0.1:13413' }), { check_node_api_http_addr: 'http://127.0.0.1:13413' });
});
