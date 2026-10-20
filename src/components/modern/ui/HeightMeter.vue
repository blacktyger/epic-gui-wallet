<template>
  <!-- How close a node is to the network tip: a thin 3-step meter, the exact gap in the tooltip only (shared/nodeTip.js) -->
  <span class="e-hmeter" :class="meter.tone ? 'e-' + meter.tone : ''" role="img" :aria-label="label" :title="label">
    <i v-for="n in 3" :key="n" :class="{ 'e-on': n <= meter.steps }"></i>
  </span>
</template>

<script>
  import { heightMeter } from '@/shared/nodeTip';

  /* behind: blocks below the network tip, null when the tip is unknown */
  export default {
    name: 'HeightMeter',
    props: { behind: { type: Number, default: null } },
    computed: {
      meter() {
        return heightMeter(this.behind);
      },
      label() {
        if (this.meter.level === 'unknown') return this.$t('msg.mynodes.height_unknown');
        if (this.meter.level === 'level') return this.$t('msg.mynodes.height_level');
        const locale = (this.$i18n && this.$i18n.locale) || 'en';
        return this.$t('msg.mynodes.height_behind', { n: Number(this.behind).toLocaleString(locale) });
      },
    },
  };
</script>
