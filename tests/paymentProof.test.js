// Tests for the read-only payment proof in a transaction's details (src/shared/paymentProof.js and
// the Modern TxProof.vue template; Classic Transaction.vue by its source): `npm test`.
// The GUI no longer asks for proofs (6.1.3), but a proof a transaction has must still show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { parse } from '@vue/compiler-sfc';
import { proofFields } from '../src/shared/paymentProof.js';

const src = (p) => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');

const proof = {
  amount: '150000000',
  excess: '08c3e0f6b4a8a7d3e5c9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3',
  receiver_address: 'b4e2a7c6d1f0e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4',
  receiver_signature: '3f6a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9',
  sender_address: 'c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8',
  sender_address_path: 0,
  sender_signature: '7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d',
};

const t = (k, a) => (a ? k + JSON.stringify(a) : k);

/* TxProof.vue's own template, with its computed (shared/paymentProof.js), server-rendered */
async function renderTxProof(p) {
  const { descriptor } = parse(src('components/modern/activity/TxProof.vue'));
  const app = createSSRApp({
    props: { proof: { type: Object, default: null } },
    computed: { fields() { return proofFields(this.proof, k => this.$t(k)); } },
    template: descriptor.template.content,
  }, { proof: p });
  app.config.globalProperties.$t = t;
  app.component('EIcon', { props: ['name', 'size'], template: '<svg class="e-icon"></svg>' });
  return renderToString(app);
}

test('a proof gives its five fields, in order, with the full value and a short one', () => {
  const f = proofFields(proof, t);
  assert.deepEqual(f.map(x => x.key), ['receiver_address', 'receiver_signature', 'sender_address', 'sender_signature', 'sender_address_path']);
  assert.equal(f[0].label, 'msg.transaction.receiver_address');
  assert.equal(f[0].value, proof.receiver_address);
  assert.ok(f[0].short.length < proof.receiver_address.length && f[0].short.includes('…'));
  assert.equal(f[4].value, '0');
  assert.deepEqual(f.map(x => x.copy), [true, true, true, true, false]);
});

test('no proof gives no fields', () => {
  assert.deepEqual(proofFields(null, t), []);
  assert.deepEqual(proofFields(undefined, t), []);
});

test('Modern details: a transaction with a proof shows it', async () => {
  const html = await renderTxProof(proof);
  assert.match(html, /msg\.modern\.overview\.d_proof/);
  assert.match(html, /class="e-act-proof"/);
  assert.equal((html.match(/<li/g) || []).length, 5);
  assert.ok(html.includes(`title="${proof.receiver_address}"`));
  assert.ok(html.includes(`title="${proof.sender_signature}"`));
  //copy buttons for the four keys and signatures, none for the path
  assert.equal((html.match(/<button/g) || []).length, 4);
});

test('Modern details: without a proof nothing renders (no heading, no "none" line)', async () => {
  const html = await renderTxProof(null);
  assert.doesNotMatch(html, /d_proof|e-act-proof|<h3|<p/);
  assert.equal(html.replace(/<!--[\s\S]*?-->/g, '').trim(), '');
});

test('Modern details use TxProof with the transaction\'s proof', () => {
  assert.match(src('components/modern/activity/TxList.vue'), /<TxProof :proof="selected\.payment_proof" @copy="copy" \/>/);
});

test('Classic details: the proof block shows only for a transaction with a proof', () => {
  const v = src('components/Transaction.vue');
  assert.match(v, /<template v-if="tx\.payment_proof">/);
  assert.match(v, /tx\.payment_proof\.receiver_address/);
  assert.match(v, /tx\.payment_proof\.sender_signature/);
  //no "Payment proof: -" line for a transaction without one
  assert.doesNotMatch(v, /msg\.transaction\.payment_proof"\) }}: <\/span>-/);
});
