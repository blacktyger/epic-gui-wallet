// Tests for src/shared/torSend.js: sending to an onion with a fake owner API and a fake foreign call (tor-616 §5). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendOverTor, slateVersionFrom } from '../src/shared/torSend.js';

const ONION = 'mk7ca5rxicc6ps765gdj3irikfzer6ffd2jpysipnnpttl7jynzaluyd';
const V = (api, slates) => ({ jsonrpc: '2.0', id: 1, result: { Ok: { foreign_api_version: api, supported_slate_versions: slates } } });
const TX = { src_acct_name: null, amount: '1000000', minimum_confirmations: 10, max_outputs: 500, message: '', target_slate_version: null,
  ttl_blocks: null, payment_proof_recipient_address: null, send_args: { method: 'http' } };

/* a fake wallet + recipient; over: per-call answers */
function fake(over = {}) {
  const calls = [];
  const ok = (v) => ({ jsonrpc: '2.0', id: 1, result: { Ok: v } });
  const api = {
    initSend: async (a) => { calls.push(['init_send_tx', a]); return over.initSend ? over.initSend(a) : ok({ id: 'slate-1', v: 'mine' }); },
    lockOutputs: async (s) => { calls.push(['tx_lock_outputs', s]); return over.lock ? over.lock(s) : ok(null); },
    finalize: async (s) => { calls.push(['finalize_tx', s]); return over.finalize ? over.finalize(s) : ok({ id: 'slate-1', tx: { kernel: 'k' } }); },
    post: async (tx, fluff) => { calls.push(['post_tx', tx, fluff]); return over.post ? over.post(tx) : ok(null); },
    cancel: async (id) => { calls.push(['cancel_tx', id]); return over.cancel ? over.cancel(id) : ok(null); },
  };
  const foreign = async (method, params) => {
    calls.push(['foreign ' + method, params]);
    if (method === 'check_version') return over.version ? over.version() : { ok: true, result: V(2, ['V3', 'V2']) };
    return over.receive ? over.receive(params) : { ok: true, result: ok({ id: 'slate-1', v: 'theirs' }) };
  };
  const steps = [];
  const run = (extra = {}) => sendOverTor(Object.assign({ api, foreign, torReady: () => true, txData: TX, onion: ONION, fluff: false,
    onStep: (s) => steps.push(s) }, extra));
  return { calls, steps, run };
}

test('the order: check_version → init_send_tx (no send_args, V3) → receive_tx → lock with their slate → finalize → post', async () => {
  const f = fake();
  const r = await f.run();
  assert.deepEqual(r, { ok: true, slate: { id: 'slate-1', tx: { kernel: 'k' } }, slateId: 'slate-1' });
  assert.deepEqual(f.calls.map(c => c[0]), ['foreign check_version', 'init_send_tx', 'foreign receive_tx', 'tx_lock_outputs', 'finalize_tx', 'post_tx']);
  const init = f.calls[1][1];
  assert.equal(init.send_args, null);
  assert.equal(init.target_slate_version, 3);
  assert.equal(init.amount, '1000000');
  assert.deepEqual(f.calls[2][1], [{ id: 'slate-1', v: 'mine' }, null, null, null]);
  assert.deepEqual(f.calls[3][1], { id: 'slate-1', v: 'theirs' }, 'the outputs are locked with the slate the recipient returned');
  assert.deepEqual(f.calls[4][1], { id: 'slate-1', v: 'theirs' });
  assert.deepEqual(f.calls[5].slice(1), [{ kernel: 'k' }, false], 'fluff from the Dandelion switch');
  assert.deepEqual(f.steps, ['connecting', 'signing', 'posting']);
});

test('slate versions: V3, else V2, as adapters/http.rs; foreign API < 2 or no V2/V3 is too old; anything else isn\'t Epic', () => {
  assert.deepEqual(slateVersionFrom(V(2, ['V3', 'V2'])), { version: 3 });
  assert.deepEqual(slateVersionFrom(V(2, ['V2'])), { version: 2 });
  assert.equal(slateVersionFrom(V(1, ['V2'])).code, 'too_old');
  assert.equal(slateVersionFrom(V(2, ['V1'])).code, 'too_old');
  assert.equal(slateVersionFrom({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' } }).code, 'not_epic');
  assert.equal(slateVersionFrom({ jsonrpc: '2.0', result: { Ok: { foo: 1 } } }).code, 'not_epic');
  assert.equal(slateVersionFrom(null).code, 'not_epic');
});

test('V2 recipient: init_send_tx targets V2', async () => {
  const f = fake({ version: () => ({ ok: true, result: V(2, ['V2']) }) });
  await f.run();
  assert.equal(f.calls[1][1].target_slate_version, 2);
});

test('before anything is locked: invalid, tor off, each foreign failure, too old, create, refused — no lock, no cancel', async () => {
  const cases = [
    [{}, { onion: ONION.slice(0, 55) + 'a' }, 'invalid'],
    [{}, { torReady: () => false }, 'tor_off'],
    [{ version: () => ({ ok: false, code: 'unreachable', detail: 'socks 0xf0' }) }, {}, 'unreachable'],
    [{ version: () => ({ ok: false, code: 'invalid', detail: 'socks 0xf6' }) }, {}, 'invalid'],
    [{ version: () => ({ ok: false, code: 'broken', detail: 'closed' }) }, {}, 'broken'],
    [{ version: () => ({ ok: false, code: 'auth', detail: 'socks 0xf4' }) }, {}, 'auth'],
    [{ version: () => ({ ok: false, code: 'not_epic', detail: 'HTTP 404' }) }, {}, 'not_epic'],
    [{ version: () => ({ ok: true, result: V(1, ['V2']) }) }, {}, 'too_old'],
    [{ initSend: () => ({ jsonrpc: '2.0', result: { Err: { NotEnoughFunds: { available: 1 } } } }) }, {}, 'create'],
    [{ receive: () => ({ ok: false, code: 'unreachable', detail: 'timeout' }) }, {}, 'unreachable'],
    [{ receive: () => ({ ok: true, result: { jsonrpc: '2.0', error: { message: 'Wallet is locked' } } }) }, {}, 'refused'],
    [{ receive: () => ({ ok: true, result: { jsonrpc: '2.0', result: { Err: 'Duplicate slate' } } }) }, {}, 'refused'],
  ];
  for (const [over, extra, code] of cases) {
    const f = fake(over);
    const r = await f.run(extra);
    assert.equal(r.ok, false);
    assert.equal(r.code, code, JSON.stringify(over) + JSON.stringify(Object.keys(extra)));
    assert.ok(!f.calls.some(c => ['tx_lock_outputs', 'finalize_tx', 'post_tx', 'cancel_tx'].includes(c[0])), code);
  }
  const f = fake({ receive: () => ({ ok: true, result: { jsonrpc: '2.0', error: { message: 'Wallet is locked' } } }) });
  assert.equal((await f.run()).detail, 'Wallet is locked', 'the recipient\'s message');
});

test('a failed lock: finalize error, nothing to cancel', async () => {
  const f = fake({ lock: () => ({ jsonrpc: '2.0', result: { Err: 'locked' } }) });
  const r = await f.run();
  assert.equal(r.code, 'finalize');
  assert.ok(!f.calls.some(c => c[0] === 'cancel_tx' || c[0] === 'finalize_tx'));
});

test('a failed finalize cancels the transaction by slate id', async () => {
  const f = fake({ finalize: () => ({ jsonrpc: '2.0', result: { Err: 'bad signature' } }) });
  const r = await f.run();
  assert.deepEqual([r.code, r.slateId], ['finalize', 'slate-1']);
  assert.deepEqual(f.calls.at(-1), ['cancel_tx', 'slate-1']);
  assert.ok(!f.calls.some(c => c[0] === 'post_tx'));
});

test('a failed finalize whose cancel fails too: finalize_pending, the tx is still pending in Activity', async () => {
  let f = fake({ finalize: () => ({ jsonrpc: '2.0', result: { Err: 'bad signature' } }), cancel: () => ({ jsonrpc: '2.0', result: { Err: 'TransactionDoesntExist' } }) });
  let r = await f.run();
  assert.deepEqual([r.ok, r.code, r.slateId], [false, 'finalize_pending', 'slate-1']);
  assert.match(r.detail, /bad signature.*; cancel: .*TransactionDoesntExist/);
  f = fake({ finalize: () => ({ jsonrpc: '2.0', result: { Err: 'x' } }), cancel: async () => { throw new Error('owner API gone'); } });
  r = await f.run();
  assert.equal(r.code, 'finalize_pending');
  f = fake({ finalize: () => ({ jsonrpc: '2.0', result: { Err: 'x' } }), cancel: () => false });
  r = await f.run();
  assert.equal(r.code, 'finalize_pending', 'no answer is no cancel');
});

test('a failed post keeps the transaction (no cancel) and says why', async () => {
  const f = fake({ post: () => false });
  const r = await f.run();
  assert.deepEqual([r.ok, r.code, r.detail, r.slateId], [false, 'post', 'no answer', 'slate-1']);
  assert.ok(!f.calls.some(c => c[0] === 'cancel_tx'));
});

test('a connect timeout of check_version is tried once more on a new circuit; receive_tx goes with that attempt', async () => {
  const attempts = [];
  let n = 0;
  const f = fake();
  //the attempt number each foreign call got
  const res = await f.run({ foreign: async (m, p, a) => { attempts.push([m, a]); return m === 'check_version'
    ? (n++ === 0 ? { ok: false, code: 'unreachable', detail: 'timeout' } : { ok: true, result: V(2, ['V3']) })
    : { ok: true, result: { jsonrpc: '2.0', id: 1, result: { Ok: { id: 'slate-1' } } } }; } });
  assert.equal(res.ok, true);
  assert.deepEqual(attempts, [['check_version', 0], ['check_version', 1], ['receive_tx', 1]]);
});

test('no retry for tor\'s own answers (not there, bad address) or a second timeout', async () => {
  for (const [first, calls] of [[{ ok: false, code: 'unreachable', detail: 'socks 0xf0' }, 1], [{ ok: false, code: 'invalid', detail: 'socks 0xf6' }, 1],
    [{ ok: false, code: 'unreachable', detail: 'timeout' }, 2]]) {
    let count = 0;
    const f = fake();
    const r = await f.run({ foreign: async () => { count++; return first; } });
    assert.equal(r.ok, false);
    assert.equal(r.code, first.code);
    assert.equal(count, calls, first.detail);
    assert.equal(f.calls.length, 0, 'nothing created');
  }
});
