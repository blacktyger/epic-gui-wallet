/*
 * What Settings › Node shows about a node's height: how close it is to the network tip (a thin
 * 3-step meter), and when its last block was made (get_header at the tip, relative time).
 * Pure: fetch and the clock are passed in (tests/nodeTip.test.js).
 */
import { defaultNodeFetch } from './nodeFetch.js';

//up to this many blocks below the network tip is level (a block a minute; the tip list is up to a minute old)
export const LEVEL_BLOCKS = 2;
//up to this many blocks (about half an hour) is a little behind; more is far behind
export const NEAR_BLOCKS = 30;

/*
 * behind: blocks below the network tip, null when the tip is unknown
 * returns {level: 'level' | 'near' | 'far' | 'unknown', steps: 3 | 2 | 1 | 0, tone: 'ok' | 'warn' | 'risk' | ''}
 */
export function heightMeter(behind){
  if(!Number.isFinite(behind) || behind === null || behind < 0){
    return {level: 'unknown', steps: 0, tone: ''};
  }
  if(behind <= LEVEL_BLOCKS) return {level: 'level', steps: 3, tone: 'ok'};
  if(behind <= NEAR_BLOCKS) return {level: 'near', steps: 2, tone: 'warn'};
  return {level: 'far', steps: 1, tone: 'risk'};
}

/* "40 sec. ago", "3 min. ago" in the app's locale; ms: the age (a future time counts as now) */
export function relativeAge(ms, locale = 'en'){
  const sec = Math.max(0, Math.round(Number(ms) / 1000));
  let rtf;
  try{
    rtf = new Intl.RelativeTimeFormat(locale, {numeric: 'always', style: 'short'});
  }catch(e){
    rtf = new Intl.RelativeTimeFormat('en', {numeric: 'always', style: 'short'});
  }
  if(sec < 60) return rtf.format(-sec, 'second');
  if(sec < 3600) return rtf.format(-Math.floor(sec / 60), 'minute');
  if(sec < 86400) return rtf.format(-Math.floor(sec / 3600), 'hour');
  return rtf.format(-Math.floor(sec / 86400), 'day');
}

/* the exact date and time of the tooltip */
export function exactTime(ms, locale = 'en'){
  try{
    return new Date(ms).toLocaleString(locale);
  }catch(e){
    return new Date(ms).toLocaleString('en');
  }
}

/* block times by address and height: a block's time never changes, so a new tip is the only reason to ask again */
export function createBlockTimeCache({max = 20} = {}){
  const map = new Map();
  return {
    get(address, height){ return map.get(address + ' ' + height); },
    set(address, height, ms){
      const key = address + ' ' + height;
      map.delete(key);
      map.set(key, ms);
      while(map.size > max) map.delete(map.keys().next().value);
    },
  };
}

/*
 * The time of the node's block at `height`: POST /v2/foreign get_header [height, null, null]
 * (result.Ok.timestamp, RFC 3339). Asked only when the caller shows it, and once per address and
 * height (cache). returns ms since the epoch, or null when the node gives none
 */
export async function fetchBlockTime(address, height, {fetch: fetchFn = defaultNodeFetch(), cache, timeoutMs = 5000, signal} = {}){
  const h = Number(height);
  if(!Number.isSafeInteger(h) || h < 0) return null;
  const base = String(address || '').trim().replace(/\/+$/, '');
  const hit = cache && cache.get(base, h);
  if(hit) return hit;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if(signal){
    if(signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, {once: true});
  }
  try{
    const res = await fetchFn(base + '/v2/foreign', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'get_header', params: [h, null, null]}),
      signal: controller.signal, timeoutMs, redirect: 'manual'});
    const body = res.ok ? await res.json() : null;
    const ms = Date.parse(body && body.result && body.result.Ok && body.result.Ok.timestamp);
    if(!Number.isFinite(ms)) return null;
    if(cache) cache.set(base, h, ms);
    return ms;
  }catch(e){
    return null;
  }finally{
    clearTimeout(timeoutId);
    if(signal) signal.removeEventListener('abort', onAbort);
  }
}
