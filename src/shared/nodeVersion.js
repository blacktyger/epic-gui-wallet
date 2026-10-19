function isLocal(address){
  try{
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(address).hostname);
  }catch(e){
    return false;
  }
}

/*
 * Which Epic node version answers at an address, without the node's api secret.
 *
 * GET /v1/version is public from node 4.1.0 on, but nodes up to 4.0.x that have an api secret
 * (their default) answer it with 401. POST /v2/foreign get_version is public on every node version
 * (3.0.0 to 4.1.0-1 tested), so a 401 is asked again there instead of being taken as "not an Epic node".
 *
 * returns {ok: true, version} or {ok: false, reason}
 */
export async function fetchNodeVersion(address, {fetch: fetchFn = (...args) => fetch(...args), timeoutMs = 5000} = {}){

  const base = String(address || '').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const json = async (res) => { try{ return await res.json(); }catch(e){ return null; } };

  try{
    const res = await fetchFn(base + '/v1/version', {method: 'GET', signal: controller.signal});
    if(res.ok){
      const body = await json(res);
      return body && body.node_version
        ? {ok: true, version: body.node_version}
        : {ok: false, reason: 'no node version in the reply'};
    }
    if(res.status != 401){
      return {ok: false, reason: 'HTTP ' + res.status};
    }

    //an older node with an api secret. Only a local node: the GUI sends the secret to no other host,
    //so a remote node that needs it can't be used anyway
    if(!isLocal(base)){
      return {ok: false, reason: 'HTTP 401'};
    }
    const rpc = await fetchFn(base + '/v2/foreign', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'get_version', params: []}),
      signal: controller.signal,
    });
    const body = rpc.ok ? await json(rpc) : null;
    const version = body && body.result && body.result.Ok && body.result.Ok.node_version;
    return version ? {ok: true, version} : {ok: false, reason: 'HTTP 401'};

  }catch(e){
    return {ok: false, reason: e && e.name === 'AbortError' ? 'no reply within ' + Math.ceil(timeoutMs / 1000) + ' s' : 'not reachable'};
  }finally{
    clearTimeout(timeoutId);
  }
}
