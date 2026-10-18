<template>
  <!-- STUB: replaced by the Modern view; until then the Classic component renders here -->
  <Base v-bind="$attrs" />
</template>

<script>
  import Base from '@/components/AddressBook.vue';
  export default { name: 'ContactsView', components: { Base }, inheritAttrs: false };
</script>
