// Tests for src/shared/epicboxConfig.js and src/shared/epicboxListener.js (npm test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEpicboxToml, normalizeEpicbox, sameServer, sameConfig, serverUrl, serverFromUrl, serverLabel,
  ownerApiEpicboxParams, withEpicboxSection, epicboxSwitchPlan,
} from '../src/shared/epicboxConfig.js';
import {
  createLineSplitter, parseListenerLine, wantsRefresh, createOldServerCheck, oldServerCheckStep, CHECK_TIMES,
  nodeNotReadyStart, resumesListening,
} from '../src/shared/epicboxListener.js';
import { epicboxStatus } from '../src/shared/epicboxStatus.js';
import { isEpicboxCheckDir } from '../src/shared/processOwnership.js';

test('status shows the server the listener is really on', () => {
  assert.deepEqual(epicboxStatus({ state: 'listening', server: 'wss://epicbox.epicnet.us:443' }, true), { kind: 'listening', server: 'epicbox.epicnet.us' });
  assert.deepEqual(epicboxStatus({ state: 'connecting', server: 'wss://x.y:8443' }, false), { kind: 'connecting', server: 'x.y:8443' });
  assert.deepEqual(epicboxStatus({ state: 'checking_old', server: 'wss://epicbox.epicnet.us:443', checking: 'wss://epicbox.epiccash.com:443' }, false),
    { kind: 'checking', server: 'epicbox.epicnet.us', checking: 'epicbox.epiccash.com' });
  assert.equal(epicboxStatus({ state: 'switching', server: 'wss://a.b:443' }, false).kind, 'starting');
  assert.equal(epicboxStatus({ state: 'paused', server: 'wss://a.b:443' }, true).kind, 'paused');
  //no event yet: the service flag
  assert.deepEqual(epicboxStatus({ state: '' }, true), { kind: 'listening', server: '' });
  assert.deepEqual(epicboxStatus(null, false), { kind: 'off', server: '' });
});

test('the old-server check dir is recognised on both platforms', () => {
  assert.ok(isEpicboxCheckDir('/home/u/.epic/main/epicbox_check'));
  assert.ok(isEpicboxCheckDir('C:\\Users\\u\\epic\\main\\epicbox_check\\'));
  assert.ok(!isEpicboxCheckDir('/home/u/.epic/main'));
  assert.ok(!isEpicboxCheckDir('/home/u/epicbox_check_not'));
  assert.ok(!isEpicboxCheckDir(''));
});

const TOML = `[wallet]
data_file_dir = "/home/u/.epic/user/wallet_data"
api_listen_port = 3415

#########################################
### EPICBOX CONFIGURATION ###
#########################################
[epicbox]
epicbox_domain = "epicbox.epiccash.com" # the relay
epicbox_port = 443

[logging]
stdout_log_level = "Debug"
`;

const epiccash = { domain: 'epicbox.epiccash.com', port: 443, unsecure: false, index: 0 };
const epicnet = { domain: 'epicbox.epicnet.us', port: 443, unsecure: false, index: 0 };

test('reads the [epicbox] section only, comments and quotes removed', () => {
  assert.deepEqual(parseEpicboxToml(TOML), { domain: 'epicbox.epiccash.com', port: 443, unsecure: null, index: null });
  assert.deepEqual(parseEpicboxToml('[epicbox]\nepicbox_domain = "a.b"\nepicbox_protocol_unsecure = true\nepicbox_address_index = 2\nepicbox_port = 8080'),
    { domain: 'a.b', port: 8080, unsecure: true, index: 2 });
  assert.equal(parseEpicboxToml('[wallet]\nepicbox_domain = "not.here"').domain, null);
  assert.equal(parseEpicboxToml('').domain, null);
});

test('defaults are the wallet\'s: 443 secure, 80 unsecure, index 0, epiccash.com', () => {
  assert.deepEqual(normalizeEpicbox({}), epiccash);
  assert.deepEqual(normalizeEpicbox({ domain: ' EpicBox.EpicNet.us ', unsecure: true }), { domain: 'epicbox.epicnet.us', port: 80, unsecure: true, index: 0 });
  assert.equal(normalizeEpicbox({ domain: '' }).domain, '');
});

test('server and config comparison', () => {
  assert.ok(sameServer(epiccash, { domain: 'epicbox.epiccash.com' }));
  assert.ok(!sameServer(epiccash, epicnet));
  assert.ok(!sameServer(epiccash, { domain: 'epicbox.epiccash.com', port: 444 }));
  assert.ok(!sameServer(epiccash, { domain: 'epicbox.epiccash.com', unsecure: true, port: 443 }));
  assert.ok(sameServer(epiccash, { ...epiccash, index: 3 }));
  assert.ok(!sameConfig(epiccash, { ...epiccash, index: 3 }));
  assert.ok(!sameServer(null, epiccash));
});

test('urls as the wallet logs them, and back', () => {
  assert.equal(serverUrl(epicnet), 'wss://epicbox.epicnet.us:443');
  assert.equal(serverUrl({ domain: 'x.y', unsecure: true }), 'ws://x.y:80');
  assert.deepEqual(serverFromUrl('wss://epicbox.epicnet.us:443'), { domain: 'epicbox.epicnet.us', port: 443, unsecure: false });
  assert.deepEqual(serverFromUrl('ws://x.y'), { domain: 'x.y', port: 80, unsecure: true });
  assert.equal(serverFromUrl('https://x.y'), null);
  assert.equal(serverLabel(epicnet), 'epicbox.epicnet.us');
  assert.equal(serverLabel({ domain: 'x.y', port: 8443 }), 'x.y:8443');
  assert.equal(serverLabel(null), '');
});

test('owner API params of set_epicbox_config (4.1.0 owner_rpc_s.rs)', () => {
  assert.deepEqual(ownerApiEpicboxParams({ domain: 'epicbox.epicnet.us', index: 1 }), {
    epicbox_config: { epicbox_domain: 'epicbox.epicnet.us', epicbox_port: 443, epicbox_protocol_unsecure: false, epicbox_address_index: 1 },
  });
});

test('the toml for the old-server check changes the [epicbox] section only', () => {
  const out = withEpicboxSection(TOML, epicnet);
  const parsed = parseEpicboxToml(out);
  assert.equal(parsed.domain, 'epicbox.epicnet.us');
  assert.equal(parsed.port, 443);
  assert.equal(parsed.unsecure, false);
  assert.ok(out.includes('data_file_dir = "/home/u/.epic/user/wallet_data"'));
  assert.ok(out.includes('stdout_log_level = "Debug"'));
  assert.ok(out.includes('[logging]'));
  //no section yet
  const added = withEpicboxSection('[wallet]\napi_listen_port = 1\n', { domain: 'a.b', port: 81 });
  assert.deepEqual(parseEpicboxToml(added), { domain: 'a.b', port: 81, unsecure: false, index: null });
  //a domain is quoted
  assert.ok(withEpicboxSection(TOML, { domain: 'a"b' }).includes('epicbox_domain = "a\\"b"'));
});

test('switch plan: server change with a listener running restarts it and checks the old server', () => {
  const p = epicboxSwitchPlan({ saved: epiccash, next: epicnet, listener: epiccash });
  assert.deepEqual(p, { setOwnerConfig: true, restart: true, checkOld: epiccash, start: true });
});

test('switch plan: no listener: only the owner API is told', () => {
  assert.deepEqual(epicboxSwitchPlan({ saved: epiccash, next: epicnet, listener: null }),
    { setOwnerConfig: true, restart: false, checkOld: null, start: false });
});

test('switch plan: nothing changed, listener on the right server: nothing to do', () => {
  assert.deepEqual(epicboxSwitchPlan({ saved: epiccash, next: { ...epiccash }, listener: epiccash }),
    { setOwnerConfig: false, restart: false, checkOld: null, start: false });
});

test('switch plan: settings unchanged but the listener is still on the old server (6.1.0 bug, background Epicbox)', () => {
  const p = epicboxSwitchPlan({ saved: epicnet, next: epicnet, listener: epiccash });
  assert.deepEqual(p, { setOwnerConfig: false, restart: true, checkOld: epiccash, start: true });
});

test('switch plan: address index only: owner API, no restart (the 4.1.0 listener always uses index 0)', () => {
  assert.deepEqual(epicboxSwitchPlan({ saved: epiccash, next: { ...epiccash, index: 1 }, listener: epiccash }),
    { setOwnerConfig: true, restart: false, checkOld: null, start: false });
});

test('switch plan: port or protocol change restarts', () => {
  assert.equal(epicboxSwitchPlan({ saved: epiccash, next: { ...epiccash, port: 8443 }, listener: epiccash }).restart, true);
  assert.equal(epicboxSwitchPlan({ saved: epiccash, next: { ...epiccash, unsecure: true }, listener: epiccash }).restart, true);
});

test('switch plan: listener on an unknown server: restart, check the old setting', () => {
  assert.deepEqual(epicboxSwitchPlan({ saved: epiccash, next: epicnet, listener: { unknown: true } }),
    { setOwnerConfig: true, restart: true, checkOld: epiccash, start: true });
  //unknown, and the settings did not change: restart, no old server to check
  assert.deepEqual(epicboxSwitchPlan({ saved: epicnet, next: epicnet, listener: { unknown: true } }),
    { setOwnerConfig: false, restart: true, checkOld: null, start: true });
});

test('switch plan: Epicbox turned off: stop the listener, start nothing, check nothing', () => {
  assert.deepEqual(epicboxSwitchPlan({ saved: epiccash, next: { domain: '' }, listener: epiccash }),
    { setOwnerConfig: false, restart: true, checkOld: null, start: false });
});

// ---------------------------------------------------------------- listener output

test('stdout chunks are split into whole lines', () => {
  const push = createLineSplitter();
  assert.deepEqual(push('a\nb'), ['a']);
  assert.deepEqual(push('c\r\nd\n'), ['bc', 'd']);
  assert.deepEqual(push(''), []);
});

test('the server the listener connects to', () => {
  const ev = parseListenerLine('20261019 00:24:21.531 DEBUG epic_wallet_impls::adapters::epicbox - Connecting to the epicbox server at wss://epicbox.epicnet.us:443 ..');
  assert.equal(ev.type, 'connecting');
  assert.equal(ev.url, 'wss://epicbox.epicnet.us:443');
  assert.deepEqual(ev.server, { domain: 'epicbox.epicnet.us', port: 443, unsecure: false });
  //colour codes
  assert.equal(parseListenerLine('\u001b[34mDEBUG\u001b[0m Connecting to the epicbox server at ws://x.y:80 ..').url, 'ws://x.y:80');
});

test('listener events', () => {
  assert.deepEqual(parseListenerLine('INFO - Starting epicbox listener for: esXYZ@epicbox.epicnet.us'), { type: 'listening', address: 'esXYZ@epicbox.epicnet.us' });
  assert.equal(parseListenerLine('INFO - Starting epicbox subscription...').type, 'subscribed');
  assert.equal(parseListenerLine('WARN - Node not synced, pausing Epicbox message processing...').type, 'paused');
  assert.equal(parseListenerLine('ERROR - Error in listener loop (x)').type, 'disconnected');
  const id = '2e81b617-d22c-4cee-b2c6-224da874d31a';
  assert.deepEqual(parseListenerLine(`DEBUG - Slate [${id}] received from [es1@a.b] for [1.0] epics`), { type: 'slate', stage: 'received', id });
  assert.deepEqual(parseListenerLine(`DEBUG - Slate [${id}] received back from [es1@a.b] for [1.0] epics`), { type: 'slate', stage: 'reply', id });
  assert.equal(parseListenerLine('INFO - Receive new transaction (foreign::receive_tx)').stage, 'signing');
  assert.equal(parseListenerLine('INFO - Finalize transaction (owner::finalize_tx)').stage, 'finalizing');
  assert.equal(parseListenerLine('DEBUG - Slate sent successfully!').stage, 'replied');
  assert.deepEqual(parseListenerLine(`INFO - Slate [${id}] finalized successfully`), { type: 'slate', stage: 'finalized', id });
  assert.equal(parseListenerLine(`INFO - Transaction with slate_id ${id} found in mempool and marked as TxSentMempool.`).stage, 'mempool');
  assert.equal(parseListenerLine('ERROR - Error process incoming slate. X').stage, 'failed');
  assert.deepEqual(parseListenerLine('DEBUG - Response Ok.'), { type: 'alive' });
  assert.equal(parseListenerLine(''), null);
});

/* final 6.1.6 QA bug 1: one "pausing" line when the node blipped, then "Response Ok." every minute and
   no "resumed" line; the status said Connecting… for the rest of the session */
test('paused, then a sign of life: listening again', () => {
  const log = [
    '20261021 05:17:35.534 WARN epic_wallet_impls::adapters::epicbox - Node not synced, pausing Epicbox message processing...',
    '20261021 05:17:40.534 DEBUG epic_wallet_impls::adapters::epicbox - Response Ok.',
  ].map(parseListenerLine);
  assert.deepEqual(log, [{ type: 'paused' }, { type: 'alive' }]);
  assert.ok(!resumesListening(log[0]));
  assert.ok(resumesListening(log[1]));
  assert.ok(resumesListening({ type: 'subscribed' }));
  assert.ok(resumesListening(parseListenerLine('DEBUG - Slate [2e81b617-d22c-4cee-b2c6-224da874d31a] received from [es1@a.b] for [1.0] epics')));
  assert.ok(!resumesListening({ type: 'disconnected' }));
  assert.ok(!resumesListening({ type: 'node_not_ready' }));
  assert.ok(!resumesListening(null));
  //the whole line's end, not the words inside another message
  assert.equal(parseListenerLine('DEBUG - Response Ok. extra'), null);
});

/* 6.1.5 rig "Epicbox server switch back" (1 in 3): the new listener asked the node at its start, got
   "syncing" for a moment, exited, and nothing started it again */
test('a listener that stopped at its start because the node was not ready is started again', () => {
  const line = '20261021 00:37:53.878 ERROR epic_wallet::cmd::wallet - Node is currently syncing. Please wait until the node is fully synced.';
  assert.deepEqual(parseListenerLine(line), { type: 'node_not_ready' });
  assert.deepEqual(parseListenerLine('ERROR - Failed to check node sync status: x'), { type: 'node_not_ready' });
  assert.ok(nodeNotReadyStart({ success: false, msg: 'node not synced', pid: 7 }));
  assert.ok(!nodeNotReadyStart({ success: true, pid: 7 }));
  assert.ok(!nodeNotReadyStart({ success: false, pending: true, msg: 7 }));
  assert.ok(!nodeNotReadyStart({ success: false, msg: 'exited', exited: true }));
  assert.ok(!nodeNotReadyStart({ success: false, noSession: true }));
  assert.ok(!nodeNotReadyStart(null));
});

test('refresh when the wallet data changed, not on every line', () => {
  assert.ok(wantsRefresh({ type: 'slate', stage: 'replied' }));
  assert.ok(wantsRefresh({ type: 'slate', stage: 'finalized' }));
  assert.ok(wantsRefresh({ type: 'slate', stage: 'mempool' }));
  assert.ok(!wantsRefresh({ type: 'slate', stage: 'received' }));
  assert.ok(!wantsRefresh({ type: 'connecting' }));
  assert.ok(!wantsRefresh(null));
});

// ---------------------------------------------------------------- old-server check

function run(events, end = CHECK_TIMES.max + 1000, step = 500) {
  //events: [ms, event]
  let s = createOldServerCheck(0);
  const queue = events.slice();
  for (let t = 0; t <= end; t += step) {
    while (queue.length && queue[0][0] <= t) {
      const r = oldServerCheckStep(s, queue.shift()[1], t);
      s = r.state;
      if (r.done) return { t, why: r.why, handled: s.handled };
    }
    const r = oldServerCheckStep(s, null, t);
    s = r.state;
    if (r.done) return { t, why: r.why, handled: s.handled };
  }
  return null;
}

test('old server empty: stops 15 s after subscribing', () => {
  const r = run([[1500, { type: 'listening' }], [1600, { type: 'subscribed' }]]);
  assert.equal(r.why, 'empty');
  assert.ok(r.t >= 1600 + CHECK_TIMES.idle && r.t < 1600 + CHECK_TIMES.idle + 1000);
});

test('old server with a queued payment: waits until the answer is posted, then idle', () => {
  const r = run([
    [1500, { type: 'subscribed' }],
    [3000, { type: 'slate', stage: 'received' }],
    [3100, { type: 'slate', stage: 'signing' }],
    [3300, { type: 'slate', stage: 'replied' }],
  ]);
  assert.equal(r.why, 'drained');
  assert.equal(r.handled, 1);
  assert.ok(r.t >= 3300 + CHECK_TIMES.idle);
});

test('a slate still being handled keeps it running past the idle time, up to the busy limit', () => {
  const r = run([[1000, { type: 'subscribed' }], [2000, { type: 'slate', stage: 'finalizing' }]]);
  assert.equal(r.why, 'timeout');
  assert.ok(r.t >= 2000 + CHECK_TIMES.busy);
});

test('no connection to the old server: gives up after 30 s', () => {
  const r = run([]);
  assert.equal(r.why, 'no_connection');
  assert.equal(r.t, CHECK_TIMES.connect);
});

test('never longer than the maximum, and stops when the process ends', () => {
  const ev = [[0, { type: 'subscribed' }]];
  for (let t = 5000; t < CHECK_TIMES.max + 10000; t += 5000) ev.push([t, { type: 'slate', stage: 'received' }]);
  assert.equal(run(ev).why, 'timeout');
  assert.ok(run(ev).t <= CHECK_TIMES.max);
  assert.equal(run([[2000, { type: 'exit' }]]).why, 'exited');
});
