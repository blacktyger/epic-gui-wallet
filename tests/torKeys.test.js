// Tests for src/shared/torKeys.js and walletToml.renderTorKeysToml: the one-shot onion key run (tor-616 §4). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureOnionKey } from '../src/shared/torKeys.js';
import { renderTorKeysToml, renderWalletToml } from '../src/shared/walletToml.js';
import { KEY_FILE_HEADER } from '../src/shared/onion.js';

const TEMPLATE = fs.readFileSync(path.join(import.meta.dirname, '..', 'resources', 'epic-wallet.toml'), 'utf8');
const SEED = '37c50a0cfaf343cbc594fde3cb29a88427d40891de34791f1d97f9d99e1e35d9';
const PROOF = '62be2076374085e7cbfee9869da228517248f8a51e92fc490f6b5f39afe9c372';
const ONION = 'mk7ca5rxicc6ps765gdj3irikfzer6ffd2jpysipnnpttl7jynzaluyd';

const torSection = (t) => t.slice(t.indexOf('[tor]'), t.indexOf('[', t.indexOf('[tor]') + 1));

test('the main toml keeps use_tor_listener = false; only the torkeys toml has true, with our SOCKS and its own port and dir', () => {
  const main = renderWalletToml({ template: TEMPLATE, network: 'mainnet', configDir: '/w/c', dataDir: '/w/d', nodeUrl: 'https://node.btlabs.uk' });
  assert.match(torSection(main), /^use_tor_listener = false$/m);
  const k = renderTorKeysToml({ template: TEMPLATE, network: 'mainnet', keysDir: '/w/c/tor-keys', dataDir: '/w/d',
    nodeUrl: 'https://node.btlabs.uk', socksPort: 39111, listenPort: 45001 });
  assert.match(torSection(k), /^use_tor_listener = true$/m);
  assert.match(torSection(k), /^socks_proxy_addr = "127\.0\.0\.1:39111"$/m);
  assert.match(torSection(k), /^send_config_dir = "\/w\/c\/tor-keys"$/m);
  assert.match(k, /^api_listen_port = 45001$/m);
  assert.match(k, /^data_file_dir = "\/w\/d\/wallet_data"$/m, 'the wallet\'s own seed');
  assert.match(k, /^log_file_path = "\/w\/c\/tor-keys\/epic-wallet\.log"$/m);
  assert.doesNotMatch(k, /node_api_secret_path/);
  assert.throws(() => renderTorKeysToml({ template: TEMPLATE, network: 'mainnet', keysDir: '/k', dataDir: '/d', socksPort: 0, listenPort: 1 }));
  assert.throws(() => renderTorKeysToml({ template: TEMPLATE, network: 'mainnet', keysDir: '/k', dataDir: '/d', socksPort: 9050, listenPort: 70000 }));
});

function keyBytes() {
  const header = Buffer.alloc(32);
  header.write(KEY_FILE_HEADER);
  return Buffer.concat([header, Buffer.from(SEED, 'hex'), Buffer.from(PROOF, 'hex')]);
}

/* a fake pty host: opts.write (ms) writes the key file then; opts.exit (ms) exits then */
function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'torkeys-'));
  const wallet = { network: 'mainnet', configDir: path.join(dir, 'c'), dataDir: path.join(dir, 'd'), nodeUrl: 'https://node.btlabs.uk' };
  fs.mkdirSync(wallet.configDir, { recursive: true });
  fs.mkdirSync(wallet.dataDir, { recursive: true });
  const keyFile = path.join(wallet.dataDir, 'wallet_tor', 'onion_service_addresses', ONION, 'hs_ed25519_secret_key');
  const h = { started: [], killed: [], tomlSeen: '', pw: null };
  h.ptyHost = {
    start: (req) => {
      h.started.push(req);
      h.pw = req.password;
      h.tomlSeen = fs.readFileSync(path.join(req.cwd, 'epic-wallet.toml'), 'utf8');
      if (opts.write !== undefined) setTimeout(() => { fs.mkdirSync(path.dirname(keyFile), { recursive: true }); fs.writeFileSync(keyFile, keyBytes()); }, opts.write);
      if (opts.exit !== undefined) setTimeout(() => req.onExit({ code: 1, signal: null, fail: null }), opts.exit);
      if (opts.lines) req.onLines(opts.lines);
      return { id: 7, pid: 99, mode: 'pty' };
    },
    kill: async (id) => { h.killed.push(id); return true; },
  };
  h.run = (extra = {}) => ensureOnionKey(Object.assign({ ptyHost: h.ptyHost, password: () => Buffer.from('spikepass'), bin: '/app/bin/linux/epic-wallet',
    fs, join: path.join, freePort: async () => 45001, template: TEMPLATE, wallet, onion: ONION, socksPort: 39111, timeoutMs: 400, pollMs: 10 }, extra));
  Object.assign(h, { dir, wallet, keyFile });
  return h;
}

test('a missing key: the one-shot runs with the session password, is stopped once the key is there, its toml removed', async () => {
  const h = setup({ write: 30 });
  assert.deepEqual(await h.run(), { ok: true });
  const s = h.started[0];
  assert.equal(s.kind, 'torkeys');
  assert.equal(s.bin, undefined);
  assert.equal(s.cmd, '/app/bin/linux/epic-wallet');
  assert.deepEqual(s.args, ['--offline_mode', '-t', h.wallet.dataDir, '-c', path.join(h.wallet.configDir, 'tor-keys'), 'listen', '--method', 'http']);
  assert.equal(s.cwd, path.join(h.wallet.configDir, 'tor-keys'), 'epic-wallet reads the toml of its working dir first');
  assert.equal(s.dir, h.wallet.dataDir);
  assert.equal(h.pw.toString(), 'spikepass');
  assert.match(h.tomlSeen, /use_tor_listener = true/);
  assert.deepEqual(h.killed, [7]);
  assert.equal(fs.existsSync(path.join(h.wallet.configDir, 'tor-keys', 'epic-wallet.toml')), false);
});

test('a key that is there already: nothing runs', async () => {
  const h = setup();
  fs.mkdirSync(path.dirname(h.keyFile), { recursive: true });
  fs.writeFileSync(h.keyFile, keyBytes());
  assert.deepEqual(await h.run(), { ok: true });
  assert.equal(h.started.length, 0);
});

test('no key in time: keys error, process stopped; an early exit says why; locked: nothing runs', async () => {
  let h = setup();
  let r = await h.run({ timeoutMs: 60 });
  assert.equal(r.ok, false);
  assert.match(r.detail, /no key after/);
  assert.deepEqual(h.killed, [7]);
  h = setup({ exit: 20, lines: ['ERROR: Wallet command failed: wrong password'] });
  r = await h.run();
  assert.equal(r.ok, false);
  assert.match(r.detail, /exited \(1\): ERROR: Wallet command failed/);
  h = setup();
  r = await h.run({ password: () => null });
  assert.deepEqual(r, { ok: false, detail: 'locked' });
  assert.equal(h.started.length, 0);
  r = await h.run({ onion: 'nope' });
  assert.equal(r.ok, false);
});

test('the onion folder without a good key is moved aside (never deleted), then the one-shot runs', async () => {
  for (const damaged of [null, Buffer.from('short')]) {
    const h = setup({ write: 20 });
    fs.mkdirSync(path.dirname(h.keyFile), { recursive: true });
    fs.writeFileSync(path.join(path.dirname(h.keyFile), 'hostname'), 'keep me');
    if (damaged) fs.writeFileSync(h.keyFile, damaged);
    assert.deepEqual(await h.run({ now: () => 1234 }), { ok: true });
    assert.equal(h.started.length, 1);
    const aside = path.dirname(h.keyFile) + '.bad-1234';
    assert.equal(fs.readFileSync(path.join(aside, 'hostname'), 'utf8'), 'keep me');
    assert.equal(fs.readFileSync(h.keyFile).length, 96);
  }
  //locked: nothing is moved
  const h = setup();
  fs.mkdirSync(path.dirname(h.keyFile), { recursive: true });
  await h.run({ password: () => null, now: () => 1 });
  assert.equal(fs.existsSync(path.dirname(h.keyFile)), true);
});
