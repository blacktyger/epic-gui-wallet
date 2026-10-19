// Tests for src/shared/sendMath.js: run with `npm test` (node --test, no extra dependency).
// The wallet below is a line-by-line port of epic-wallet v4.1.0 coin selection
// (libwallet/src/internal/selection.rs select_coins_and_fee / select_coins / select_from /
// calculate_change_amounts) and of epic core v4.1.0 tx_fee, so "Send all" is checked against the
// rules the real wallet applies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  epicToNano, nanoToEpicString, nanoToEpic, parseNano, amountProblem, parseNotEnoughFunds,
  readEstimate, feeFromEstimate, fitsSpendable, planSendAll, selectionArgs, estimateArgs,
  latestOnly, MAX_OUTPUTS,
} from '../src/shared/sendMath.js';

const E = 100000000;
const MILLI = E / 1000;

//core/src/libtx/mod.rs:40 tx_fee, core/src/core/transaction.rs:671 weight
function txFee(inputs, outputs, kernels = 1){
  return Math.max(outputs * 4 + kernels - inputs, 1) * MILLI;
}

class NotEnoughFunds extends Error {
  constructor(available, needed){
    super('NotEnoughFunds');
    this.available = available;
    this.needed = needed;
  }
}
class ArgumentError extends Error {}

//selection.rs:677 select_from
function selectFrom(amount, selectAll, outputs){
  const total = outputs.reduce((s, v) => s + v, 0);
  if(total < amount) return null;
  if(selectAll) return outputs.slice();
  let selected = 0;
  const out = [];
  for(const v of outputs){
    if(selected >= amount) break;
    selected += v;
    out.push(v);
  }
  return out;
}

//selection.rs:607 select_coins: [max_available, coins]
function selectCoins(coins, amount, maxOutputs, selectAll){
  const eligible = coins.slice().sort((a, b) => a - b);
  const maxAvailable = eligible.length;
  if(eligible.length > maxOutputs){
    for(let i = 0; i + maxOutputs <= eligible.length; i++){
      const r = selectFrom(amount, selectAll, eligible.slice(i, i + maxOutputs));
      if(r) return [maxAvailable, r];
    }
    const r = selectFrom(amount, false, eligible);
    if(r) return [maxAvailable, r];
  }else{
    const r = selectFrom(amount, selectAll, eligible);
    if(r) return [maxAvailable, r];
  }
  return [maxAvailable, eligible.reverse().slice(0, maxOutputs)];
}

//selection.rs:438 select_coins_and_fee: { coins, total, fee }
function selectCoinsAndFee(wallet, amount, maxOutputs, changeOutputs, useAll){
  const sel = selectCoins(wallet, amount, maxOutputs, useAll);
  const maxAvailable = sel[0];
  let coins = sel[1];
  const sum = (c) => c.reduce((s, v) => s + v, 0);
  let fee = txFee(coins.length, 1);
  let total = sum(coins);
  let withFee = amount + fee;
  if(total === 0) throw new NotEnoughFunds(0, withFee);
  if(total < withFee && coins.length === maxAvailable) throw new NotEnoughFunds(total, withFee);
  if(total !== withFee){
    if(changeOutputs === 0) throw new ArgumentError('number of change outputs must be between 1 and ...');
    const numOutputs = changeOutputs + 1;
    fee = txFee(coins.length, numOutputs);
    withFee = amount + fee;
    while(total < withFee){
      if(coins.length === maxAvailable) throw new NotEnoughFunds(total, withFee);
      coins = selectCoins(wallet, withFee, maxOutputs, useAll)[1];
      fee = txFee(coins.length, numOutputs);
      total = sum(coins);
      withFee = amount + fee;
    }
  }
  return { coins, total, fee };
}

//selection.rs:71 calculate_change_amounts
function changeAmounts(total, amount, fee, n){
  const change = total - (amount + fee);
  if(change < 0) throw new NotEnoughFunds(total, amount + fee);
  if(change === 0) return [];
  const part = Math.floor(change / n);
  return [...Array(n - 1).fill(part), part + change % n];
}

/* owner_rpc init_send_tx as walletService.issueSendTransaction resolves it (the decrypted
   JSON-RPC response; controller.rs:521 check_error_response makes the error message) */
function rpc(wallet, args){
  try{
    const { coins, total, fee } = selectCoinsAndFee(wallet.coins, Number(args.amount), args.max_outputs, args.num_change_outputs, args.selection_strategy_is_use_all);
    wallet.calls.push(args);
    if(args.estimate_only){
      //owner.rs:417: the estimate returns the total of the selected coins as the amount
      return { result: { Ok: { amount: String(total), fee: String(fee) } } };
    }
    const change = changeAmounts(total, Number(args.amount), fee, args.num_change_outputs);
    for(const c of coins) wallet.coins.splice(wallet.coins.indexOf(c), 1);
    wallet.coins.push(...change);
    wallet.sent = { amount: Number(args.amount), fee, inputs: coins.length, outputs: 1 + change.length, change };
    //slate.rs:659 check_fees, as the recipient / finalize run it
    assert.ok(fee >= txFee(coins.length, 1 + change.length), 'fee dispute');
    return { result: { Ok: { amount: String(args.amount), fee: String(fee) } } };
  }catch(e){
    wallet.calls.push(args);
    if(e instanceof NotEnoughFunds){
      const body = { available: e.available, available_disp: nanoToEpicString(e.available), needed: e.needed, needed_disp: nanoToEpicString(e.needed) };
      return { jsonrpc: '2.0', id: 1, error: { message: 'NotEnoughFunds: ' + JSON.stringify(body), code: -32099 } };
    }
    return { jsonrpc: '2.0', id: 1, error: { message: 'ArgumentError: ' + e.message, code: -32099 } };
  }
}

function makeWallet(coinsEpic){
  return { coins: coinsEpic.map(epicToNano), calls: [], sent: null };
}
const spendable = (w) => w.coins.reduce((s, v) => s + v, 0);
//what amountField does: an estimate with the send-all selection
const estimator = (w) => async (amount) => readEstimate(rpc(w, estimateArgs(amount, 3, true)));

function send(w, amount, sendAll){
  return rpc(w, Object.assign({ src_acct_name: null, amount, minimum_confirmations: 3, max_outputs: MAX_OUTPUTS, message: '', send_args: null }, selectionArgs(sendAll)));
}

test('typed amounts convert to nanoepic exactly', () => {
  assert.equal(epicToNano('0.884'), 88400000);
  assert.equal(epicToNano('0.29'), 29000000); //0.29 * 1e8 is 28999999.999999996
  assert.equal(epicToNano('1.1'), 110000000);
  assert.equal(epicToNano(' 4.35 '), 435000000);
  assert.equal(epicToNano('.5'), 50000000);
  assert.equal(epicToNano('5.'), 500000000);
  assert.equal(epicToNano('0.00000001'), 1);
  assert.equal(epicToNano('21000000'), 21000000 * E);
  for(const bad of ['', ' ', '.', 'abc', '1e5', '-1', '0,5', '1.123456789', '0x10', null, undefined]){
    assert.equal(epicToNano(bad), null, JSON.stringify(bad));
  }
  //store numbers (nanoepic / 1e8)
  assert.equal(epicToNano(0.892), 89200000);
  assert.equal(epicToNano(89200000 / E), 89200000);
  assert.equal(epicToNano(-1), null);
  assert.equal(amountProblem('1.123456789'), 'decimals');
  assert.equal(amountProblem('abc'), 'number');
  assert.equal(amountProblem('0.5'), null);
});

test('nanoepic back to EPIC', () => {
  assert.equal(nanoToEpicString(88900000), '0.889');
  assert.equal(nanoToEpicString(100000000), '1');
  assert.equal(nanoToEpicString(1), '0.00000001');
  assert.equal(nanoToEpicString(0), '0');
  assert.equal(nanoToEpic(89200000), 0.892);
  assert.equal(parseNano('800000'), 800000);
  assert.equal(parseNano(800000), 800000);
  assert.equal(parseNano('0.008'), null);
  assert.equal(parseNano(0.5), null);
});

test('fee formula matches the fees seen on mainnet', () => {
  assert.equal(txFee(1, 2), 800000); //0.008: 1 input, recipient + change
  assert.equal(txFee(2, 1), 300000); //0.003: the test wallet's send-all
  assert.equal(txFee(2, 2), 700000); //0.007
  assert.equal(txFee(9, 1), 100000); //never below one base fee
});

test('NotEnoughFunds error message is parsed', () => {
  const msg = 'NotEnoughFunds: {"available":89200000,"available_disp":"0.892","needed":89500000,"needed_disp":"0.895"}';
  assert.deepEqual(parseNotEnoughFunds(msg), { available: 89200000, needed: 89500000 });
  assert.equal(parseNotEnoughFunds('ArgumentError: x'), null);
  assert.equal(parseNotEnoughFunds('NotEnoughFunds: {broken'), null);
  assert.deepEqual(readEstimate({ error: { message: msg } }), { ok: false, notEnough: { available: 89200000, needed: 89500000 } });
  assert.deepEqual(readEstimate({ result: { Ok: { amount: '89200000', fee: '300000' } } }), { ok: true, total: 89200000, fee: 300000 });
  assert.equal(readEstimate(false).ok, false);
  assert.ok(readEstimate(false).error);
  assert.equal(readEstimate({ error: { message: 'Wallet is locked' } }).error, 'Wallet is locked');
});

test('send all on the mainnet test wallet (0.892 in 2 coins): 0.889 + 0.003 fee, wallet emptied', async () => {
  const w = makeWallet(['0.392', '0.5']);
  assert.equal(spendable(w), 89200000);
  const plan = await planSendAll(estimator(w), spendable(w));
  assert.deepEqual(plan, { amount: 88900000, fee: 300000, total: 89200000 });
  assert.equal(w.calls.length, 2);
  assert.ok(w.calls.every(a => a.selection_strategy_is_use_all === true && a.num_change_outputs === 1 && a.estimate_only));
  const res = send(w, plan.amount, true);
  assert.ok(res.result && res.result.Ok, JSON.stringify(res));
  assert.deepEqual(w.sent, { amount: 88900000, fee: 300000, inputs: 2, outputs: 1, change: [] });
  assert.equal(spendable(w), 0);
});

test('send all also works with the normal selection, but use_all is what guarantees every coin', async () => {
  const w = makeWallet(['0.392', '0.5']);
  const plan = await planSendAll(estimator(w), spendable(w));
  const res = send(w, plan.amount, false);
  assert.ok(res.result && res.result.Ok);
  assert.equal(w.sent.fee, 300000);
  assert.equal(spendable(w), 0);
});

test('send all: one coin, many coins, many small coins', async () => {
  for(const [coins, fee] of [[['1'], 400000], [['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7'], 100000], [Array(40).fill('0.01'), 100000]]){
    const w = makeWallet(coins);
    const before = spendable(w);
    const plan = await planSendAll(estimator(w), before);
    assert.equal(plan.fee, fee, coins.join(','));
    assert.equal(plan.amount + plan.fee, before);
    assert.ok(send(w, plan.amount, true).result.Ok);
    assert.equal(w.sent.change.length, 0);
    assert.equal(spendable(w), 0);
  }
});

test('send all corrects a stale balance (screen shows more or less than the wallet has)', async () => {
  for(const start of [89200000 + 50000000, 10000000, 0]){
    const w = makeWallet(['0.392', '0.5']);
    const plan = await planSendAll(estimator(w), start);
    assert.deepEqual(plan, { amount: 88900000, fee: 300000, total: 89200000 }, String(start));
  }
});

test('send all with nothing to send', async () => {
  assert.deepEqual(await planSendAll(estimator(makeWallet([])), 0), { error: 'empty' });
  //one dust coin smaller than its own fee
  assert.deepEqual(await planSendAll(estimator(makeWallet(['0.0003'])), 30000), { error: 'empty' });
  //the wallet API does not answer
  const down = await planSendAll(async () => readEstimate(false), 89200000);
  assert.ok(down.error && down.error !== 'empty');
});

test('typed amounts near the balance: the fee of that amount decides, not a 0.01 margin', () => {
  const w = makeWallet(['0.392', '0.5']);
  const S = spendable(w);
  const check = (typed) => {
    const amount = epicToNano(typed);
    const f = feeFromEstimate(amount, readEstimate(rpc(w, estimateArgs(amount, 3, false))));
    return { fee: f.fee, ok: !f.short && fitsSpendable(amount, f.fee, S) };
  };
  assert.deepEqual(check('0.889'), { fee: 300000, ok: true });  //exact: no change output
  assert.deepEqual(check('0.885'), { fee: 700000, ok: true });  //with change: 0.885 + 0.007 = 0.892
  assert.deepEqual(check('0.884'), { fee: 700000, ok: true });  //0.001 change
  assert.deepEqual(check('0.887'), { fee: 700000, ok: false }); //needs change it cannot pay for
  assert.deepEqual(check('0.892'), { fee: 300000, ok: false });
  assert.deepEqual(check('0.3'), { fee: 800000, ok: true });    //smallest coin first: 1 input + change
  assert.deepEqual(check('0.5'), { fee: 700000, ok: true });    //0.392 is not enough alone: 2 inputs
});

test('fitsSpendable is exact', () => {
  assert.equal(fitsSpendable(88900000, 300000, 89200000), true);
  assert.equal(fitsSpendable(88900001, 300000, 89200000), false);
  assert.equal(fitsSpendable(epicToNano('0.29'), 100000, epicToNano(0.29 + 0.001)), true);
  assert.equal(fitsSpendable(0, 100000, 89200000), false);
  //fee unknown: anything below the balance
  assert.equal(fitsSpendable(89199999, null, 89200000), true);
  assert.equal(fitsSpendable(89200000, null, 89200000), false);
});

test('regression: 0 change outputs make the wallet refuse any amount that is not exact', () => {
  const w = makeWallet(['0.392', '0.5']);
  const res = rpc(w, Object.assign(estimateArgs(50000000, 3), { num_change_outputs: 0 }));
  assert.match(res.error.message, /ArgumentError/);
});

test('only the latest estimate counts', async () => {
  const latest = latestOnly();
  let release;
  const slow = latest(() => new Promise(r => { release = () => r('slow'); }));
  const fast = latest(async () => 'fast');
  assert.deepEqual(await fast, { current: true, value: 'fast' });
  release();
  assert.deepEqual(await slow, { current: false });
  const again = latest(async () => 'x');
  latest.cancel();
  assert.deepEqual(await again, { current: false });
});
