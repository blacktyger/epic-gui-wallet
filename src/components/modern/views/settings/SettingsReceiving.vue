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
              <!-- listening: the domain only (6.1.6 mockups), the full host in the tooltip -->
              <template v-if="ebHealth.state == 'listening'">
                <span class="e-st e-ok" aria-hidden="true"></span>
                <span :title="ebShownServer" data-test="epicbox-domain">{{ $t('msg.modern.settings.eb_listening_on', { domain: ebDomainLabel }) }}</span>
              </template>
              <template v-else>
                <span class="e-stword" :class="'e-' + ebGlyph" :title="ebWhy || null">{{ ebWord }}</span>
                <span class="e-sep" aria-hidden="true">·</span>
                <span>{{ ebLine }}</span>
              </template>
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
      </div>
      <!-- Direct transactions (6.1.6): HTTP and Tor in one block, off by default (DirectTxRow, shared/directTx.js) -->
      <div class="e-set-list"><DirectTxRow /></div>
    </section>

  </SettingsFrame>
</template>

<script>
  import { useStore } from '@/store';
  import EpicboxCombo from '@/components/modern/form/EpicboxCombo.vue';
  import EpicboxDownNotice from '@/components/modern/form/EpicboxDownNotice.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';
  import DirectTxRow from '@/components/modern/settings/DirectTxRow.vue';
  import { jumpTo, JUMP_EVENT } from '@/components/modern/settings/jump';
  import epicboxSwitch from '@/components/modern/epicboxSwitch';
  import { epicboxGlyph } from '@/components/modern/serviceRows';
  import { epicboxDomainLabel } from '@/shared/directTx';

  /* Settings › Receiving: Epicbox (the server field, its status, the not-responding notice) and Direct
     transactions (HTTP, Tor). Every control applies at once; there is no Save bar. */
  export default {
    name: 'SettingsReceiving',
    components: { DirectTxRow, EpicboxCombo, EpicboxDownNotice, SettingsFrame },
    mixins: [epicboxSwitch],
    setup() {
      return { store: useStore() };
    },
    data() {
      const c = this.configService.config || {};
      return { listenOnStartup: !!c.walletlisten_on_startup };
    },
    computed: {
      ebGlyph() {
        return epicboxGlyph(this.ebHealth.state);
      },
      ebShownServer() {
        return this.ebHealth.server || this.ebDomain;
      },
      ebDomainLabel() {
        return epicboxDomainLabel(this.ebShownServer);
      },
      ebWord() {
        return this.$t('msg.modern.eb_' + this.ebHealth.state);
      },
      ebWhy() {
        return this.ebHealth.why ? this.$t('msg.modern.eb_why_' + this.ebHealth.why) : '';
      },
      ebLine() {
        const s = this.ebHealth.state;
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
    },
  };
</script>
