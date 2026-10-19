/*
 * One-time cleanup of a saved node address (wallet config.json check_node_api_http_addr) carried
 * over from an older GUI. Pure: no window, no config; the network step takes an injectable fetch.
 * Used at login (shared/nodeAddressMigration.js) and by the 6.1 importer.
 *
 *   cleanNodeAddress(address, {network})            offline: format, scheme, dead GUI fallbacks
 *   probeNodeAddress(url, suggest, {fetch, timeoutMs}) network: http -> https or :3413, only if that answers
 */
import { fetchNodeVersion, isLocal } from './nodeVersion.js';

//the remote node new GUIs fall back to (configService.nodeFallBack); mainnet only
export const MAINNET_FALLBACK_NODE = 'https://node.epiccash.com:3413';
//the built-in node listens here on every network
export const LOCAL_NODE = 'http://127.0.0.1:3413';
export const NODE_API_PORT = '3413';

//fallbacks of older GUIs that are gone: fastepic.eu (4.0 - 5.2.3, no DNS), 116.203.211.229 (3.0.1, no reply)
const DEAD_FALLBACK_HOSTS = [/^(.+\.)?fastepic\.eu$/i, /^116\.203\.211\.229$/];
//mainnet nodes a GUI may have saved by default; a floonet/usernet wallet can't use them
const MAINNET_DEFAULT_HOSTS = [/^node\.epiccash\.com$/i, ...DEAD_FALLBACK_HOSTS];

const isDeadFallback = (host) => DEAD_FALLBACK_HOSTS.some(re => re.test(host));
const isMainnetDefault = (host) => MAINNET_DEFAULT_HOSTS.some(re => re.test(host));
const hasScheme = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?([/?#]|$)/i;

/*
 * address: the saved address; network: 'mainnet' | 'floonet' | 'usernet' (the wallet's)
 *
 * returns {url, changed, reason, suggest}
 *   url      the cleaned address (the input, trimmed, when it can't be parsed)
 *   changed  url differs from the saved address
 *   reason   why: '' (nothing to do), 'format' (spaces, trailing slash, letter case only),
 *            'scheme_added', 'local_http' (https -> http for the local node), 'dead_fallback'
 *            (an old GUI's dead fallback node -> the current one), 'mainnet_node_on_testnet'
 *            (a floonet/usernet wallet on a mainnet node -> the built-in node), 'empty', 'invalid'
 *   suggest  addresses worth trying instead if url gives no node version (for probeNodeAddress), in
 *            order; [] when url is not suspicious. Always the same host
 *
 * Idempotent: cleaning url again gives {url, changed: false, reason: ''}; suggest stays the same,
 * except that a guessed scheme (reason 'scheme_added') is no longer a guess then.
 */
export function cleanNodeAddress(address, {network = 'mainnet'} = {}){

  const saved = typeof address === 'string' ? address : '';
  let s = saved.trim().replace(/\/+$/, '');
  const result = (url, reason, suggest = []) => ({url, changed: url !== saved, reason: url !== saved ? reason : '', suggest});

  if(!s){
    return {url: saved, changed: false, reason: 'empty', suggest: []};
  }
  //a scheme and nothing else ("http://")
  if(/^[a-z][a-z0-9+.-]*:\/*$/i.test(s)){
    return {url: saved, changed: false, reason: 'invalid', suggest: []};
  }

  let reason = 'format';
  let schemeAdded = false;
  if(!hasScheme(s)){
    s = (LOCAL_HOST.test(s) ? 'http://' : 'https://') + s;
    reason = 'scheme_added';
    schemeAdded = true;
  }

  let u;
  try{
    u = new URL(s);
  }catch(e){
    return {url: saved, changed: false, reason: 'invalid', suggest: []};
  }
  if(!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password){
    //not something to rewrite (credentials in the URL, another scheme): leave it to the user
    return {url: saved, changed: false, reason: 'invalid', suggest: []};
  }

  const host = u.hostname;
  const testnet = network == 'floonet' || network == 'usernet';

  if(testnet && isMainnetDefault(host)){
    return result(LOCAL_NODE, 'mainnet_node_on_testnet');
  }
  if(isDeadFallback(host)){
    return result(MAINNET_FALLBACK_NODE, 'dead_fallback');
  }

  if(isLocal(u.href) && u.protocol == 'https:'){
    u.protocol = 'http:';
    reason = 'local_http';
  }

  //scheme://host[:port][/path], no query or hash; the URL parser lowercases scheme and host
  //and drops a default port (https://x:443 -> https://x)
  const path = u.pathname.replace(/\/+$/, '');
  const url = u.protocol + '//' + u.host + path;

  //suspicious: http:// to a remote host (nginx answers 400 when the port is TLS), a remote address
  //without a port (the node API is on 3413), or a scheme we guessed
  const suggest = [];
  if(!isLocal(url)){
    const add = (c) => { if(c !== url && !suggest.includes(c)) suggest.push(c); };
    const withPort = (proto) => proto + '//' + host + ':' + NODE_API_PORT + path;
    const noPort = !u.port;
    if(u.protocol == 'http:'){
      add('https://' + u.host + path);
      if(noPort){
        add(withPort('https:'));
        add(withPort('http:'));
      }
    }else{
      if(noPort){
        add(withPort('https:'));
      }
      if(schemeAdded){
        //"1.2.3.4:3413": a self-hosted node often speaks plain http
        add('http://' + u.host + path);
        if(noPort){
          add(withPort('http:'));
        }
      }
    }
  }

  return result(url, reason, suggest);
}

/*
 * The network step, for a cleaned address with suggestions: keep url if it answers like an Epic node;
 * else switch to the first suggestion that answers with a node version; else keep url.
 * Never another host. All are asked at once, within timeoutMs. Redirects are not followed: the
 * wallet (epic-wallet) would not follow an http -> https redirect either.
 *
 * returns {url, changed, reason}
 *   changed  url is one of the suggestions
 *   reason   'answers' (url is fine), 'switched', 'no_answer' (nothing answered: url kept), 'skipped' (no suggestions)
 */
export async function probeNodeAddress(url, suggest = [], {fetch: fetchFn, timeoutMs = 5000} = {}){

  if(!suggest || !suggest.length){
    return {url, changed: false, reason: 'skipped'};
  }
  const opts = {timeoutMs, redirect: 'manual', ...(fetchFn ? {fetch: fetchFn} : {})};
  //all asked at once; the answers are read in order, so a healthy address returns as soon as it answers
  const [own, ...others] = [url, ...suggest].map(c => fetchNodeVersion(c, opts));

  //a remote 401 is an older node with an api secret: an Epic node, keep it (the notice explains it)
  const ownReply = await own;
  if(ownReply.ok || ownReply.reason == 'HTTP 401'){
    return {url, changed: false, reason: 'answers'};
  }
  for(let i = 0; i < others.length; i++){
    if((await others[i]).ok){
      return {url: suggest[i], changed: true, reason: 'switched'};
    }
  }
  return {url, changed: false, reason: 'no_answer'};
}
