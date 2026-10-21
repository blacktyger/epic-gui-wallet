<template>
  <!-- How close a node is to the network tip: a 28 px bar, the exact gap in the tooltip only (shared/nodeTip.js) -->
  <span class="e-hmeter" :class="meter.tone ? 'e-' + meter.tone : (down ? 'e-down' : '')" role="img" :aria-label="label" :title="bare ? null : label">
    <i v-if="meter.steps" :style="{ width: Math.round(meter.steps / 3 * 100) + '%' }"></i>
  </span>
</template>

<script>
  import { heightMeter } from '@/shared/nodeTip';

  /* behind: blocks below the network tip, null when the tip is unknown; down: the node doesn't answer;
     bare: no title (the row shows the gap in its own tooltip) */
  export default {
    name: 'HeightMeter',
    props: { behind: { type: Number, default: null }, down: { type: Boolean, default: false }, bare: { type: Boolean, default: false } },
    computed: {
      meter() {
        return this.down ? { level: 'unknown', steps: 0, tone: '' } : heightMeter(this.behind);
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
