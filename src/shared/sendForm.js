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
