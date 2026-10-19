// Tests for src/shared/sendForm.js: the Send form is cleared after a successful send. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSendForm, inputAfterSend, isEpicboxAddress, sendMethod, proofAllowed, proofRequest } from '../src/shared/sendForm.js';

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

test('an Epicbox address is recognised (key@domain, bare es… key)', () => {
  assert.equal(isEpicboxAddress('esAbc@epicbox.epiccash.com'), true);
  assert.equal(isEpicboxAddress('  esAbc  '), true);
  assert.equal(isEpicboxAddress('http://1.2.3.4:3415'), false);
  assert.equal(isEpicboxAddress('abcdef.onion'), false);
  //a Tor address that happens to start with "es"
  assert.equal(isEpicboxAddress('esxk2ozzbdq7r5dz3ad7i5lafdvrtq4wbvz7bcejzfsiipcdrmqi4yd.onion'), false);
  assert.equal(isEpicboxAddress('http://esxk2ozzbdq7r5dz3ad7i5lafdvrtq4wbvz7bcejzfsiipcdrmqi4yd.onion'), false);
  assert.equal(isEpicboxAddress(''), false);
  assert.equal(isEpicboxAddress(null), false);
});

test('the send method: Epicbox by choice or by address, else the chosen one', () => {
  assert.equal(sendMethod('epicbox', ''), 'epicbox');
  assert.equal(sendMethod('http', 'esAbc@epicbox.epiccash.com'), 'epicbox');
  assert.equal(sendMethod('http', 'http://1.2.3.4:3415'), 'http');
  assert.equal(sendMethod(undefined, 'http://1.2.3.4:3415'), 'http');
});

test('no payment proof over Epicbox; HTTP and Tor allow one', () => {
  assert.equal(proofAllowed('epicbox', ''), false);
  assert.equal(proofAllowed('epicbox', 'http://1.2.3.4:3415'), false);
  assert.equal(proofAllowed('http', 'esAbc@epicbox.epiccash.com'), false);
  assert.equal(proofAllowed('http', 'http://1.2.3.4:3415'), true);
  assert.equal(proofAllowed('http', 'http://abcdef.onion'), true);
  assert.equal(proofAllowed('http', ''), true);
});

test('a proof request over Epicbox is refused before it reaches the wallet', () => {
  assert.deepEqual(proofRequest('epicbox', 'esAbc@epicbox.epiccash.com', true, 'proofaddr'), { address: null, refused: true });
  assert.deepEqual(proofRequest('http', 'esAbc', true, 'proofaddr'), { address: null, refused: true });
  assert.deepEqual(proofRequest('epicbox', 'esAbc', false, 'proofaddr'), { address: null });
  assert.deepEqual(proofRequest('http', 'http://1.2.3.4:3415', true, 'proofaddr'), { address: 'proofaddr' });
  assert.deepEqual(proofRequest('http', 'http://1.2.3.4:3415', false, 'proofaddr'), { address: null });
});
