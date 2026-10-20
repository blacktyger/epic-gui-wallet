// Tests for src/shared/nodeCheck.js: the live check of a typed or saved node address (Settings › Node,
// My nodes): the status mapping, one probe against fake nodes, the debounce / cancel of the field and
// the light list refresh. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeCheckView, probeNode, createNodeChecker, createCheckCache, checkMany } from '../src/shared/nodeCheck.js';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, type: 'basic', json: async () => body });
const STATUS = { protocol_version: 1000, user_agent: 'MW/Epic 4.1.0', connections: 8, tip: { height: 2500000 }, sync_status: 'no_sync' };

/* a fake node: routes 'GET /v1/version' etc. to replies; records calls with their headers */
function node(routes, { delay = 0 } = {}) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    const key = (opts.method || 'GET') + ' ' + new URL(url).pathname;
    calls.push({ key, url, headers: opts.headers || {} });
    if (delay) await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, delay);
      if (opts.signal) opts.signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }, { once: true });
    });
    const r = typeof routes[key] === 'function' ? routes[key]() : routes[key];
    if (r instanceof Error) throw r;
    return r || reply(404, null);
  };
  return { fetch, calls };
}
const healthy = (status = STATUS) => node({ 'GET /v1/version': reply(200, { node_version: '4.1.0' }), 'GET /v1/status': reply(200, status) });

test('view: an online node at the tip, with version, height, peers and the response time', () => {
  const v = nodeCheckView({ kind: 'ok', address: 'https://n.example.com', version: '4.1.0', status: STATUS }, { ms: 123.4, tipHeight: 2500001 });
  assert.deepEqual(v, { address: 'https://n.example.com', state: 'online', tone: 'ok', version: '4.1.0', height: 2500000, behind: 0, peers: 8, ms: 123, problem: '', hint: '' });
});

test('view: blocks behind, syncing, an unknown tip, a status without peers (get_tip)', () => {
  const ok = (status, tipHeight) => nodeCheckView({ kind: 'ok', address: 'https://n.example.com', version: '4.1.0', status }, { tipHeight });
  assert.equal(ok(STATUS, 2500002).behind, 0, 'two blocks below a list up to a minute old still counts as at tip');
  const lagging = ok(STATUS, 2500004);
  assert.equal(lagging.behind, 4);
  assert.equal(lagging.state, 'online', 'a few blocks behind is not syncing');
  const far = ok(STATUS, 2500100);
  assert.deepEqual([far.state, far.tone, far.behind], ['syncing', 'warn', 100]);
  const syncing = ok({ ...STATUS, sync_status: 'body_sync' }, 0);
  assert.deepEqual([syncing.state, syncing.behind], ['syncing', null]);
  assert.equal(ok({ ...STATUS, connections: null }, 0).peers, null);
  assert.equal(ok(STATUS, 2400000).behind, 0, 'a node ahead of an old list is at tip');
});

test('view: plain-language problems and hints for what fails', () => {
  const v = (c) => nodeCheckView({ version: null, ...c });
  assert.deepEqual(pick(v({ kind: 'unreachable', address: 'https://n.example.com:3413', code: 'timeout' })), ['offline', 'risk', 'timeout', '']);
  assert.deepEqual(pick(v({ kind: 'unreachable', address: 'https://n.example.com:8080', code: 'network' })), ['offline', 'risk', 'unreachable', 'port']);
  assert.deepEqual(pick(v({ kind: 'unreachable', address: 'https://192.168.1.5:3413', code: 'network' })), ['offline', 'risk', 'unreachable', 'try_http']);
  assert.deepEqual(pick(v({ kind: 'not_epic', address: 'http://n.example.com:3413', reason: 'HTTP 400', code: 'http' })), ['not_epic', 'risk', 'not_epic', 'try_https']);
  assert.deepEqual(pick(v({ kind: 'not_epic', address: 'https://example.com', reason: 'HTTP 404', code: 'http' })), ['not_epic', 'risk', 'not_epic', 'port']);
  assert.deepEqual(pick(v({ kind: 'not_epic', address: 'http://n.example.com:3413', reason: 'redirects elsewhere', code: 'http' })), ['not_epic', 'risk', 'redirect', '']);
  assert.deepEqual(pick(v({ kind: 'not_epic', address: 'https://n.example.com:3413', reason: 'HTTP 502', code: 'http' })), ['offline', 'risk', 'server_error', ''],
    'a proxy answering 502: the node behind it is down, not "not an Epic node"');
  assert.deepEqual(pick(v({ kind: 'too_old', address: 'https://n.example.com:3413', code: 'auth' })), ['old', 'warn', 'needs_secret', '']);
  assert.deepEqual(pick(v({ kind: 'too_old', address: 'https://n.example.com:3413', version: '3.0.0' })), ['old', 'warn', 'too_old', '']);
  assert.deepEqual(pick(v({ kind: 'status_locked', address: 'https://n.example.com:3413', version: '4.1.0' })), ['locked', 'warn', 'locked', '']);
  assert.deepEqual(pick(v({ kind: 'unreachable', address: 'https://n.example.com:8080', version: '4.1.0', reason: 'status: HTTP 500' })), ['offline', 'risk', 'unreachable', ''],
    'an Epic node whose status fails: no port hint');
  assert.equal(nodeCheckView({ kind: 'unreachable', code: 'cancelled' }), null);
  function pick(x) { return [x.state, x.tone, x.problem, x.hint]; }
});

test('probe: a healthy node, its response time, and never an api secret, not even to a local node', async () => {
  let t = 1000;
  const n = healthy();
  const timed = { fetch: async (...a) => { const r = await n.fetch(...a); t += 40; return r; } };
  const v = await probeNode('http://127.0.0.1:3413/', { ...timed, now: () => t, tipHeight: 2500000 });
  assert.equal(v.state, 'online');
  assert.equal(v.ms, 40, 'the time to the first reply');
  assert.equal(v.address, 'http://127.0.0.1:3413');
  assert.deepEqual(n.calls.map(c => c.key), ['GET /v1/version', 'GET /v1/status']);
  for (const c of n.calls) assert.equal('Authorization' in c.headers, false);
});

test('probe: the tip is asked lazily (a function) and used for "behind"', async () => {
  let asked = 0;
  const v = await probeNode('https://n.example.com:3413', { fetch: healthy().fetch, tipHeight: async () => { asked++; return 2500050; } });
  assert.equal(asked, 1);
  assert.equal(v.behind, 50);
});

test('probe: nothing is asked for a half-typed or non-http address', async () => {
  const n = healthy();
  for (const s of ['', 'https://', 'ftp://n.example.com', 'https://u:p@n.example.com', 'https://n.example.com/?q=1']) {
    assert.equal(await probeNode(s, { fetch: n.fetch }), null, s);
  }
  assert.equal(n.calls.length, 0);
});

test('probe: a non-Epic web server, an unreachable host, a timeout', async () => {
  const web = node({ 'GET /v1/version': reply(200, '<html>') });
  assert.equal((await probeNode('https://example.com', { fetch: web.fetch })).state, 'not_epic');
  const dead = node({ 'GET /v1/version': new TypeError('Failed to fetch') });
  assert.equal((await probeNode('https://n.example.com:3413', { fetch: dead.fetch })).problem, 'unreachable');
  const slow = node({ 'GET /v1/version': reply(200, { node_version: '4.1.0' }) }, { delay: 200 });
  const v = await probeNode('https://n.example.com:3413', { fetch: slow.fetch, timeoutMs: 30 });
  assert.deepEqual([v.state, v.problem], ['offline', 'timeout']);
});

test('probe: an aborted check gives null and stops its request', async () => {
  const slow = node({ 'GET /v1/version': reply(200, { node_version: '4.1.0' }) }, { delay: 500 });
  const ctrl = new AbortController();
  const p = probeNode('https://n.example.com:3413', { fetch: slow.fetch, signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 10);
  const started = Date.now();
  assert.equal(await p, null);
  assert.ok(Date.now() - started < 300, 'not left to run to its end');
});

/* fake timers for the checker */
function clock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    setTimer: (f, ms) => { timers.set(++id, { at: now + ms, f }); return id; },
    clearTimer: (t) => timers.delete(t),
    async advance(ms) {
      now += ms;
      for (const [k, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now) { timers.delete(k); t.f(); }
      }
      await new Promise(r => setImmediate(r));
    },
    get pending() { return timers.size; },
  };
}
/* a probe that answers when told: resolve(address) */
function manualProbe() {
  const calls = [], open = new Map();
  const probe = (address, { signal }) => new Promise((resolve) => {
    calls.push(address);
    open.set(address, resolve);
    signal.addEventListener('abort', () => { calls.aborted = (calls.aborted || 0) + 1; resolve(null); }, { once: true });
  });
  const answer = async (address, view = { address, state: 'online' }) => { open.get(address)(view); await new Promise(r => setImmediate(r)); };
  return { probe, calls, answer };
}

test('checker: typing is checked once, ~600 ms after the last key', async () => {
  const c = clock(), p = manualProbe(), states = [];
  const ch = createNodeChecker({ probe: p.probe, onChange: s => states.push(s.phase), setTimer: c.setTimer, clearTimer: c.clearTimer });
  let typed = '';
  for (const k of 'https://node.example.com') {
    typed += k;
    ch.input(typed);
    await c.advance(150);
  }
  assert.deepEqual(p.calls, [], 'nothing while keys come faster than the debounce');
  await c.advance(600);
  assert.deepEqual(p.calls, ['https://node.example.com']);
  assert.equal(ch.state.phase, 'checking');
  await p.answer('https://node.example.com');
  assert.deepEqual(ch.state, { phase: 'done', address: 'https://node.example.com', view: { address: 'https://node.example.com', state: 'online' } });
});

test('checker: a paste is checked at once; the same address is not asked again while fresh', async () => {
  const c = clock(), p = manualProbe();
  const cache = createCheckCache({ ttlMs: 60000, now: () => 0 });
  const ch = createNodeChecker({ probe: p.probe, cache, setTimer: c.setTimer, clearTimer: c.clearTimer });
  ch.input('n.example.com:3413', { immediate: true });
  await c.advance(0);
  assert.deepEqual(p.calls, ['https://n.example.com:3413']);
  ch.input('https://n.example.com:3413/');
  await c.advance(1000);
  assert.equal(p.calls.length, 1, 'the same address while its check runs');
  await p.answer('https://n.example.com:3413');
  ch.input('other.example.com');
  await c.advance(1000);
  await p.answer('https://other.example.com');
  ch.input('n.example.com:3413');
  await c.advance(1000);
  assert.equal(p.calls.length, 2, 'back to the first address: from the cache');
  assert.equal(ch.state.phase, 'done');
  assert.equal(ch.state.address, 'https://n.example.com:3413');
});

test('checker: another address cancels the running check, and its late answer is dropped', async () => {
  const c = clock(), p = manualProbe();
  const ch = createNodeChecker({ probe: p.probe, setTimer: c.setTimer, clearTimer: c.clearTimer });
  ch.input('a.example.com', { immediate: true });
  await c.advance(0);
  ch.input('b.example.com', { immediate: true });
  await c.advance(0);
  assert.equal(p.calls.aborted, 1, 'the first check was aborted');
  await p.answer('https://b.example.com', { state: 'offline' });
  assert.deepEqual([ch.state.address, ch.state.view.state], ['https://b.example.com', 'offline']);
});

test('checker: clearing the field or a half-typed address stops everything; stop() on unmount', async () => {
  const c = clock(), p = manualProbe();
  const ch = createNodeChecker({ probe: p.probe, setTimer: c.setTimer, clearTimer: c.clearTimer });
  ch.input('a.example.com');
  ch.input('a.example.c');
  assert.equal(c.pending, 0);
  assert.equal(ch.state.phase, 'idle');
  ch.input('b.example.com', { immediate: true });
  await c.advance(0);
  ch.stop();
  assert.equal(p.calls.aborted, 1);
  await c.advance(1000);
  assert.equal(p.calls.length, 1);
});

test('checker: recheck asks again even when fresh', async () => {
  const c = clock(), p = manualProbe();
  const ch = createNodeChecker({ probe: p.probe, setTimer: c.setTimer, clearTimer: c.clearTimer });
  ch.input('a.example.com', { immediate: true });
  await c.advance(0);
  await p.answer('https://a.example.com');
  ch.recheck();
  await c.advance(0);
  assert.deepEqual(p.calls, ['https://a.example.com', 'https://a.example.com']);
});

test('checker: a probe that throws ends idle, not stuck on checking', async () => {
  const c = clock();
  const ch = createNodeChecker({ probe: async () => { throw new Error('x'); }, setTimer: c.setTimer, clearTimer: c.clearTimer });
  ch.input('a.example.com', { immediate: true });
  await c.advance(0);
  assert.equal(ch.state.phase, 'idle');
});

test('cache: fresh for ttlMs, bounded', () => {
  let now = 0;
  const cache = createCheckCache({ ttlMs: 1000, now: () => now, max: 2 });
  cache.set('a', { s: 1 });
  now = 999;
  assert.deepEqual(cache.get('a'), { s: 1 });
  now = 1000;
  assert.equal(cache.get('a'), null);
  cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
  assert.equal(cache.get('a'), null, 'the oldest goes first');
  cache.set('d', null);
  assert.equal(cache.get('d'), null, 'nothing cached for a cancelled check');
});

test('checkMany: at most `concurrency` at once, cached ones not asked, stops on abort', async () => {
  let running = 0, most = 0;
  const asked = [];
  const probe = async (a) => { asked.push(a); running++; most = Math.max(most, running); await new Promise(r => setTimeout(r, 5)); running--; return { address: a, state: 'online' }; };
  const cache = createCheckCache();
  cache.set('https://cached.example.com', { state: 'offline' });
  const got = {};
  await checkMany(['https://a.example.com', 'https://b.example.com', 'https://c.example.com', 'https://cached.example.com', 'https://a.example.com'], probe,
    { cache, concurrency: 2, onResult: (a, v) => { got[a] = v.state; } });
  assert.equal(most, 2);
  assert.deepEqual(asked.sort(), ['https://a.example.com', 'https://b.example.com', 'https://c.example.com']);
  assert.equal(got['https://cached.example.com'], 'offline');
  assert.equal(cache.get('https://b.example.com').state, 'online');

  const ctrl = new AbortController();
  asked.length = 0;
  const p = checkMany(['https://d.example.com', 'https://e.example.com', 'https://f.example.com'], probe, { cache, concurrency: 1, signal: ctrl.signal });
  ctrl.abort();
  await p;
  assert.ok(asked.length <= 1);
});
