// Tests for src/shared/walletLabel.js: a default wallet name saved in one language ("Wallet 2") shows
// in the current one ("Portfel 2"); a label the user typed shows as typed. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLabelNumber, displayLabel, avatarLetters } from '../src/shared/walletLabel.js';
import en from '../src/lang/en.js';
import bg from '../src/lang/bg.js';
import cz from '../src/lang/cz.js';
import de from '../src/lang/de.js';
import fa from '../src/lang/fa.js';
import hi from '../src/lang/hi.js';
import pl from '../src/lang/pl.js';

const templates = [en, bg, cz, de, fa, hi, pl].map(m => m.msg.wallets.wallet_n);
const polish = n => pl.msg.wallets.wallet_n.replace('{0}', n);

test('every language has a default name with the number in it', () => {
  assert.equal(templates.length, 7);
  for (const t of templates) assert.match(t, /\{0\}/);
});

test('a default name saved in English shows in Polish, with its own number', () => {
  assert.equal(displayLabel('Wallet 2', templates, polish), 'Portfel 2');
  assert.equal(displayLabel(' Wallet 12 ', templates, polish), 'Portfel 12');
  assert.equal(displayLabel('wallet 3', templates, polish), 'Portfel 3');
});

test('a default name saved in any offered language is recognised', () => {
  for (const [label, n] of [['Portfel 2', 2], ['Peněženka 4', 4], ['Портфейл 5', 5], ['کیف پول 6', 6], ['वॉलेट 7', 7]]) {
    assert.equal(defaultLabelNumber(label, templates), n, label);
    assert.equal(displayLabel(label, templates, polish), 'Portfel ' + n);
  }
});

test('a label the user typed stays as typed', () => {
  for (const label of ['Savings', 'My Wallet 2', 'Wallet', 'Wallet two', 'Wallet 2b', 'Portfel główny', 'Wallet 0', 'Wallet 12345']) {
    assert.equal(defaultLabelNumber(label, templates), 0, label);
    assert.equal(displayLabel(label, templates, polish), label);
  }
  assert.equal(displayLabel('  Savings  ', templates, polish), 'Savings');
});

test('no label: empty (the caller then names the wallet by its place in the list)', () => {
  assert.equal(displayLabel('', templates, polish), '');
  assert.equal(displayLabel(undefined, templates, polish), '');
  assert.equal(defaultLabelNumber(null, templates), 0);
});

test('the avatar letters follow the name as shown', () => {
  assert.equal(avatarLetters('Wallet 2'), 'WA');
  assert.equal(avatarLetters(displayLabel('Wallet 2', templates, polish)), 'PO');
  assert.equal(avatarLetters('Jan Kowalski'), 'JK');
  assert.equal(avatarLetters('Savings'), 'S');
  assert.equal(avatarLetters(''), null);
});
