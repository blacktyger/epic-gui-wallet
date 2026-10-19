/*
 * The Send form after a successful send (Classic HttpSend.vue and the Modern SendView.vue): the
 * amount, recipient, proof address and message are cleared and the form stays "sent" (Send /
 * Review send disabled) until something new is typed, so a second send can't start by accident.
 *
 * No Vue or DOM imports, so it runs under `node --test` (tests/sendForm.test.js).
 */

/* vm: the send component (its field refs, message, withproof, address book state) */
export function clearSendForm(vm) {
  if (vm.amountField) vm.amountField.input = '';
  if (vm.addressField && vm.addressField.setValue) vm.addressField.setValue('');
  if (vm.proofAddressField && vm.proofAddressField.setValue) vm.proofAddressField.setValue('');
  vm.message = '';
  vm.withproof = false;
  vm.addressSelected = false;
  vm.foundAddress = [];
  vm.address = {};
  vm.method = 'http';
  vm.sent = true;
}

/* a field changed: new input ends the "sent" state; the clearing itself (to '') does not */
export function inputAfterSend(vm, value) {
  if (vm.sent && String(value == null ? '' : value).trim() !== '') vm.sent = false;
}

/*
 * Payment proofs and Epicbox. epic-wallet 4.1.0 sends over Epicbox as a V2 slate
 * (impls/src/adapters/epicbox.rs: VersionedSlate::into_version(slate, SlateVersion::V2)), and V2
 * has no payment_proof field, so a requested proof is dropped silently: the EPIC goes out without
 * one. HTTP, Tor (http to an .onion) and transaction files keep the V3 slate with the proof.
 * So the Send form offers no proof over Epicbox, and a request that gets through anyway (a stale
 * form state) is refused before it reaches the wallet.
 */

/* an Epicbox address (key@domain, or the bare key that starts with "es"), as the Send form reads it */
export function isEpicboxAddress(address) {
  const v = String(address == null ? '' : address).trim();
  if (/^https?:\/\//i.test(v) || /\.onion(?::\d+)?\/?$/i.test(v)) return false;
  return v.includes('@') || v.startsWith('es') || v.startsWith('epicbox');
}

/* the send method: the chosen one (an Epicbox contact sets 'epicbox'), or 'epicbox' for an Epicbox address */
export function sendMethod(method, address) {
  return method == 'epicbox' || isEpicboxAddress(address) ? 'epicbox' : (method || 'http');
}

/* can this send carry a payment proof? */
export function proofAllowed(method, address) {
  return sendMethod(method, address) != 'epicbox';
}

/*
 * The proof request for the wallet: { address } to send (null: no proof), or { refused: true }
 * when a proof is asked for where none is possible: the send must stop and say why.
 */
export function proofRequest(method, address, withproof, proofAddress) {
  if (!withproof) return { address: null };
  if (!proofAllowed(method, address)) return { address: null, refused: true };
  return { address: proofAddress };
}
