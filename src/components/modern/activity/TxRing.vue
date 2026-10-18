<template>
  <!-- The confirmation ring in the Modern look. Decorative: the status is always written next to it. -->
  <svg
    class="e-ring"
    :class="{ 'e-is-wait': state == 'waiting', 'e-is-done': state == 'confirmed' }"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <circle class="e-track" cx="12" cy="12" r="9" />
    <circle class="e-arc" cx="12" cy="12" r="9" :stroke-dasharray="circumference" :stroke-dashoffset="offset" />
    <path v-if="state == 'confirmed'" class="e-chk" d="M8 12.3l2.6 2.6L16 9.5" />
  </svg>
</template>

<script>
  import ConfirmationRing from '@/components/layout/ConfirmationRing.vue';
  import { reskin } from '@/components/modern/reskin';

  //props (state, confirmations, target) and the arc maths are ConfirmationRing's
  export default reskin(ConfirmationRing, { name: 'TxRing' });
</script>
