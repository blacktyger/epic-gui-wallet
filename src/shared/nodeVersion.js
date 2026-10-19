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
 * POST /v2/foreign (get_version, get_tip) is public on every version, and it is what epic-wallet
 * itself uses: a node that answers there works with the wallet, whatever /v1/status says.
 * The api secret is only ever sent to a local node.
 */

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

/* fetchNodeVersion plus a machine-readable code: 'network' | 'timeout' | 'http' | 'no_version' | 'auth' */
async function probeVersion(address, {fetch: fetchFn = (...args) => fetch(...args), timeoutMs = 5000, redirect} = {}){

  const base = baseOf(address);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const extra = redirect ? {redirect} : {};

  try{
    const res = await fetchFn(base + '/v1/version', {method: 'GET', signal: controller.signal, ...extra});
    if(res.ok){
      const body = await readJson(res);
      return body && body.node_version
        ? {ok: true, version: body.node_version}
        : {ok: false, reason: 'no node version in the reply', code: 'no_version'};
    }
    if(res.type == 'opaqueredirect' || (res.status >= 300 && res.status < 400)){
      return {ok: false, reason: 'redirects elsewhere', code: 'http'};
    }
    if(res.status != 401){
      return {ok: false, reason: 'HTTP ' + res.status, code: 'http'};
    }

    //an older node with an api secret: ask the public foreign API, which epic-wallet uses too.
    //No secret is sent with it, to any host
    const res2 = await fetchFn(base + '/v2/foreign', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: rpc('get_version'),
      signal: controller.signal,
      ...extra,
    });
    const body = res2.ok ? await readJson(res2) : null;
    const version = body && body.result && body.result.Ok && body.result.Ok.node_version;
    return version ? {ok: true, version} : {ok: false, reason: 'HTTP 401', code: 'auth'};

  }catch(e){
    const reason = failReason(e, timeoutMs);
    return {ok: false, reason, code: reason == 'not reachable' ? 'network' : 'timeout'};
  }finally{
    clearTimeout(timeoutId);
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
 * returns {ok: true, version} or {ok: false, reason}
 */
export async function fetchNodeVersion(address, options = {}){
  const {ok, version, reason} = await probeVersion(address, options);
  return ok ? {ok, version} : {ok, reason};
}

/*
 * A POST /v2/owner get_status reply in the shape of GET /v1/status, which the app uses
 * (tip.height, sync_status, connections, sync_info, user_agent...). Both are the node's same status
 * struct; the owner one only sits in a JSON-RPC envelope. null if the reply has no status.
 */
export function ownerStatusToV1(reply){
  const ok = reply && reply.result && reply.result.Ok;
  if(!ok || typeof ok !== 'object' || !ok.tip || ok.sync_status === undefined){
    return null;
  }
  const status = {
    protocol_version: ok.protocol_version,
    user_agent: ok.user_agent,
    connections: ok.connections,
    tip: {...ok.tip},
    sync_status: ok.sync_status,
  };
  if(ok.sync_info){
    status.sync_info = {...ok.sync_info};
  }
  for(const key of ['supply', 'max_supply', 'blocks_to_next_halving']){
    if(ok[key] !== undefined){
      status[key] = ok[key];
    }
  }
  return status;
}

//a node at most this many blocks below the reference height counts as synced (a block a minute)
export const SYNC_TOLERANCE = 5;

/*
 * A POST /v2/foreign get_tip reply in the shape of GET /v1/status, for a node whose status is
 * locked. get_tip has no sync state and no peer count: the node counts as synced when its tip is
 * within SYNC_TOLERANCE of referenceHeight (a public node's tip, or the highest height seen),
 * else as syncing towards it. No reference (0): no_sync (App.vue still needs a height above 0).
 * null if the reply has no tip.
 */
export function foreignTipToV1(reply, {referenceHeight = 0, version = ''} = {}){
  const ok = reply && reply.result && reply.result.Ok;
  const height = ok && Number(ok.height);
  if(!ok || !Number.isFinite(height) || height < 0){
    return null;
  }
  const tip = {height, last_block_pushed: ok.last_block_pushed, prev_block_to_last: ok.prev_block_to_last, total_difficulty: ok.total_difficulty};
  const reference = Number(referenceHeight) || 0;
  const behind = reference > 0 && height < reference - SYNC_TOLERANCE;
  const status = {
    tip,
    sync_status: behind ? 'body_sync' : 'no_sync',
    //unknown via get_tip
    connections: null,
    ...(version ? {user_agent: 'MW/Epic ' + version} : {}),
  };
  if(behind){
    status.sync_info = {current_height: height, highest_height: reference};
  }
  return status;
}

/* a node's tip height from POST /v2/foreign get_tip (public on every node), 0 if none */
export async function fetchTipHeight(address, {fetch: fetchFn = (...args) => fetch(...args), timeoutMs = 5000} = {}){
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try{
    const res = await fetchFn(baseOf(address) + '/v2/foreign', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: rpc('get_tip'), signal: controller.signal, redirect: 'manual'});
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
 * The node's status (the GET /v1/status shape). When /v1/status gives 401 (a plain 4.1.0 node,
 * or a node whose secret the GUI doesn't have), it is read from POST /v2/owner get_status instead,
 * and failing that from POST /v2/foreign get_tip (what epic-wallet uses; see foreignTipToV1).
 * apiSecret: the local node's secret, sent only when the address is local.
 * referenceHeight: a number, or an async function giving one, for the get_tip sync state
 *
 * returns {ok: true, status, via: 'v1' | 'owner' | 'foreign', locked} or {ok: false, reason, locked}
 *   locked: /v1/status answered 401
 */
export async function fetchNodeStatus(address, {fetch: fetchFn = (...args) => fetch(...args), apiSecret = '', timeoutMs = 10000, redirect = 'manual', referenceHeight = 0, version = ''} = {}){

  const base = baseOf(address);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {'Content-Type': 'application/json', ...authHeaders(base, apiSecret)};

  try{
    //redirect 'manual': epic-wallet doesn't follow redirects, so a node behind one is not usable
    const res = await fetchFn(base + '/v1/status', {method: 'GET', headers, signal: controller.signal, redirect});
    if(res.ok){
      const status = await readJson(res);
      return status && status.tip
        ? {ok: true, status, via: 'v1', locked: false}
        : {ok: false, reason: 'no node status in the reply', locked: false};
    }
    if(res.status != 401){
      return {ok: false, reason: 'HTTP ' + res.status, locked: false};
    }

    const res2 = await fetchFn(base + '/v2/owner', {method: 'POST', headers, body: rpc('get_status'), signal: controller.signal, redirect});
    const status = res2.ok ? ownerStatusToV1(await readJson(res2)) : null;
    if(status){
      return {ok: true, status, via: 'owner', locked: true};
    }

    //the foreign API: public, no secret, and what the wallet itself talks to
    const res3 = await fetchFn(base + '/v2/foreign', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: rpc('get_tip'), signal: controller.signal, redirect});
    const tipReply = res3.ok ? await readJson(res3) : null;
    if(tipReply && tipReply.result && tipReply.result.Ok){
      const reference = typeof referenceHeight === 'function' ? await referenceHeight() : referenceHeight;
      const fromTip = foreignTipToV1(tipReply, {referenceHeight: reference, version});
      if(fromTip){
        return {ok: true, status: fromTip, via: 'foreign', locked: true};
      }
    }
    return {ok: false, reason: 'HTTP 401', locked: true};

  }catch(e){
    return {ok: false, reason: failReason(e, timeoutMs), locked: false};
  }finally{
    clearTimeout(timeoutId);
  }
}

/*
 * What kind of node is at an address:
 *   ok             the wallet can use it: an Epic node whose status the GUI can read, via GET /v1/status,
 *                  POST /v2/owner get_status or POST /v2/foreign get_tip (statusVia says which; an old
 *                  or plain 4.1.0 node that answers there is fine, the details only go to the log)
 *   too_old        version < 4.1.0, or a node whose version needs its api secret, and no status at all
 *   status_locked  /v1/status needs the secret and no public fallback answers
 *   unreachable    no reply, or a node whose status can't be read for another reason
 *   not_epic       something answers, but not an Epic node
 *
 * returns {kind, address, version, reason, local, statusReadable, statusVia, status}
 *   statusReadable: the GUI can read the status (statusVia 'v1', 'owner' or 'foreign'); then the node
 *   panel, sending and the Epicbox autostart work. status: that status, or null
 */
export async function classifyNode(address, {fetch: fetchFn, apiSecret = '', timeoutMs = 5000, referenceHeight = 0} = {}){

  const base = baseOf(address);
  const local = isLocal(base);
  const opts = fetchFn ? {fetch: fetchFn} : {};
  const result = (kind, extra) => ({
    kind, address: base, version: null, reason: '', local, statusReadable: false, statusVia: null, status: null, ...extra,
  });

  //redirects not followed: epic-wallet wouldn't follow them either (http://host -> https://host)
  const v = await probeVersion(base, {...opts, timeoutMs, redirect: 'manual'});
  if(!v.ok){
    if(v.code == 'auth'){
      return result('too_old', {reason: 'needs api secret'});
    }
    if(v.code == 'network' || v.code == 'timeout'){
      return result('unreachable', {reason: v.reason});
    }
    return result('not_epic', {reason: v.reason});
  }

  const st = await fetchNodeStatus(base, {...opts, apiSecret, timeoutMs, referenceHeight, version: v.version});
  const status = {
    version: v.version,
    statusReadable: st.ok,
    statusVia: st.ok ? st.via : null,
    status: st.ok ? st.status : null,
  };

  //it works with the wallet: no notice, whatever its version or /v1/status say
  if(st.ok){
    const notes = [];
    if(compareVersions(v.version, MIN_NODE_VERSION) < 0) notes.push('version ' + v.version);
    if(st.locked) notes.push('/v1/status locked, status via ' + st.via);
    return result('ok', {...status, reason: notes.join(', ')});
  }
  if(compareVersions(v.version, MIN_NODE_VERSION) < 0){
    return result('too_old', {...status, reason: 'version ' + v.version});
  }
  if(st.locked){
    return result('status_locked', {...status, reason: '/v1/status needs api secret, no public status'});
  }
  return result('unreachable', {...status, reason: 'status: ' + st.reason});
}
