<template>
  <!-- An EPIC amount, fraction dimmed, isolated as LTR. While "hide amounts" is on the digits are
       blurred (.e-is-hidden-values on the app root) and read out as "Hidden amount"; while the
       balance is not yet confirmed by the node it is dimmed. -->
  <span
    class="e-money"
    :class="{ 'e-mono': mono, 'e-updating': updating }"
    dir="ltr"
    translate="no"
    :aria-busy="updating ? 'true' : null"
  ><span :aria-hidden="hidden ? 'true' : null">{{ prefix }}{{ parts.int }}<span v-if="decimals > 0" class="e-frac">{{ sep }}{{ parts.frac }}</span></span><span v-if="hidden" class="e-sr-only">{{ $t('msg.modern.hidden_amount') }}</span><span v-if="unit" class="e-unit"> EPIC</span></span>
</template>

<script>
  import { useStore } from '@/store';
  import { splitEpic } from '@/components/modern/format';

  export default {
    name: 'MoneyText',
    props: {
      //EPIC as a number (the store's unit)
      value: { type: [Number, String], default: 0 },
      decimals: { type: Number, default: 4 },
      //'auto' (minus only) | 'always' (+ for positive)
      sign: { type: String, default: 'auto' },
      unit: { type: Boolean, default: false },
      mono: { type: Boolean, default: true },
      //dim while not yet confirmed against the node (feat/qol walletSync)
      updating: { type: Boolean, default: false },
    },
    setup() {
      return { store: useStore() };
    },
    computed: {
      locale() { return this.$i18n ? this.$i18n.locale : 'en'; },
      parts() { return splitEpic(this.value, { decimals: this.decimals, locale: this.locale }); },
      sep() { return (1.1).toLocaleString(this.locale).charAt(1); },
      prefix() {
        if (this.parts.sign) return '−';
        return this.sign == 'always' && Number(this.value) > 0 ? '+' : '';
      },
      hidden() { return this.store.state.hideValues; },
    },
  };
</script>

<style>
  .e-money { font-variant-numeric: tabular-nums slashed-zero; unicode-bidi: isolate; white-space: nowrap; }
  .e-money .e-frac { color: var(--dim); }
</style>
