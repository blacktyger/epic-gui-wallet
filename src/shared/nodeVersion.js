/*
 * What kind of Epic node answers at an address, and how to read its status.
 * Pure: no window, no config. fetch is injectable for the tests (tests/nodeVersion.test.js,
 * replies recorded from real nodes in tests/fixtures/nodeReplies.json).
 *
 * Node API, observed on 3.0.0 to 4.1.0-1:
 *   node                          GET /v1/version  GET /v1/status (no auth)  POST /v2/owner get_status  POST /v2/foreign get_version
 *   3.0.0-4.0.3 with api secret   401              401                       401                        200
 *   3.0.0-4.0.3 without secret    200              200                       200                        200
 *   4.1.0                         200 "4.1.0"      401 always                200                        200
 *   4.1.0-1                       200 "4.1.0"      200                       200                        200
 * 4.1.0 and 4.1.0-1 both report "4.1.0": only the 401 on /v1/status tells them apart.
 * POST /v2/foreign (get_version, get_tip, ready_for_txs) is public on every version, and it is what
 * epic-wallet itself uses: a node that answers there works with the wallet, whatever /v1/status says.
 * So the GUI reads every node's status there (get_tip + ready_for_txs) and never asks /v1/status or
 * /v2/owner get_status, except the built-in node's own stall watchdog (fetchLocalStatus).
 * The api secret is only ever sent to a local node.
 */

import { defaultNodeFetch } from './nodeFetch.js';

//the oldest node the GUI is fully made for (README: 4.1.0-1 or later; 4.1.0 needs the owner status fallback)
export const MIN_NODE_VERSION = '4.1.0';

/* an address for the log: without user:password@ */
export function withoutUserinfo(address){
  return String(address || '').replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, '$1');
}

export function isLocal(address){
  try{
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(address).hostname);
  }catch(e){
    return false;
  }
}

/* -1, 0, 1 for dotted versions; a suffix like "-1" counts as newer than the plain release */
export function compareVersions(a, b){
  const parse = (v) => String(v || '').trim().replace(/^v/i, '').split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const x = parse(a), y = parse(b);
  for(let i = 0; i < Math.max(x.length, y.length); i++){
    const d = (x[i] || 0) - (y[i] || 0);
    if(d){
      return d < 0 ? -1 : 1;
    }
  }
  return 0;
}

const baseOf = (address) => String(address || '').trim().replace(/\/+$/, '');
const readJson = async (res) => { try{ return await res.json(); }catch(e){ return null; } };
const failReason = (e, timeoutMs) => e && (e.name === 'AbortError' || e.name === 'TimeoutError')
  ? 'no reply within ' + Math.ceil(timeoutMs / 1000) + ' s' : 'not reachable';
const authHeaders = (base, apiSecret) => apiSecret && isLocal(base)
  ? {'Authorization': 'Basic ' + btoa('epic:' + apiSecret)} : {};
const rpc = (method) => JSON.stringify({jsonrpc: '2.0', id: 1, method, params: []});
/* an outer signal (a check that is no longer wanted) aborts the request as its timeout would */
const follow = (signal, controller) => {
  if(!signal) return () => {};
  if(signal.aborted){ controller.abort(); return () => {}; }
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, {once: true});
  return () => signal.removeEventListener('abort', onAbort);
};

/* fetchNodeVersion plus a machine-readable code: 'network' | 'timeout' | 'http' | 'no_version' | 'auth' */
async function probeVersion(address, {fetch: fetchFn = defaultNodeFetch(), timeoutMs = 5000, redirect, signal} = {}){

  const base = baseOf(address);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const unfollow = follow(signal, controller);
  const extra = redirect ? {redirect} : {};

  const redirected = (res) => res.type == 'opaqueredirect' || (res.status >= 300 && res.status < 400);
  try{
    //the public foreign API first (what epic-wallet uses; no secret is sent with it, to any host)
    const res = await fetchFn(base + '/v2/foreign', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: rpc('get_version'),
      signal: controller.signal, timeoutMs,
      ...extra,
    });
    if(redirected(res)){
      return {ok: false, reason: 'redirects elsewhere', code: 'http'};
    }
    const body = res.ok ? await readJson(res) : null;
    const version = body && body.result && body.result.Ok && body.result.Ok.node_version;
    if(version){
      return {ok: true, version};
    }

    //failover: GET /v1/version (nodes are expected to close it one day; never depended on)
    const res2 = await fetchFn(base + '/v1/version', {method: 'GET', signal: controller.signal, timeoutMs, ...extra});
    if(res2.ok){
      const body2 = await readJson(res2);
      return body2 && body2.node_version
        ? {ok: true, version: body2.node_version}
        : {ok: false, reason: 'no node version in the reply', code: 'no_version'};
    }
    if(redirected(res2)){
      return {ok: false, reason: 'redirects elsewhere', code: 'http'};
    }
    return res2.status == 401
      ? {ok: false, reason: 'HTTP 401', code: 'auth'}
      : {ok: false, reason: 'HTTP ' + res2.status, code: 'http'};

  }catch(e){
    if(signal && signal.aborted){
      return {ok: false, reason: 'cancelled', code: 'cancelled'};
    }
    const reason = failReason(e, timeoutMs);
    return {ok: false, reason, code: reason == 'not reachable' ? 'network' : 'timeout'};
  }finally{
    clearTimeout(timeoutId);
    unfollow();
  }
}

/*
 * Which Epic node version answers at an address, without the node's api secret.
 *
 * GET /v1/version is public from node 4.1.0 on, but nodes up to 4.0.x that have an api secret
 * (their default) answer it with 401. POST /v2/foreign get_version is public on every node version
 * (3.0.0 to 4.1.0-1 tested), so a 401 is asked again there instead of being taken as "not an Epic node".
 *
 * redirect: passed to fetch ('manual' to not follow an http -> https redirect)
 * returns {ok: true, version} or {ok: false, reason}, plus timeout: true when no reply came in time
 * (a busy node: no proof that it isn't an Epic node)
 */
export async function fetchNodeVersion(address, options = {}){
  const {ok, version, reason, code} = await probeVersion(address, options);
  return ok ? {ok, version} : code == 'timeout' ? {ok, reason, timeout: true} : {ok, reason};
}

//a node at most this many blocks below the reference height counts as synced (a block a minute)
export const SYNC_TOLERANCE = 5;

/*
 * A POST /v2/foreign get_tip reply in the shape of GET /v1/status, for a node whose status is
 * locked. get_tip has no sync state and no peer count (connections: null, unknown).
 * ready: the node's POST /v2/foreign ready_for_txs answer, true exactly when its sync status is
 * NoSync (api/src/foreign.rs sync_state_ready_for_txs): it decides synced or syncing, and the
 * height against referenceHeight (a public node's tip, or the highest height seen) gives how far
 * behind. Without it (null: no answer) the node counts as synced when its tip is within
 * SYNC_TOLERANCE of referenceHeight; no reference (0): no_sync (App.vue still needs a height above 0).
 * null if the reply has no tip.
 */
export function foreignTipToV1(reply, {referenceHeight = 0, version = '', ready = null} = {}){
  const ok = reply && reply.result && reply.result.Ok;
  const height = ok && Number(ok.height);
  if(!ok || !Number.isFinite(height) || height < 0){
    return null;
  }
  const tip = {height, last_block_pushed: ok.last_block_pushed, prev_block_to_last: ok.prev_block_to_last, total_difficulty: ok.total_difficulty};
  const reference = Number(referenceHeight) || 0;
  const behind = typeof ready === 'boolean' ? !ready : reference > 0 && height < reference - SYNC_TOLERANCE;
  const status = {
    tip,
    sync_status: behind ? 'body_sync' : 'no_sync',
    //unknown via get_tip
    connections: null,
    ...(typeof ready === 'boolean' ? {ready_for_txs: ready} : {}),
    ...(version ? {user_agent: 'MW/Epic ' + version} : {}),
  };
  if(behind){
    status.sync_info = {current_height: height, highest_height: Math.max(reference, height)};
  }
  return status;
}

/* POST /v2/foreign ready_for_txs: true or false, null when the node doesn't answer it */
async function readyForTxs(fetchFn, base, init){
  try{
    const res = await fetchFn(base + '/v2/foreign', {...init, method: 'POST', headers: {'Content-Type': 'application/json'}, body: rpc('ready_for_txs')});
    const reply = res.ok ? await readJson(res) : null;
    const ok = reply && reply.result && reply.result.Ok;
    return ok && typeof ok.ready_for_txs === 'boolean' ? ok.ready_for_txs : null;
  }catch(e){
    return null;
  }
}

/*
 * Synced or not when ready_for_txs gives no answer (nodes before 4.1.0 don't have it): GET /v1/status,
 * then POST /v2/owner get_status (the api secret to a local node only). Only the sync state is taken
 * from them (true at no_sync, false while syncing, null for awaiting_peers or no answer, which then
 * leaves it to the height against the network tip): nothing the UI shows comes from these calls, and
 * nodes are expected to close them one day.
 */
async function readyFromStatus(fetchFn, base, {apiSecret = '', ...init}){
  const headers = {'Content-Type': 'application/json', ...authHeaders(base, apiSecret)};
  const syncOf = (st) => {
    if(!st || typeof st.sync_status !== 'string') return undefined;
    if(st.sync_status === 'no_sync') return true;
    return st.sync_status === 'awaiting_peers' ? null : false;
  };
  try{
    const res = await fetchFn(base + '/v1/status', {...init, method: 'GET', headers});
    const got = syncOf(res.ok ? await readJson(res) : null);
    if(got !== undefined) return got;
    const res2 = await fetchFn(base + '/v2/owner', {...init, method: 'POST', headers, body: rpc('get_status')});
    const reply = res2.ok ? await readJson(res2) : null;
    const owner = syncOf(reply && reply.result && reply.result.Ok);
    return owner === undefined ? null : owner;
  }catch(e){
    return null;
  }
}

/* a node's tip height from POST /v2/foreign get_tip (public on every node), 0 if none */
export async function fetchTipHeight(address, {fetch: fetchFn = defaultNodeFetch(), timeoutMs = 5000} = {}){
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try{
    const res = await fetchFn(baseOf(address) + '/v2/foreign', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: rpc('get_tip'), signal: controller.signal, timeoutMs, redirect: 'manual'});
    const body = res.ok ? await readJson(res) : null;
    const h = body && body.result && body.result.Ok && Number(body.result.Ok.height);
    return Number.isFinite(h) && h > 0 ? h : 0;
  }catch(e){
    return 0;
  }finally{
    clearTimeout(timeoutId);
  }
}

/*
 * The node's status, from the public foreign API: POST /v2/foreign get_tip (the height) and
 * ready_for_txs (synced or not) at the same time, in the shape of GET /v1/status (see foreignTipToV1).
 * Only when ready_for_txs gives no answer (before 4.1.0) the sync state falls back to /v1/status, then
 * owner get_status (readyFromStatus; the api secret to a local node only). A node that keeps those
 * closed (401, 403) is a normal node; nothing shown depends on them.
 * referenceHeight: a number, or an async function giving one, for the sync state without ready_for_txs
 *
 * returns {ok: true, status} or {ok: false, reason}
 */
export async function fetchNodeStatus(address, opts = {}){
  const {fetch: fetchFn = defaultNodeFetch(), timeoutMs = 10000, redirect = 'manual', referenceHeight = 0, version = '', apiSecret = '', signal} = opts;

  const base = baseOf(address);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const unfollow = follow(signal, controller);

  try{
    //redirect 'manual': epic-wallet doesn't follow redirects, so a node behind one is not usable
    const [res, ready] = await Promise.all([
      fetchFn(base + '/v2/foreign', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: rpc('get_tip'), signal: controller.signal, timeoutMs, redirect}),
      readyForTxs(fetchFn, base, {signal: controller.signal, timeoutMs, redirect}),
    ]);
    const tipReply = res.ok ? await readJson(res) : null;
    if(tipReply && tipReply.result && tipReply.result.Ok){
      const sync = ready === null ? await readyFromStatus(fetchFn, base, {apiSecret, signal: controller.signal, timeoutMs, redirect}) : ready;
      const reference = typeof referenceHeight === 'function' ? await referenceHeight() : referenceHeight;
      const status = foreignTipToV1(tipReply, {referenceHeight: reference, version, ready: sync});
      if(status){
        return {ok: true, status};
      }
    }
    return {ok: false, reason: res.ok ? 'no node status in the reply' : 'HTTP ' + res.status};

  }catch(e){
    return {ok: false, reason: signal && signal.aborted ? 'cancelled' : failReason(e, timeoutMs)};
  }finally{
    clearTimeout(timeoutId);
    unfollow();
  }
}

/*
 * The built-in node's own GET /v1/status (localhost, with its api secret), for its stall watchdog
 * only (nodeService.getNodeStatus): peers, sync_info and the sync state say a stall from a long
 * download, which the foreign API can't. Never shown. A non-local address is never asked.
 * returns the status or null
 */
export async function fetchLocalStatus(address, {fetch: fetchFn = defaultNodeFetch(), apiSecret = '', timeoutMs = 10000} = {}){
  const base = baseOf(address);
  if(!isLocal(base)){
    return null;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try{
    const res = await fetchFn(base + '/v1/status', {method: 'GET', headers: authHeaders(base, apiSecret), signal: controller.signal, timeoutMs, redirect: 'manual'});
    const status = res.ok ? await readJson(res) : null;
    return status && status.tip ? status : null;
  }catch(e){
    return null;
  }finally{
    clearTimeout(timeoutId);
  }
}

/*
 * What kind of node is at an address:
 *   ok             the wallet can use it: an Epic node that answers the foreign API (get_tip; a node
 *                  that keeps /v1/status or /v2/owner closed is just as fine)
 *   too_old        version < 4.1.0, or a node whose version needs its api secret, and no status at all
 *   unreachable    no reply, or a node whose status can't be read for another reason
 *   not_epic       something answers, but not an Epic node
 *
 * signal: aborts the check (kind 'unreachable', reason 'cancelled')
 * returns {kind, address, version, reason, code, local, statusReadable, status}
 *   code: why the version check failed ('network' | 'timeout' | 'http' | 'no_version' | 'auth' |
 *   'cancelled'), '' when it answered
 *   statusReadable: the GUI can read the status; then the node panel, sending and the Epicbox
 *   autostart work. status: that status, or null
 */
export async function classifyNode(address, {fetch: fetchFn, apiSecret = '', timeoutMs = 5000, referenceHeight = 0, signal} = {}){

  const base = baseOf(address);
  const local = isLocal(base);
  const opts = fetchFn ? {fetch: fetchFn} : {};
  const result = (kind, extra) => ({
    kind, address: base, version: null, reason: '', code: '', local, statusReadable: false, status: null, ...extra,
  });

  //redirects not followed: epic-wallet wouldn't follow them either (http://host -> https://host)
  const v = await probeVersion(base, {...opts, timeoutMs, redirect: 'manual', signal});
  if(!v.ok){
    if(v.code == 'auth'){
      return result('too_old', {reason: 'needs api secret', code: v.code});
    }
    if(v.code == 'network' || v.code == 'timeout' || v.code == 'cancelled'){
      return result('unreachable', {reason: v.reason, code: v.code});
    }
    return result('not_epic', {reason: v.reason, code: v.code});
  }

  const st = await fetchNodeStatus(base, {...opts, apiSecret, timeoutMs, referenceHeight, version: v.version, signal});
  const status = {
    version: v.version,
    statusReadable: st.ok,
    status: st.ok ? st.status : null,
  };

  //it works with the wallet: no notice, whatever its version says
  if(st.ok){
    return result('ok', {...status, reason: compareVersions(v.version, MIN_NODE_VERSION) < 0 ? 'version ' + v.version : ''});
  }
  if(compareVersions(v.version, MIN_NODE_VERSION) < 0){
    return result('too_old', {...status, reason: 'version ' + v.version});
  }
  return result('unreachable', {...status, reason: 'status: ' + st.reason});
}
