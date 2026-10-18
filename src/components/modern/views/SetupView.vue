<template>
  <!-- STUB: replaced by the Modern view; until then the Classic component renders here -->
  <Base v-bind="$attrs" />
</template>

<script>
  import Base from '@/components/SetupWizard.vue';
  export default { name: 'SetupView', components: { Base }, inheritAttrs: false };
</script>
