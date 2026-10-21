/*
 * Sending to a .onion address (tor-616 §5, D2): the GUI exchanges the slate over the wallet's own
 * tor, in the order epic-wallet's own init_send_tx uses with an http sender:
 *
 *   1. parseOnion                                   invalid
 *   2. tor bootstrapped (publishing or ready)       tor_off
 *   3. check_version over tor-foreign               V3 if offered, else V2 (adapters/http.rs)
 *   4. init_send_tx, no send_args, target_slate_version from 3      create (the wallet's message)
 *   5. receive_tx [slate, null, null, null] over tor-foreign → the recipient's slate
 *   6. tx_lock_outputs with that slate, finalize_tx, post_tx
 *
 * Before 6 nothing is locked or stored. A failed lock: nothing to undo (finalize code). A failed
 * finalize: cancel_tx by slate id. A failed post: the transaction is kept ("signed by both wallets,
 * the node didn't take it"), to repost or cancel from Activity.
 *
 * Error codes (§5): invalid, tor_off, unreachable, broken, auth, not_epic, too_old, refused,
 * create, finalize, post (detail: the wallet's or the recipient's message).
 *
 * Plain ESM with the owner API and the foreign call passed in (tests/torSend.test.js); walletService
 * .sendOverTor wires them. Never logs a slate.
 */
import { parseOnion } from './onion.js';

export const STEPS = ['connecting', 'signing', 'posting'];

/* check_version's answer (the JSON-RPC envelope) → {version: 3|2} | {code, detail} */
export function slateVersionFrom(envelope) {
  if (!envelope || typeof envelope !== 'object') return { code: 'not_epic', detail: 'no answer' };
  if (envelope.error) return { code: 'not_epic', detail: String(envelope.error.message || 'error').slice(0, 200) };
  const ok = envelope.result && envelope.result.Ok;
  if (!ok || typeof ok !== 'object') return { code: 'not_epic', detail: 'no result' };
  const api = Number(ok.foreign_api_version);
  const slates = Array.isArray(ok.supported_slate_versions) ? ok.supported_slate_versions : null;
  if (!Number.isFinite(api) || !slates) return { code: 'not_epic', detail: 'not a version answer' };
  if (api < 2) return { code: 'too_old', detail: 'foreign API ' + api };
  if (slates.includes('V3')) return { version: 3 };
  if (slates.includes('V2')) return { version: 2 };
  return { code: 'too_old', detail: slates.join(',') };
}

/* an owner API answer → [Ok, error message] */
function okOf(res) {
  const r = res && res.data ? res.data : res;
  if (r && r.result && r.result.Ok !== undefined && r.result.Ok !== null) return [r.result.Ok, ''];
  if (r && r.result && 'Ok' in r.result) return [null, ''];
  const err = !r ? 'no answer' : r.error ? (r.error.message || JSON.stringify(r.error))
    : r.result && r.result.Err !== undefined ? JSON.stringify(r.result.Err) : 'no result';
  return [undefined, String(err).slice(0, 300)];
}

/* the recipient's error from receive_tx: its message, as plain as it comes */
function recipientError(envelope) {
  if (envelope && envelope.error) return String(envelope.error.message || JSON.stringify(envelope.error)).slice(0, 300);
  const e = envelope && envelope.result && envelope.result.Err;
  if (e !== undefined) return (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 300);
  return 'no slate in the answer';
}

/*
 *   api: {initSend(txData), lockOutputs(slate), finalize(slate), post(tx, fluff), cancel(slateId)},
 *        each resolving the owner API answer ({result: {Ok}} or an error, or false)
 *   foreign(method, params) → {ok, result: envelope} | {ok: false, code, detail} (window.api.tor.foreign
 *        bound to the onion and this send's isolation name)
 *   torReady() → true when tor is bootstrapped (store.state.tor.state publishing or ready)
 *   txData: the init_send_tx args (send_args and target_slate_version are set here)
 *   onStep(step): 'connecting' | 'signing' | 'posting'
 * → {ok: true, slate, slateId} | {ok: false, code, detail, slateId?}
 *   code finalize: cancelled after a failed finalize; finalize_pending: the cancel failed too, the
 *   transaction is still pending in Activity
 */
export async function sendOverTor({ api, foreign, torReady, txData, onion, fluff = true, onStep = () => {} }) {
  const p = parseOnion(onion);
  if (!p.valid) return { ok: false, code: 'invalid', detail: p.reason };
  if (!torReady()) return { ok: false, code: 'tor_off', detail: '' };

  onStep('connecting');
  const cv = await foreign('check_version', []);
  if (!cv || !cv.ok) return { ok: false, code: (cv && cv.code) || 'broken', detail: (cv && cv.detail) || '' };
  const v = slateVersionFrom(cv.result);
  if (v.code) return { ok: false, code: v.code, detail: v.detail };

  const args = Object.assign({}, txData, { send_args: null, target_slate_version: v.version });
  const [slate, createErr] = okOf(await api.initSend(args));
  if (!slate) return { ok: false, code: 'create', detail: createErr };
  const slateId = slate.id || '';

  onStep('signing');
  const rx = await foreign('receive_tx', [slate, null, null, null]);
  if (!rx || !rx.ok) return { ok: false, code: (rx && rx.code) || 'broken', detail: (rx && rx.detail) || '', slateId };
  const theirs = rx.result && rx.result.result && rx.result.result.Ok;
  if (!theirs || typeof theirs !== 'object') return { ok: false, code: 'refused', detail: recipientError(rx.result), slateId };

  const [, lockErr] = okOf(await api.lockOutputs(theirs));
  if (lockErr) return { ok: false, code: 'finalize', detail: lockErr, slateId };

  const [final, finErr] = okOf(await api.finalize(theirs));
  if (!final) {
    //the cancel can fail too: then the outputs stay locked and the user must cancel it in Activity
    const [, cancelErr] = okOf(await Promise.resolve(api.cancel(slateId)).catch((e) => ({ error: { message: (e && e.message) || 'failed' } })));
    if (cancelErr) return { ok: false, code: 'finalize_pending', detail: finErr + '; cancel: ' + cancelErr, slateId };
    return { ok: false, code: 'finalize', detail: finErr, slateId };
  }

  onStep('posting');
  const [, postErr] = okOf(await api.post(final.tx, fluff));
  if (postErr) return { ok: false, code: 'post', detail: postErr, slateId };
  return { ok: true, slate: final, slateId };
}
