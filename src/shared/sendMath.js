/* Amounts, fees and "Send all" for the send screens, worked out exactly in nanoepic (integers).
   No DOM, no Electron: the amount field, the validators and the tests share it.

   How epic-wallet 4.1.0 picks coins and the fee (libwallet/src/internal/selection.rs,
   select_coins_and_fee):
   - fee = tx_fee(inputs, outputs, 1) = max(4 * outputs + 1 - inputs, 1) * 100000 nanoepic
     (epic core libtx/mod.rs tx_fee, core/transaction.rs TransactionBody::weight, MILLI_EPIC);
   - it first tries without change (1 output); when the selected coins add up to exactly
     amount + that fee, the tx has no change output and charges that fee;
   - otherwise it adds the change outputs and charges the higher fee, or fails with
     NotEnoughFunds { available: total of the coins it tried, needed: amount + fee }.
   So the most a wallet can send is: all spendable coins minus the fee of all of them into one
   output. An estimate for amount = spendable fails with exactly that fee (needed - amount);
   planSendAll() reads it and then checks the result with a second estimate. */

export const NANO_PER_EPIC = 100000000;
const DECIMALS = 8;

//init_send_tx arguments the send screens use (besides amount, message, proof and send_args)
export const MAX_OUTPUTS = 500;
const NORMAL = { num_change_outputs: 1, selection_strategy_is_use_all: false };
/* send all: every spendable coin is an input, so the amount + fee spends them exactly and the
   wallet builds no change output. One change output stays set: with 0 the wallet refuses any
   amount that does not spend the coins exactly (selection.rs validate_change_output_count). */
const ALL = { num_change_outputs: 1, selection_strategy_is_use_all: true };

/* "0.884" (what the user typed, EPIC) -> 88400000. Exact: no floating point.
   null for anything that is not a plain decimal with at most 8 decimals (empty, "1e5", "-1",
   "0,5", "1.123456789"). A Number (an EPIC amount as the store keeps it, e.g. spendable 0.892)
   is rounded to the nearest nanoepic, which is exact for anything that came from nanoepic / 1e8. */
export function epicToNano(value){
  if(typeof value == 'number'){
    return Number.isFinite(value) && value >= 0 ? Math.round(value * NANO_PER_EPIC) : null;
  }
  const s = String(value === null || value === undefined ? '' : value).trim();
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if(!m || (m[1] === '' && !m[2])){
    return null;
  }
  const frac = m[2] || '';
  if(frac.length > DECIMALS){
    return null;
  }
  const n = Number(m[1] || '0') * NANO_PER_EPIC + Number((frac + '00000000').slice(0, DECIMALS));
  return Number.isSafeInteger(n) ? n : null;
}

/* why epicToNano refused a typed amount: 'number' or 'decimals' (more than 8) */
export function amountProblem(value){
  const s = String(value === null || value === undefined ? '' : value).trim();
  if(/^\d*\.\d{9,}$/.test(s)){
    return 'decimals';
  }
  return epicToNano(s) === null ? 'number' : null;
}

/* 88900000 -> "0.889": the shortest exact EPIC string, for the amount input */
export function nanoToEpicString(nano){
  const n = Math.trunc(Number(nano));
  const neg = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const int = Math.floor(abs / NANO_PER_EPIC);
  const frac = String(abs % NANO_PER_EPIC).padStart(DECIMALS, '0').replace(/0+$/, '');
  return neg + int + (frac ? '.' + frac : '');
}

/* 88900000 -> 0.889, a Number in EPIC as the store and the display helpers use */
export function nanoToEpic(nano){
  return Number(nanoToEpicString(nano));
}

/* an integer the wallet sent (u64 as a JSON number or, string_or_u64, a digit string) */
export function parseNano(value){
  if(typeof value == 'number'){
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if(typeof value == 'string' && /^\d+$/.test(value)){
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

/* the init_send_tx arguments that decide coins and fee: the same for the estimate and the send */
export function selectionArgs(sendAll){
  return Object.assign({}, sendAll ? ALL : NORMAL);
}

/* init_send_tx arguments of a fee estimate for amountNano */
export function estimateArgs(amountNano, minimumConfirmations, sendAll = false){
  return Object.assign({
    src_acct_name: null,
    amount: amountNano,
    message: '',
    minimum_confirmations: minimumConfirmations,
    max_outputs: MAX_OUTPUTS,
    target_slate_version: null,
    ttl_blocks: null,
    estimate_only: true,
    payment_proof_recipient_address: null,
  }, selectionArgs(sendAll));
}

/* The "NotEnoughFunds: {...}" error message of the owner API (controller.rs check_error_response
   turns result.Err {NotEnoughFunds: {...}} into "NotEnoughFunds: <json>"): {available, needed}
   in nanoepic, or null for any other message */
export function parseNotEnoughFunds(message){
  const s = String(message || '');
  const i = s.indexOf('NotEnoughFunds:');
  if(i < 0){
    return null;
  }
  try{
    const o = JSON.parse(s.slice(i + 'NotEnoughFunds:'.length));
    const available = parseNano(o && o.available);
    const needed = parseNano(o && o.needed);
    return available === null || needed === null ? null : { available, needed };
  }catch(e){
    return null;
  }
}

/* What an estimate (init_send_tx with estimate_only) answered, from walletService's result:
   { ok: true, total, fee }   total: the coins it would spend (owner.rs puts it in slate.amount)
   { ok: false, notEnough: { available, needed } }
   { ok: false, error: '...' } anything else (wallet API down, wallet locked, ...) */
export function readEstimate(res){
  if(res && res.result && res.result.Ok){
    const total = parseNano(res.result.Ok.amount);
    const fee = parseNano(res.result.Ok.fee);
    if(total !== null && fee !== null && fee > 0){
      return { ok: true, total, fee };
    }
    return { ok: false, error: 'unexpected estimate' };
  }
  const message = res && res.error ? String(res.error.message || '') : '';
  const notEnough = parseNotEnoughFunds(message);
  if(notEnough){
    return { ok: false, notEnough };
  }
  return { ok: false, error: message || 'no answer from the wallet' };
}

/* The fee the wallet charges for amountNano, from an estimate for exactly that amount:
   { fee } it can be sent; { fee, short: true } not enough funds (fee is the one it would need,
   available what it has); null when it is not known (the estimate failed otherwise) */
export function feeFromEstimate(amountNano, est){
  if(!est){
    return null;
  }
  if(est.ok){
    //total: coins the wallet holds for it (a lower bound of its spendable balance)
    return { fee: est.fee, available: est.total, short: amountNano + est.fee > est.total };
  }
  if(est.notEnough){
    return {
      fee: Math.max(est.notEnough.needed - amountNano, 0),
      available: est.notEnough.available,
      short: true,
    };
  }
  return null;
}

/* Amount + fee fit in what can be spent: exact, in nanoepic. An unknown fee (null) only asks for
   less than everything, as every transaction pays a fee. */
export function fitsSpendable(amountNano, feeNano, spendableNano){
  if(!(amountNano > 0) || !(spendableNano >= 0)){
    return false;
  }
  if(feeNano === null || feeNano === undefined){
    return amountNano < spendableNano;
  }
  return amountNano + feeNano <= spendableNano;
}

/* The most that can be sent and its fee: { amount, fee, total } in nanoepic, or
   { error: 'empty' } (nothing to send after the fee) / { error: '<wallet message>' }.
   estimate(amountNano) runs init_send_tx with estimate_only and selectionArgs(true) and resolves
   to readEstimate()'s answer. startNano: the spendable balance the screen knows (may be stale:
   the wallet's own answers correct it). Usually two estimates: the first, for everything, fails
   with the fee of spending all coins into one output; the second confirms the amount left. */
export async function planSendAll(estimate, startNano, maxTries = 5){
  let amount = startNano > 0 ? startNano : 1;
  for(let i = 0; i < maxTries; i++){
    const est = await estimate(amount);
    if(est && est.ok){
      if(amount + est.fee === est.total){
        return { amount, fee: est.fee, total: est.total };
      }
      //change left over (the balance grew): ask for everything it would spend
      amount = est.total;
      continue;
    }
    if(est && est.notEnough){
      const fee = est.notEnough.needed - amount;
      const next = est.notEnough.available - fee;
      if(!(fee > 0)){
        return { error: 'unexpected estimate' };
      }
      if(next <= 0){
        return { error: 'empty' };
      }
      amount = next;
      continue;
    }
    return { error: (est && est.error) || 'no answer from the wallet' };
  }
  return { error: 'the balance kept changing' };
}

/* Only the latest of overlapping requests counts: a slow estimate for "0.8" must not overwrite
   the one for "0.88" typed after it. latest(fn) runs fn() and resolves to
   { current: true, value } or, when another latest() call started meanwhile, { current: false }. */
export function latestOnly(){
  let seq = 0;
  const latest = async (fn) => {
    const mine = ++seq;
    const value = await fn();
    return mine === seq ? { current: true, value } : { current: false };
  };
  //forget whatever is in flight (the input changed and nothing should be estimated)
  latest.cancel = () => { seq++; };
  return latest;
}
