/*
 * The live check of a node address the user typed or saved (Settings › Node: the address field,
 * "Add to my nodes", the My nodes list). Pure: fetch, timers and the clock are passed in, so it
 * runs under `node --test` (tests/nodeCheck.test.js).
 *
 *   probeNode(address, opts)        one check → a view the screens show (nodeCheckView)
 *   nodeCheckView(classified, ...)  shared/nodeVersion.js classifyNode → that view
 *   createCheckCache(...)           recent results by address, shared by the field and the list
 *   createNodeChecker(...)          the field: debounce while typing, at once on paste, a stale
 *                                   check cancelled, one check in flight
 *   checkMany(...)                  the list: a few at a time, cached results not asked again
 *
 * Privacy: only addresses the user typed or saved are asked, through the node fetch of the main
 * process (shared/nodeFetch.js, shared/security.js nodeRequest: http(s), node API paths, a timeout).
 * No api secret is ever sent from here, not even to a local node.
 */
import { classifyNode, SYNC_TOLERANCE } from './nodeVersion.js';
import { nodeCheckAddress, isPrivateHost } from './nodeAddress.js';
import { defaultNodeFetch } from './nodeFetch.js';

//the ports the node API listens on: mainnet, floonet, usernet
export const NODE_API_PORTS = ['3413', '13413', '23413'];
//a node this close below the network tip is shown "at tip" (the tip comes from a list up to a minute old)
export const AT_TIP_BLOCKS = 2;

const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);

/* the hint for an address that gives no node: wrong scheme first, then an unusual port */
function hintFor(address, c){
  let u;
  try{ u = new URL(address); }catch(e){ return ''; }
  //nginx and others answer plain http on a TLS port with 400
  if(u.protocol == 'http:' && c.kind == 'not_epic' && /^HTTP 400$/.test(c.reason || '') && !isPrivateHost(u.hostname)){
    return 'try_https';
  }
  //a node at home usually speaks plain http, and https to it fails before any reply
  if(u.protocol == 'https:' && c.kind == 'unreachable' && c.code == 'network' && isPrivateHost(u.hostname)){
    return 'try_http';
  }
  if(!NODE_API_PORTS.includes(u.port)){
    return 'port';
  }
  return '';
}

/*
 * classified: classifyNode's result; ms: the time to the first reply (null when none);
 * tipHeight: the network tip (the public node list), 0 when unknown.
 *
 * returns {address, state, tone, version, height, behind, ms, problem, hint}, or null for a
 * check that was cancelled
 *   state    'online' | 'syncing' | 'old' | 'offline' | 'not_epic'
 *   tone     'ok' | 'warn' | 'risk' (the dot)
 *   behind   blocks below the tip (0 = at tip), null when the tip or the height is unknown
 *   problem  '' | 'timeout' | 'unreachable' | 'server_error' | 'not_epic' | 'redirect' | 'too_old' | 'needs_secret'
 *   hint     '' | 'try_https' | 'try_http' | 'port' (only with offline / not_epic)
 */
export function nodeCheckView(classified, {ms = null, tipHeight = 0} = {}){
  const c = classified || {};
  if(c.code == 'cancelled'){
    return null;
  }
  const base = {
    address: c.address || '', state: 'offline', tone: 'risk', version: c.version || null, height: null, behind: null,
    ms: Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null, problem: '', hint: '',
  };

  if(c.kind == 'ok'){
    const status = c.status || {};
    const height = count(Number(status.tip && status.tip.height));
    const tip = Number(tipHeight) || 0;
    const behind = tip > 0 && height !== null ? Math.max(0, tip - height) : null;
    const shownBehind = behind !== null && behind <= AT_TIP_BLOCKS ? 0 : behind;
    const syncing = (status.sync_status && status.sync_status != 'no_sync') || (behind !== null && behind > SYNC_TOLERANCE);
    return {
      ...base,
      state: syncing ? 'syncing' : 'online',
      tone: syncing ? 'warn' : 'ok',
      height,
      behind: shownBehind,
    };
  }
  if(c.kind == 'too_old'){
    return {...base, state: 'old', tone: 'warn', problem: c.code == 'auth' ? 'needs_secret' : 'too_old'};
  }
  if(c.kind == 'not_epic'){
    //a web server (often a proxy in front of the node) answers with an error: the node behind it is down
    if(/^HTTP 5\d\d$/.test(c.reason || '')){
      return {...base, state: 'offline', problem: 'server_error'};
    }
    const redirect = /redirect/.test(c.reason || '');
    return {...base, state: 'not_epic', problem: redirect ? 'redirect' : 'not_epic', hint: redirect ? '' : hintFor(base.address, c)};
  }
  //unreachable: no reply, or a node version but no status
  return {...base, problem: c.code == 'timeout' ? 'timeout' : 'unreachable', hint: c.version ? '' : hintFor(base.address, c)};
}

/*
 * One check of an address (nodeCheckAddress({complete: false}) first: '' asks nothing and gives null).
 * opts: fetch (the main process's by default, see nodeVersion.js), signal, tipHeight (a number or
 * an async function), timeoutMs, now (ms clock).
 * returns the view of nodeCheckView, or null when the address is not one to ask or the check was cancelled
 */
export async function probeNode(text, {fetch: fetchFn, signal, tipHeight = 0, timeoutMs = 6000, now = () => Date.now()} = {}){
  //the field's checker has already waited for a finished host; a saved one ("http://umbrel:3413") is asked as it is
  const address = nodeCheckAddress(text, {complete: false});
  if(!address || (signal && signal.aborted)){
    return null;
  }
  //the response time: from the start to the first reply of any kind (the version request)
  const started = now();
  let firstReply = null;
  const base = fetchFn || defaultNodeFetch();
  const timed = async (...args) => {
    const res = await base(...args);
    if(firstReply === null) firstReply = now() - started;
    return res;
  };
  let tip = 0;
  const referenceHeight = async () => {
    tip = typeof tipHeight === 'function' ? Number(await tipHeight()) || 0 : Number(tipHeight) || 0;
    return tip;
  };
  //never an api secret here: the user may have typed anything
  const classified = await classifyNode(address, {fetch: timed, timeoutMs, signal, referenceHeight});
  if(signal && signal.aborted){
    return null;
  }
  if(classified.kind == 'ok' && !tip){
    await referenceHeight();
  }
  return nodeCheckView(classified, {ms: firstReply, tipHeight: tip});
}

/* recent results by address (nodeCheckAddress form): fresh for ttlMs */
export function createCheckCache({ttlMs = 60000, now = () => Date.now(), max = 100} = {}){
  const map = new Map();
  return {
    get(address){
      const hit = map.get(address);
      return hit && now() - hit.at < ttlMs ? hit.view : null;
    },
    set(address, view){
      if(!view) return;
      map.delete(address);
      map.set(address, {at: now(), view});
      while(map.size > max) map.delete(map.keys().next().value);
    },
    drop(address){ map.delete(address); },
    clear(){ map.clear(); },
  };
}

/*
 * The live check of the address field.
 *   probe(address, {signal}) → view | null    (probeNode with the app's fetch and network tip)
 *   onChange(state)                           after every change of state
 *   state: {phase, address, view}
 *     phase  'idle' (nothing to check) | 'waiting' (debounce) | 'checking' | 'done'
 *
 * input(text, {immediate}): typing waits debounceMs after the last key; a paste (immediate) checks
 * at once. The same address is not asked again while its result is fresh (cache) or a check of it
 * runs; another address cancels the waiting or running one (its signal aborts, a late answer is
 * dropped). recheck() asks the current address again; stop() cancels everything (unmount).
 */
export function createNodeChecker({probe, onChange = () => {}, cache = createCheckCache(), debounceMs = 600,
  setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t)} = {}){

  let state = {phase: 'idle', address: '', view: null};
  let timer = null;
  let controller = null;
  let seq = 0;

  const emit = (patch) => { state = {...state, ...patch}; onChange(state); };
  const cancel = () => {
    if(timer !== null){ clearTimer(timer); timer = null; }
    if(controller){ controller.abort(); controller = null; }
    seq++;
  };

  async function run(address){
    timer = null;
    const mine = ++seq;
    const ctrl = new AbortController();
    controller = ctrl;
    emit({phase: 'checking', address, view: null});
    let view = null;
    try{
      view = await probe(address, {signal: ctrl.signal});
    }catch(e){
      view = null;
    }
    if(mine !== seq || ctrl.signal.aborted){
      return;
    }
    controller = null;
    cache.set(address, view);
    emit({phase: view ? 'done' : 'idle', address, view});
  }

  function schedule(address, wait){
    cancel();
    emit({phase: 'waiting', address, view: null});
    timer = setTimer(() => run(address), wait);
  }

  return {
    get state(){ return state; },
    input(text, {immediate = false} = {}){
      const address = nodeCheckAddress(text);
      if(!address){
        if(state.phase != 'idle' || state.address){
          cancel();
          emit({phase: 'idle', address: '', view: null});
        }
        return;
      }
      if(address === state.address && state.phase != 'idle'){
        //the same address: a paste of it checks a waiting one now, otherwise nothing new to ask
        if(immediate && state.phase == 'waiting') schedule(address, 0);
        return;
      }
      const hit = cache.get(address);
      if(hit){
        cancel();
        emit({phase: 'done', address, view: hit});
        return;
      }
      schedule(address, immediate ? 0 : debounceMs);
    },
    recheck(){
      if(!state.address) return;
      cache.drop(state.address);
      schedule(state.address, 0);
    },
    stop(){
      cancel();
    },
  };
}

/*
 * Checks a list of addresses a few at a time (the My nodes list), asking only those without a
 * fresh result in the cache; onResult(address, view) for each, cached ones at once.
 * signal stops it (the list was closed). Resolves when all are done.
 */
export async function checkMany(addresses, probe, {cache, concurrency = 2, signal, onResult = () => {}} = {}){
  const queue = [];
  for(const a of new Set(addresses)){
    const hit = cache && cache.get(a);
    if(hit) onResult(a, hit);
    else queue.push(a);
  }
  const worker = async () => {
    while(queue.length && !(signal && signal.aborted)){
      const a = queue.shift();
      let view = null;
      try{ view = await probe(a, {signal}); }catch(e){ view = null; }
      if(signal && signal.aborted) return;
      if(cache) cache.set(a, view);
      onResult(a, view);
    }
  };
  await Promise.all(Array.from({length: Math.min(concurrency, queue.length)}, worker));
}
