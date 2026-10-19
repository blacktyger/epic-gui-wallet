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

    //an older node with an api secret. Only a local node: the GUI sends the secret to no other host,
    //so a remote node that needs it can't be used anyway
    if(!isLocal(base)){
      return {ok: false, reason: 'HTTP 401', code: 'auth'};
    }
    const res2 = await fetchFn(base + '/v2/foreign', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: rpc('get_version'),
      signal: controller.signal,
      ...extra,
    });
    const body = res2.ok ? await readJson(res2) : null;
    const version = body && body.result && body.result.Ok && body.result.Ok.node_version;
    return version ? {ok: true, version} : {ok: false, reason: 'HTTP 401', code: 'http'};

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

/*
 * The node's status (the GET /v1/status shape). When /v1/status gives 401 (a plain 4.1.0 node,
 * or a node whose secret the GUI doesn't have), it is read from POST /v2/owner get_status instead.
 * apiSecret: the local node's secret, sent only when the address is local.
 *
 * returns {ok: true, status, via: 'v1' | 'owner', locked} or {ok: false, reason, locked}
 *   locked: /v1/status answered 401
 */
export async function fetchNodeStatus(address, {fetch: fetchFn = (...args) => fetch(...args), apiSecret = '', timeoutMs = 10000, redirect = 'manual'} = {}){

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
    return status
      ? {ok: true, status, via: 'owner', locked: true}
      : {ok: false, reason: 'HTTP 401', locked: true};

  }catch(e){
    return {ok: false, reason: failReason(e, timeoutMs), locked: false};
  }finally{
    clearTimeout(timeoutId);
  }
}

/*
 * What kind of node is at an address:
 *   ok             version >= 4.1.0 and its status is readable via GET /v1/status
 *   too_old        version < 4.1.0, or a remote node that answers /v1/version with 401
 *                  (a node up to 4.0.x with an api secret; version then unknown)
 *   status_locked  4.1.0 whose GET /v1/status needs the secret (a plain 4.1.0, not 4.1.0-1)
 *   unreachable    no reply, or a node whose status can't be read for another reason
 *   not_epic       something answers, but not an Epic node
 *
 * returns {kind, address, version, reason, local, statusReadable, statusVia, status}
 *   statusReadable: the GUI can read the status anyway (statusVia 'v1' or 'owner'); then the node
 *   panel and the Epicbox autostart work. status: that status, or null
 */
export async function classifyNode(address, {fetch: fetchFn, apiSecret = '', timeoutMs = 5000} = {}){

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

  const st = await fetchNodeStatus(base, {...opts, apiSecret, timeoutMs});
  const status = {
    version: v.version,
    statusReadable: st.ok,
    statusVia: st.ok ? st.via : null,
    status: st.ok ? st.status : null,
  };

  if(compareVersions(v.version, MIN_NODE_VERSION) < 0){
    return result('too_old', {...status, reason: 'version ' + v.version});
  }
  if(st.locked){
    return result('status_locked', {...status, reason: '/v1/status needs api secret'});
  }
  if(!st.ok){
    return result('unreachable', {...status, reason: 'status: ' + st.reason});
  }
  return result('ok', status);
}
