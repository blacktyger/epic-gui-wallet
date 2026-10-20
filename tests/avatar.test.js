// Tests for src/shared/avatar.js, a contact's automatic avatar (initials on a colour of its name): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarInitials, avatarColor, contrastRatio, AVATAR_PALETTE } from '../src/shared/avatar.js';

test('initials: first and last word, one letter for one word, upper case', () => {
  assert.equal(avatarInitials('Mara Okafor'), 'MO');
  assert.equal(avatarInitials('café lumen bar'), 'CB');
  assert.equal(avatarInitials('Juno'), 'J');
  assert.equal(avatarInitials('  ines   duarte  '), 'ID');
  assert.equal(avatarInitials('Łukasz Żółw'), 'ŁŻ');
});

test('initials skip punctuation and words without letters', () => {
  assert.equal(avatarInitials('@bob smith'), 'BS');
  assert.equal(avatarInitials('(Café) - Lumen'), 'CL');
  assert.equal(avatarInitials('Shop #2'), 'S2');
});

test('initials of other scripts stay whole characters', () => {
  //Arabic-script letters stay two initials, not one joined shape (a zero-width non-joiner between)
  assert.equal(avatarInitials('علی رضایی'), 'ع\u200cر');
  //a Devanagari letter with its vowel sign is one character on screen
  assert.equal(avatarInitials('राहुल शर्मा'), 'राश');
  //an emoji with a skin tone is not split in two halves
  assert.equal(avatarInitials('👋🏽'), '👋🏽');
});

test('no name: no initials (the avatar shows a person glyph)', () => {
  assert.equal(avatarInitials(''), '');
  assert.equal(avatarInitials('   '), '');
  assert.equal(avatarInitials(null), '');
  assert.equal(avatarInitials(undefined), '');
});

test('the colour follows the name: the same name (any case or spacing) the same colour, every time', () => {
  assert.equal(avatarColor('Mara Okafor'), avatarColor('  mara okafor '));
  assert.equal(avatarColor({ name: 'Mara Okafor', id: 9 }), avatarColor('Mara Okafor'));
  assert.ok(AVATAR_PALETTE.includes(avatarColor('')));
  assert.ok(AVATAR_PALETTE.includes(avatarColor(null)));
  //a stable hash, not a random one: pinned so a change of the function is a decision
  assert.equal(avatarColor('Mara Okafor').id, 'green');
  assert.equal(avatarColor('Juno').id, 'slate');
});

test('different names spread over the palette', () => {
  const names = ['Ann', 'Bob', 'Cleo', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana', 'Ivo', 'Jan', 'Kai', 'Lea', 'Max', 'Nia', 'Oto', 'Pia'];
  const used = new Set(names.map((n) => avatarColor(n).id));
  assert.ok(used.size >= 5, 'only ' + used.size + ' colours for 16 names');
});

test('every palette colour keeps the initials readable (WCAG AA 4.5:1) in both themes', () => {
  assert.ok(AVATAR_PALETTE.length >= 6);
  for (const p of AVATAR_PALETTE) {
    for (const theme of ['dark', 'light']) {
      const r = contrastRatio(p[theme].bg, p[theme].fg);
      assert.ok(r >= 4.5, `${p.id} ${theme}: ${r.toFixed(2)}:1`);
    }
  }
});

test('contrastRatio is the WCAG formula', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});
