/*
 * A transaction's payment proof (tx.payment_proof from the wallet), read-only. The GUI no longer
 * asks for proofs (6.1.3), but one a transaction already has (a sender asked for it, or an older
 * transaction) still shows in the transaction's details; without one, nothing shows.
 *
 * No Vue or DOM imports, so it runs under `node --test` (tests/paymentProof.test.js).
 */
import { truncateMid } from '../components/modern/format.js';

/* the proof's fields in the order shown, and whether each gets a copy button */
const FIELDS = [
  ['receiver_address', true],
  ['receiver_signature', true],
  ['sender_address', true],
  ['sender_signature', true],
  ['sender_address_path', false],
];

/* the rows to show for a proof ([] for none); t: the i18n lookup for msg.transaction.* labels */
export function proofFields(proof, t) {
  if (!proof || typeof proof != 'object') return [];
  return FIELDS.map(([key, copy]) => {
    const value = proof[key] === undefined || proof[key] === null ? '' : String(proof[key]);
    return { key, label: t('msg.transaction.' + key), value, short: truncateMid(value, 12), copy };
  });
}
