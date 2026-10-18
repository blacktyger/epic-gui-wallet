<template>
  <!-- STUB: replaced by the Modern view; until then the Classic component renders here -->
  <Base v-bind="$attrs" />
</template>

<script>
  import Base from '@/components/Login.vue';
  export default { name: 'UnlockView', components: { Base }, inheritAttrs: false };
</script>
