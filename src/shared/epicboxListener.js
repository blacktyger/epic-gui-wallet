/*
 * What an Epicbox listener (`epic-wallet listen -m epicbox`, 4.1.0) says on stdout, as events the
 * app can act on: which server it really connected to, and when it handled a slate (so the
 * balance and the transactions are refreshed at once, not on the next 60 s poll).
 *
 * Also when the short-lived listener that checks the old server after a switch is done: once it
 * is subscribed, has handled what was queued there and nothing more came for a while.
 *
 * The lines come from impls/src/adapters/epicbox.rs and controller/src/command.rs of 4.1.0; the
 * GUI sets stdout_log_level = "Debug", so the debug lines are there too. Plain ESM, no app
 * imports (tests/epicboxListener.test.js).
 */
import { serverFromUrl } from './epicboxConfig.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/* chunks of stdout → whole lines; the last, unfinished line waits for the next chunk */
export function createLineSplitter(maxLine = 64 * 1024) {
  let rest = '';
  return function push(chunk) {
    const text = rest + String(chunk == null ? '' : chunk);
    const lines = text.split(/\r?\n/);
    rest = lines.pop();
    //a line without an end (binary noise): don't keep growing
    if (rest.length > maxLine) rest = rest.slice(-maxLine);
    return lines;
  };
}

const SLATE_ID = /Slate \[([0-9a-fA-F-]{8,})\]/;

/*
 * One stdout line → an event, or null:
 *   {type: 'connecting', url, server}   "Connecting to the epicbox server at wss://host:443 .."
 *   {type: 'listening', address}        "Starting epicbox listener for: <key>@<domain>"
 *   {type: 'subscribed'}                "Starting epicbox subscription..." (queued slates come now)
 *   {type: 'paused'}                    node not synced: the listener holds slates
 *   {type: 'disconnected'}              the connection broke; the wallet reconnects (5 times)
 *   {type: 'slate', stage, id}          stage: received (a payment), reply (the answer to our send),
 *                                       signing, finalizing, replied (our answer posted),
 *                                       finalized, mempool, failed
 */
export function parseListenerLine(raw) {
  const line = String(raw == null ? '' : raw).replace(ANSI, '');
  let m = line.match(/Connecting to the epicbox server at (\S+?)\s*(?:\.\.|$)/);
  if (m) return { type: 'connecting', url: m[1], server: serverFromUrl(m[1]) };
  m = line.match(/Starting epicbox listener for: (\S+)/);
  if (m) return { type: 'listening', address: m[1] };
  if (/Starting epicbox subscription/.test(line)) return { type: 'subscribed' };
  if (/Node not synced, pausing Epicbox/.test(line)) return { type: 'paused' };
  if (/Error in listener loop|Client closed connection|Reconnect to epicbox/.test(line)) return { type: 'disconnected' };
  const id = (line.match(SLATE_ID) || [])[1] || '';
  if (/Slate \[[^\]]+\] received back from/.test(line)) return { type: 'slate', stage: 'reply', id };
  if (/Slate \[[^\]]+\] received from/.test(line)) return { type: 'slate', stage: 'received', id };
  if (/Receive new transaction \(foreign::receive_tx\)/.test(line)) return { type: 'slate', stage: 'signing', id };
  if (/Finalize transaction \(owner::finalize_tx\)/.test(line)) return { type: 'slate', stage: 'finalizing', id };
  if (/Slate sent successfully/.test(line)) return { type: 'slate', stage: 'replied', id };
  if (/Slate \[[^\]]+\] finalized successfully/.test(line)) return { type: 'slate', stage: 'finalized', id };
  if (/found in mempool and marked as TxSentMempool|not found in mempool after waiting/.test(line)) return { type: 'slate', stage: 'mempool', id };
  if (/Error process incoming slate|EpicboxReceiveTx/.test(line)) return { type: 'slate', stage: 'failed', id };
  return null;
}

/* the wallet's data changed: refresh balance and transactions now */
export function wantsRefresh(ev) {
  return !!ev && ev.type === 'slate' && ['replied', 'finalized', 'mempool', 'failed'].includes(ev.stage);
}

/* stages after which the listener is still working on a slate */
const BUSY = ['received', 'reply', 'signing', 'finalizing'];

export const CHECK_TIMES = {
  //no connection to the old server within this: give up on it
  connect: 30 * 1000,
  //subscribed and nothing came for this long: the queue there is empty
  idle: 15 * 1000,
  //a slate being handled: at most this long after its last line (4.1.0 then waits up to 4 min for
  //the mempool, after the tx has been posted; stopping it then loses nothing)
  busy: 45 * 1000,
  //never longer than this in all
  max: 3 * 60 * 1000,
};

/*
 * The listener that checks the old server: feed it its events and the time; done says it can be
 * stopped. state: {started, subscribed, last, busy, handled}; why: 'empty' | 'drained' | 'timeout'
 * | 'no_connection' | 'exited'.
 */
export function createOldServerCheck(now, times = CHECK_TIMES) {
  return { started: now, subscribed: false, last: now, busy: false, handled: 0, times };
}

export function oldServerCheckStep(state, ev, now) {
  const s = Object.assign({}, state);
  if (ev) {
    if (ev.type === 'exit') return { state: s, done: true, why: 'exited' };
    if (ev.type === 'subscribed' || ev.type === 'listening') {
      s.subscribed = true;
      s.last = now;
    } else if (ev.type === 'slate') {
      s.last = now;
      s.busy = BUSY.includes(ev.stage);
      if (['replied', 'finalized', 'failed'].includes(ev.stage)) s.handled += 1;
    }
  }
  const t = s.times;
  if (now - s.started >= t.max) return { state: s, done: true, why: 'timeout' };
  if (!s.subscribed) {
    return now - s.started >= t.connect ? { state: s, done: true, why: 'no_connection' } : { state: s, done: false };
  }
  if (s.busy) {
    return now - s.last >= t.busy ? { state: s, done: true, why: 'timeout' } : { state: s, done: false };
  }
  if (now - s.last >= t.idle) return { state: s, done: true, why: s.handled ? 'drained' : 'empty' };
  return { state: s, done: false };
}
