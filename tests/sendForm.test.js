// Tests for src/shared/sendForm.js: the Send form is cleared after a successful send. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSendForm, inputAfterSend } from '../src/shared/sendForm.js';

function field(v) {
  return { input: v, setValue(x) { this.input = x; } };
}
function filled() {
  return {
    amountField: { input: '1.5' },
    addressField: field('esAbc@epicbox.epiccash.com'),
    proofAddressField: field('proofaddr'),
    message: 'thanks', withproof: true, addressSelected: true, foundAddress: [{}],
    address: { id: 3 }, method: 'epicbox', sent: false,
  };
}

test('a successful send clears amount, address, proof address and message', () => {
  const vm = filled();
  clearSendForm(vm);
  assert.equal(vm.amountField.input, '');
  assert.equal(vm.addressField.input, '');
  assert.equal(vm.proofAddressField.input, '');
  assert.equal(vm.message, '');
  assert.equal(vm.withproof, false);
  assert.equal(vm.addressSelected, false);
  assert.deepEqual(vm.address, {});
  assert.equal(vm.method, 'http');
  assert.equal(vm.sent, true);
});

test('the form stays "sent" until something new is typed', () => {
  const vm = filled();
  clearSendForm(vm);
  inputAfterSend(vm, '');
  inputAfterSend(vm, '   ');
  inputAfterSend(vm, null);
  assert.equal(vm.sent, true);
  inputAfterSend(vm, '2');
  assert.equal(vm.sent, false);
});
