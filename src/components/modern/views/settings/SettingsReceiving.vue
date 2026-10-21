<template>
  <SettingsFrame>
    <!-- ============================================================ receiving (#57: its own page) -->
    <section id="stg-sec-epicbox" class="e-set-group" aria-labelledby="stg-rcv-h">
      <h2 id="stg-rcv-h" tabindex="-1">{{ $t('msg.modern.settings.receiving') }}</h2>
      <div class="e-set-list">
        <!-- the Epicbox server as one field (mockups direction 2): our listener's own state (#52) -->
        <div class="e-set-row e-wide e-srv" data-test="epicbox-row">
          <div>
            <label class="e-srv-label" for="stg-eb-in">{{ $t('msg.modern.settings.eb_server') }}</label>
            <EpicboxCombo input-id="stg-eb-in" describedby="stg-eb-st" :servers="ebServers" :live="ebLive" :current="ebShownServer" :current-glyph="ebGlyph" :busy="ebSwitching" @pick="switchEpicbox" />
            <p id="stg-eb-st" class="e-stg-meta e-node-status" role="status" data-test="epicbox-status">
              <span class="e-stword" :class="'e-' + ebGlyph" :title="ebWhy || null">{{ ebWord }}</span>
              <span class="e-sep" aria-hidden="true">·</span>
              <span>{{ ebLine }}</span>
            </p>
            <EpicboxDownNotice class="e-stg-notice" :health="ebHealth" :suggest="ebSuggest" :busy="ebSwitching" @switch="switchEpicbox" />
          </div>
        </div>
        <div class="e-set-row">
          <div>
            <b id="stg-auto-l">{{ $t('msg.modern.settings.epicbox_auto_l') }}</b>
            <p id="stg-auto-h">{{ $t('msg.modern.settings.epicbox_auto_text') }}</p>
          </div>
          <div class="e-ctl">
            <label class="e-switch">
              <input type="checkbox" :checked="listenOnStartup" aria-labelledby="stg-auto-l" aria-describedby="stg-auto-h" @change="(e) => saveListenOnStartup(e.target.checked)" />
              <span class="e-track"></span>
            </label>
          </div>
        </div>
        <!-- the HTTP listener on demand (modern/httpListenerSwitch.js): on or off now; "start with the wallet" inside the row (#56) -->
        <div class="e-set-row" data-test="http-row">
          <div>
            <b id="stg-http-l">{{ $t('msg.modern.settings.http_l') }}</b>
            <p id="stg-http-h">{{ $t('msg.modern.settings.http_text') }}</p>
            <p class="e-stg-meta e-one" role="status">
              <template v-if="httpFailed"><span class="e-st e-down" aria-hidden="true"></span><span><b>{{ $t('msg.modern.send.rcv_http_failed') }}</b> {{ httpFailed.reason == 'port_in_use' ? $t('msg.modern.send.rcv_http_failed_port', { port: httpFailed.port }) : $t(httpFailed.reason == 'node' ? 'msg.modern.send.rcv_http_failed_node' : 'msg.modern.send.rcv_http_failed_error') }}</span></template>
              <template v-else-if="httpOn"><span class="e-st e-ok" aria-hidden="true"></span><span>{{ $t('msg.modern.settings.http_on', { port: configService.walletListenerPort }) }}<template v-if="torHoldsHttp"> · {{ $t('msg.modern.settings.tor.http_used') }}</template></span></template>
              <template v-else><span class="e-st e-off" aria-hidden="true"></span><span>{{ $t('msg.modern.settings.http_off') }}</span></template>
            </p>
            <label class="e-check"><input type="checkbox" data-test="http-autostart" :checked="httpAutostartOn" @change="(e) => saveHttpAutostart(e.target.checked)" />{{ $t('msg.modern.settings.http_auto_l') }}</label>
          </div>
          <div class="e-ctl">
            <label class="e-switch">
              <input type="checkbox" data-test="http-switch" :checked="httpOn" :disabled="httpSwitching || (torHoldsHttp && httpOn)" :aria-busy="httpSwitching ? 'true' : null" aria-labelledby="stg-http-l" aria-describedby="stg-http-h" @change="httpSwitchChanged" />
              <span class="e-track"></span>
            </label>
          </div>
        </div>
      </div>
      <!-- Tor (6.1.6): off by default, at the bottom (TorSettingsRow, docs/plans/tor-616.md §6) -->
      <div class="e-set-list"><TorSettingsRow /></div>
    </section>

  </SettingsFrame>
</template>

<script>
  import { useStore } from '@/store';
  import EpicboxCombo from '@/components/modern/form/EpicboxCombo.vue';
  import EpicboxDownNotice from '@/components/modern/form/EpicboxDownNotice.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';
  import TorSettingsRow from '@/components/modern/settings/TorSettingsRow.vue';
  import { jumpTo, JUMP_EVENT } from '@/components/modern/settings/jump';
  import httpListenerSwitch from '@/components/modern/httpListenerSwitch';
  import epicboxSwitch from '@/components/modern/epicboxSwitch';
  import { epicboxGlyph } from '@/components/modern/serviceRows';

  /* Settings › Receiving: Epicbox (the server field, its status, the not-responding notice) and the HTTP
     listener. Every control applies at once; there is no Save bar. */
  export default {
    name: 'SettingsReceiving',
    components: { EpicboxCombo, EpicboxDownNotice, SettingsFrame, TorSettingsRow },
    mixins: [httpListenerSwitch, epicboxSwitch],
    setup() {
      return { store: useStore() };
    },
    data() {
      const c = this.configService.config || {};
      return { listenOnStartup: !!c.walletlisten_on_startup, httpAutostartOn: !!c.http_listener_autostart };
    },
    computed: {
      ebGlyph() {
        return epicboxGlyph(this.ebHealth.state);
      },
      ebShownServer() {
        return this.ebHealth.server || this.ebDomain;
      },
      ebWord() {
        return this.$t('msg.modern.eb_' + this.ebHealth.state);
      },
      ebWhy() {
        return this.ebHealth.why ? this.$t('msg.modern.eb_why_' + this.ebHealth.why) : '';
      },
      ebLine() {
        const s = this.ebHealth.state;
        if (s == 'listening') return this.$t('msg.modern.settings.eb_delivers');
        if (s == 'down') return this.$t('msg.modern.settings.eb_down_line');
        if (s == 'paused') return this.$t('msg.modern.settings.eb_paused_line');
        if (s == 'off') return this.$t(this.listenOnStartup ? 'msg.modern.settings.eb_off_unlock' : 'msg.modern.settings.eb_off');
        return this.$t('msg.modern.settings.eb_connecting');
      },
    },
    mounted() {
      this.$nextTick(() => this.jump());
      this.onJump = () => this.jump();
      window.addEventListener(JUMP_EVENT, this.onJump);
    },
    beforeUnmount() {
      window.removeEventListener(JUMP_EVENT, this.onJump);
    },
    watch: {
      '$route.hash'() { this.$nextTick(() => this.jump()); },
    },
    methods: {
      jump() {
        if (this.$route && this.$route.hash) jumpTo(this.$route.hash);
      },
      /* Start Epicbox with the wallet: saved at once */
      saveListenOnStartup(on) {
        this.listenOnStartup = !!on;
        if (this.configService.updateConfig({ walletlisten_on_startup: !!on }) === false) this.$toast.error(this.$t('msg.settings.error_save'));
      },
      /* Start with the wallet for the HTTP listener: saved at once (config http_listener_autostart) */
      saveHttpAutostart(on) {
        this.httpAutostartOn = !!on;
        this.configService.updateConfig({ http_listener_autostart: !!on });
      },
    },
  };
</script>
