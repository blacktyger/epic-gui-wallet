// Tests for src/shared/sendForm.js: the Send form is cleared after a successful send. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSendForm, inputAfterSend, isEpicboxAddress, isOnionAddress, isUnknownRecipient, sendMethod } from '../src/shared/sendForm.js';

function field(v) {
  return { input: v, setValue(x) { this.input = x; } };
}
function filled() {
  return {
    amountField: { input: '1.5' },
    addressField: field('esAbc@epicbox.epiccash.com'),
    message: 'thanks', addressSelected: true, foundAddress: [{}],
    address: { id: 3 }, method: 'epicbox', sent: false,
  };
}

test('a successful send clears amount, address and message', () => {
  const vm = filled();
  clearSendForm(vm);
  assert.equal(vm.amountField.input, '');
  assert.equal(vm.addressField.input, '');
  assert.equal(vm.message, '');
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

test('a Tor address is recognised (the Send form refuses it): .onion host, with or without http(s), port, path', () => {
  const v3 = 'esxk2ozzbdq7r5dz3ad7i5lafdvrtq4wbvz7bcejzfsiipcdrmqi4yd.onion';
  for (const a of [v3, '  ' + v3 + '  ', 'http://' + v3, 'https://' + v3, 'http://' + v3 + '/', 'http://' + v3 + ':80',
    'http://' + v3.toUpperCase() + '/v2/foreign', 'abcdef.onion', 'sub.abcdef.onion:3415']) {
    assert.equal(isOnionAddress(a), true, a);
  }
  for (const a of ['', null, undefined, 'http://1.2.3.4:3415', 'https://node.example.com', 'esAbc@epicbox.epiccash.com',
    'esAbc', 'http://onion.example.com', 'http://example.com/a.onion.txt', 'abc.onion@epicbox.epiccash.com', 'onion']) {
    assert.equal(isOnionAddress(a), false, String(a));
  }
});

test('the send method: Epicbox by choice or by address, else the chosen one', () => {
  assert.equal(sendMethod('epicbox', ''), 'epicbox');
  assert.equal(sendMethod('http', 'esAbc@epicbox.epiccash.com'), 'epicbox');
  assert.equal(sendMethod('http', 'http://1.2.3.4:3415'), 'http');
  assert.equal(sendMethod(undefined, 'http://1.2.3.4:3415'), 'http');
});

test('a recipient that is no address at all is refused; Epicbox, http(s) and Tor addresses are not (Tor is refused by its own check) (QA T05)', () => {
  for (const bad of ['hello world', 'alice', '12345', 'not an address!!', 'ftp://x']) assert.equal(isUnknownRecipient(bad), true, bad);
  const onion = 'a'.repeat(52) + 'abcd';
  for (const ok of ['', '   ', 'esWY5xrwwGme5Ca6Aje8joEvtqNLtUcKfkycNFDQSYQbHi14LyEM@epicbox.epiccash.com', 'es123', 'x@epicbox.epiccash.com',
    'http://1.2.3.4:3415', 'https://example.com', 'HTTP://1.2.3.4:3415', '192.168.1.10:3415', 'mywallet.example.com:3415',
    'localhost:3415', 'epicbox://es123', onion, onion + '.onion', onion + '.onion:3415/', onion + '.onion/v2/foreign']) {
    assert.equal(isUnknownRecipient(ok), false, ok);
  }
  assert.equal(isOnionAddress(onion + '.onion'), true);
  assert.equal(isOnionAddress(onion), true);
  assert.equal(isOnionAddress('a'.repeat(55)), false);
});
