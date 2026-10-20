/*
 * A wallet for the Send screens: init_send_tx (walletService.issueSendTransaction) answers like
 * epic-wallet 4.1 does (shared/sendMath.js): an estimate gives the fee, or NotEnoughFunds when
 * amount + fee is more than the spendable coins; "send all" (use every coin) pays feeAll.
 */
import { vi } from 'vitest';

export const NANO = 100000000;

export function fakeSendWallet({ spendable = 10 * NANO, fee = 700000, feeAll = 100000, sendResult } = {}) {
  const issueSendTransaction = vi.fn(async (args) => {
    const useAll = !!args.selection_strategy_is_use_all;
    const f = useAll ? feeAll : fee;
    if (args.amount + f > spendable) {
      return { error: { message: 'NotEnoughFunds: ' + JSON.stringify({ available: spendable, needed: args.amount + f }) } };
    }
    if (args.estimate_only) {
      //the coins it would spend: all of them for "send all", else the amount, the fee and some change
      return { result: { Ok: { amount: String(useAll ? spendable : args.amount + f + 1234), fee: String(f) } } };
    }
    return sendResult || { result: { Ok: { id: 'slate-1', amount: String(args.amount), fee: String(f) } } };
  });
  return {
    issueSendTransaction,
    getSummaryInfo: vi.fn(async () => ({ result: { Ok: [true, { amount_currently_spendable: String(spendable) }] } })),
    lastError: '',
    /* the real sends (not the fee estimates) */
    sends: () => issueSendTransaction.mock.calls.map((c) => c[0]).filter((a) => !a.estimate_only),
    estimates: () => issueSendTransaction.mock.calls.map((c) => c[0]).filter((a) => a.estimate_only),
  };
}
