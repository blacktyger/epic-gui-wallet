<!-- A transaction's payment proof in its details, read-only (shared/paymentProof.js); renders nothing without one -->
<template>
  <template v-if="fields.length">
    <h3 class="e-act-sub">{{ $t('msg.modern.overview.d_proof') }}</h3>
    <ul class="e-act-proof">
      <li v-for="field in fields" :key="field.key">
        <span class="e-small e-dim">{{ field.label }}</span>
        <span class="e-act-pv">
          <code class="e-mono e-hide" translate="no" :title="field.value">{{ field.short }}</code>
          <button v-if="field.copy" type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.modern.overview.copy_field', { what: field.label })" @click="$emit('copy', field.value)"><EIcon name="copy" size="sm" /></button>
        </span>
      </li>
    </ul>
  </template>
</template>

<script>
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { proofFields } from '@/shared/paymentProof';

  export default {
    name: 'TxProof',
    components: { EIcon },
    props: {
      //tx.payment_proof, or null
      proof: { type: Object, default: null },
    },
    emits: ['copy'],
    computed: {
      fields() { return proofFields(this.proof, k => this.$t(k)); },
    },
  };
</script>
