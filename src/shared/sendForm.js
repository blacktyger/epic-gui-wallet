/*
 * The Send form after a successful send (Classic HttpSend.vue and the Modern SendView.vue): the
 * amount, recipient and message are cleared and the form stays "sent" (Send /
 * Review send disabled) until something new is typed, so a second send can't start by accident.
 *
 * No Vue or DOM imports, so it runs under `node --test` (tests/sendForm.test.js).
 */

/* vm: the send component (its field refs, message, address book state) */
export function clearSendForm(vm) {
  if (vm.amountField) vm.amountField.input = '';
  if (vm.addressField && vm.addressField.setValue) vm.addressField.setValue('');
  vm.message = '';
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

/* a Tor address (an .onion host, with or without http(s)://, a port or a path, or the bare 56 base32
   characters of a v3 address as a contact can hold it): the wallet has no Tor, so the Send form
   refuses it with a message and never sends to it */
export function isOnionAddress(address) {
  const v = String(address == null ? '' : address).trim();
  return /^(https?:\/\/)?[^\s/@]+\.onion(:\d+)?(\/\S*)?$/i.test(v) || /^[a-z2-7]{56}(:\d+)?(\/\S*)?$/i.test(v);
}

/* an Epicbox address (key@domain, or the bare key that starts with "es"), as the Send form reads it */
export function isEpicboxAddress(address) {
  const v = String(address == null ? '' : address).trim();
  if (/^https?:\/\//i.test(v) || isOnionAddress(v)) return false;
  return v.includes('@') || v.startsWith('es') || v.startsWith('epicbox');
}

/* a host the wallet can send to over HTTP without a scheme: name.tld, an IPv4 address or localhost,
   with an optional port and path */
const HOST_ADDRESS = /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)(:\d+)?(\/\S*)?$/i;

/* a recipient that is none of the kinds the Send form can send to: not http(s) (any case), not
   Epicbox-like, not Tor (refused with its own message), not a bare host ("hello world" used to pass, QA T05) */
export function isUnknownRecipient(address) {
  const v = String(address == null ? '' : address).trim();
  if (v === '' || /http/i.test(v) || isEpicboxAddress(v)) return false;
  return !isOnionAddress(v) && !HOST_ADDRESS.test(v);
}

/* the send method: the chosen one (an Epicbox contact sets 'epicbox'), or 'epicbox' for an Epicbox address */
export function sendMethod(method, address) {
  return method == 'epicbox' || isEpicboxAddress(address) ? 'epicbox' : (method || 'http');
}
