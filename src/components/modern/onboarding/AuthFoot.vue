<template>
  <p class="e-auth-foot">
    {{ version ? $t('msg.modern.wallet_version', { v: version }) : '' }}
    <!-- connection problems often come before unlock: the report dialog from here too -->
    <button type="button" class="e-link-btn e-auth-help" @click="emitter.emit('open-support')">{{ $t('msg.support.unlock_link') }}</button>
  </p>
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
