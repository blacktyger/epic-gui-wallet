<template>
  <!-- Receive › Tor address (spec §6): only while Tor is on -->
  <div v-if="on" class="e-set-row e-rcv-row" data-test="tor-receive">
    <div>
      <b>{{ $t('msg.modern.settings.tor.address') }}</b>
      <div class="e-rcv-line">
        <code v-if="onion" class="e-mono" translate="no" dir="ltr" data-test="tor-receive-onion">{{ onion }}</code>
        <code v-else class="e-mono e-faint">…</code>
      </div>
      <p class="e-stg-meta" role="status" data-test="tor-receive-status">
        <span class="e-st" :class="dot" aria-hidden="true"></span>
        <span>{{ $t(status.key, status.params) }}</span>
      </p>
    </div>
    <div class="e-ctl">
      <button type="button" class="e-icon-btn" data-test="tor-receive-copy" :disabled="!onion" :aria-label="$t('msg.modern.settings.tor.copy_onion')" @click="$emit('copy', onion)"><EIcon name="copy" size="sm" /></button>
      <button type="button" class="e-icon-btn" data-test="tor-receive-qr" :disabled="!onion" :aria-label="$t('msg.modern.settings.tor.rcv_qr')" @click="$emit('qr', onion)"><EIcon name="qr" size="sm" /></button>
    </div>
  </div>
</template>

<script>
  import { useStore } from '@/store';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { torPhase, torStatus } from '@/shared/torUi';

  export default {
    name: 'TorReceiveRow',
    components: { EIcon },
    emits: ['copy', 'qr'],
    setup() {
      return { store: useStore() };
    },
    computed: {
      tor() { return this.store.state.tor; },
      on() { return torPhase(this.tor) != 'off'; },
      status() { return torStatus(this.tor) || { key: 'msg.modern.settings.tor.title', params: {} }; },
      dot() { return { busy: 'e-busy', ok: 'e-ok', warn: 'e-down' }[this.status.tone] || 'e-off'; },
      onion() { return this.tor.onion || ''; },
    },
  };
</script>
