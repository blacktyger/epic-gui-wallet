<template>
  <!-- STUB: replaced by the Modern view; until then the Classic component renders here -->
  <Base v-bind="$attrs" />
</template>

<script>
  import Base from '@/components/layout/NodesyncedModalBox.vue';
  export default { name: 'NodeSyncedDialog', components: { Base }, inheritAttrs: false };
</script>
