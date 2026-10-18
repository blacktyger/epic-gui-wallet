<template>
  <!-- the start route while App.vue decides between unlock and first run -->
  <div class="e-blank" aria-hidden="true"></div>
</template>

<script>
  import CheckService from '@/components/CheckService.vue';
  import { reskin } from '@/components/modern/reskin';
  export default reskin(CheckService);
</script>
