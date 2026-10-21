<template>
  <!-- Settings › Receiving › Tor (spec §6): the switch, what Tor is doing, the address. One row. -->
  <div id="stg-tor" class="e-set-row" data-test="tor-row">
    <div>
      <b id="stg-tor-l">{{ $t('msg.modern.settings.tor.title') }}</b>
      <p id="stg-tor-h">{{ $t('msg.modern.settings.tor.text') }}</p>
      <p v-if="status" class="e-stg-meta" role="status" data-test="tor-status">
        <span class="e-st" :class="dotClass" aria-hidden="true"></span>
        <span>{{ $t(status.key, status.params) }}</span>
      </p>
      <p v-if="onion" class="e-stg-meta" data-test="tor-onion">
        <code class="e-mono e-small e-tor-onion" translate="no" dir="ltr">{{ onion }}</code>
      </p>
    </div>
    <div class="e-ctl">
      <button v-if="failed" type="button" class="e-btn e-btn-sm" data-test="tor-retry" :class="{ 'e-is-busy': retrying }" :aria-busy="retrying ? 'true' : null" @click="retry"><EIcon name="refresh" />{{ $t('msg.modern.settings.tor.retry') }}</button>
      <button v-if="onion" type="button" class="e-icon-btn" data-test="tor-copy" :aria-label="$t('msg.modern.settings.tor.copy_onion')" @click="copy"><EIcon name="copy" size="sm" /></button>
      <label class="e-switch">
        <input type="checkbox" data-test="tor-switch" :checked="enabled" :disabled="switching" :aria-busy="switching ? 'true' : null" aria-labelledby="stg-tor-l" aria-describedby="stg-tor-h" @change="switched" />
        <span class="e-track"></span>
      </label>
    </div>
  </div>
</template>

<script>
  import { useStore } from '@/store';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { torPhase, torStatus } from '@/shared/torUi';

  export default {
    name: 'TorSettingsRow',
    components: { EIcon },
    setup() {
      return { store: useStore() };
    },
    data() {
      return { switching: false, retrying: false };
    },
    computed: {
      tor() { return this.store.state.tor; },
      phase() { return torPhase(this.tor); },
      enabled() { return this.phase != 'off'; },
      failed() { return this.phase == 'failed'; },
      status() { return torStatus(this.tor); },
      dotClass() { return { busy: 'e-busy', ok: 'e-ok', warn: 'e-down' }[this.status.tone] || 'e-off'; },
      onion() { return this.enabled && this.tor.onion ? this.tor.onion : ''; },
    },
    methods: {
      async switched(e) {
        if (this.switching) return;
        const on = !!e.target.checked;
        this.switching = true;
        try {
          this.emitter.emit('app.setTor', on);
        } finally {
          this.switching = false;
        }
        //the store follows the tor-status events; a switch that did not take goes back
        e.target.checked = this.enabled;
      },
      async retry() {
        if (this.retrying) return;
        this.retrying = true;
        try {
          this.emitter.emit('app.startTor');
        } finally {
          this.retrying = false;
        }
      },
      copy() {
        window.clipboard.writeText(this.onion);
        this.$toast.show(this.$t('msg.copy_to_clipboard'), { duration: 1000 });
      },
    },
  };
</script>
