<template>
  <!-- STUB: replaced by the Modern view; until then the Classic component renders here -->
  <Base v-bind="$attrs" />
</template>

<script>
  import Base from '@/components/Create.vue';
  export default { name: 'CreateView', components: { Base }, inheritAttrs: false };
</script>
