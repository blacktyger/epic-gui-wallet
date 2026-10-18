<template>
  <p class="e-auth-foot">{{ version ? $t('msg.modern.wallet_version', { v: version }) : '' }}</p>
</template>

<script>
  export default {
    name: 'AuthFoot',
    data() {
      return { version: '' };
    },
    async mounted() {
      try { this.version = await window.api.version(); } catch (e) { this.version = ''; }
    },
  };
</script>
