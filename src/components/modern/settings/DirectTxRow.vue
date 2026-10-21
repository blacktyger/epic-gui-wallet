<template>
  <!-- Settings › Receiving › Direct transactions (6.1.6, shared/directTx.js): one switch; while it is
       off nothing else shows. On: the HTTP and Tor chips (each on its own, at least one), the status,
       the address lines, Reachable (HTTP), the Tor details and Start with the wallet. -->
  <div id="stg-direct" class="e-set-row e-direct" data-test="direct-row">
    <div class="e-direct-main">
      <b id="stg-direct-l">{{ $t(M + 'title') }}</b>
      <p id="stg-direct-h" class="e-direct-desc">
        <span>{{ $t(M + 'text') }}</span>
        <span class="e-tipwrap e-direct-info">
          <button type="button" class="e-icon-btn e-inline" data-test="direct-info" :aria-label="$t(M + 'info_label')" :aria-describedby="uid + '-info'"><EIcon name="info" size="sm" /></button>
          <span :id="uid + '-info'" class="e-tip e-tip-wrap" role="tooltip">{{ $t(M + 'info') }}</span>
        </span>
      </p>

      <template v-if="on">
        <p class="e-stg-meta e-direct-status" :class="{ 'e-err': status.tone == 'down' }" role="status" data-test="direct-status">
          <span class="e-st" :class="'e-' + (status.tone || 'off')" aria-hidden="true"></span>
          <span>{{ status.text }}</span>
          <button v-if="status.retry" type="button" class="e-btn-inline" data-test="direct-retry" :class="{ 'e-is-busy': retrying }" :aria-busy="retrying ? 'true' : null" @click="retry"><EIcon name="o-refresh" />{{ $t('msg.modern.settings.tor.retry') }}</button>
        </p>
        <div v-if="torStarting" class="e-direct-bar" aria-hidden="true"><i :style="{ width: torPct + '%' }"></i></div>

        <!-- HTTP: the address senders use (this computer, or the internet in Public mode) -->
        <template v-if="direct.http">
          <div v-if="httpRunning" class="e-direct-addr" data-test="direct-http-addr">
            <span class="e-ico"><EIcon name="svc-http" /><span class="e-st e-ok" aria-hidden="true"></span></span>
            <code translate="no" dir="ltr">{{ httpAddr }}</code>
            <span class="e-direct-what">{{ $t(M + (direct.public ? 'what_public' : 'what_local')) }}</span>
            <button type="button" class="e-icon-btn e-inline" :aria-label="$t('msg.modern.send.rcv_copy_http')" :title="$t('msg.modern.send.rcv_copy_http')" @click="copy(httpAddr)"><EIcon name="o-copy" /></button>
          </div>
          <p v-if="direct.public" class="e-direct-note" data-test="direct-public-line">
            <span>{{ lan ? $t(M + 'public_line', { port, lan }) : $t(M + 'public_line_nolan', { port }) }}</span>
            <button type="button" class="e-btn-inline" @click="openHelp">{{ $t(M + 'change') }}</button>
          </p>
          <div class="e-direct-reach">
            <span :id="uid + '-reach'" class="e-direct-reach-l">{{ $t(M + 'reach') }}</span>
            <div class="e-seg2" role="group" :aria-labelledby="uid + '-reach'" data-test="direct-reach">
              <button type="button" :aria-pressed="direct.public ? 'false' : 'true'" data-test="direct-reach-local" @click="setPublic(false)">{{ $t(M + 'reach_local') }}</button>
              <button type="button" :aria-pressed="direct.public ? 'true' : 'false'" data-test="direct-reach-public" @click="openHelp">{{ $t(M + 'reach_public') }}</button>
            </div>
            <button type="button" class="e-icon-btn e-inline" data-test="direct-help" :aria-label="$t(M + 'help_label')" :title="$t(M + 'help_label')" @click="openHelp"><EIcon name="o-help" /></button>
          </div>
        </template>

        <!-- Tor: the onion address once published, the rest under Tor details -->
        <template v-if="direct.tor">
          <div v-if="onion && torPhase == 'ready'" class="e-direct-addr" data-test="direct-onion">
            <span class="e-ico"><EIcon name="svc-tor" /><span class="e-st e-ok" aria-hidden="true"></span></span>
            <code translate="no" dir="ltr" :title="onion">{{ onionShort }}</code>
            <button type="button" class="e-icon-btn e-inline" data-test="tor-copy" :aria-label="$t('msg.modern.settings.tor.copy_onion')" :title="$t('msg.modern.settings.tor.copy_onion')" @click="copy(onion)"><EIcon name="o-copy" /></button>
          </div>
          <details class="e-direct-details" :open="torPhase == 'failed' || null" data-test="direct-tor-details">
            <summary>{{ $t(M + 'tor_details') }}</summary>
            <div class="e-direct-kv">
              <span>{{ $t(M + 'd_onion') }}</span><code translate="no" dir="ltr" data-test="tor-onion">{{ onion || '…' }}</code>
              <span>{{ $t(M + 'd_boot') }}</span><span>{{ bootText }}</span>
              <span>{{ $t(M + 'd_forward') }}</span><code translate="no" dir="ltr">127.0.0.1:{{ port }}</code>
              <span>{{ $t(M + 'd_sending') }}</span><span>{{ $t(M + 'd_sending_v') }}</span>
            </div>
          </details>
        </template>

        <label class="e-check e-direct-auto"><input type="checkbox" data-test="direct-autostart" :checked="autostart" @change="(e) => setAutostart(e.target.checked)" />{{ $t(M + 'autostart') }}</label>
      </template>
    </div>

    <div class="e-ctl e-direct-ctl">
      <label class="e-switch">
        <input id="stg-direct-sw" type="checkbox" data-test="direct-switch" :checked="on" aria-labelledby="stg-direct-l" aria-describedby="stg-direct-h" @change="(e) => setOn(e.target.checked)" />
        <span class="e-track"></span>
      </label>
      <div v-if="on" class="e-direct-chips" role="group" :aria-label="$t(M + 'ways')" data-test="direct-chips">
        <button v-for="c in chips" :key="c.key" type="button" class="e-chip" :data-test="'direct-chip-' + c.key" :aria-pressed="c.pressed ? 'true' : 'false'" :aria-disabled="c.locked ? 'true' : null" :title="c.tip" :aria-describedby="uid + '-tip-' + c.key" @click="toggle(c)">
          <span class="e-ico" :class="{ 'e-err': c.dot == 'down' }"><EIcon :name="c.icon" /><span v-if="c.dot" class="e-st" :class="'e-' + c.dot" aria-hidden="true"></span></span>
          <span>{{ c.label }}</span>
          <span class="e-chip-box" aria-hidden="true"><EIcon v-if="c.pressed" name="o-check" /></span>
          <span :id="uid + '-tip-' + c.key" class="e-sr-only">{{ c.tip }}</span>
        </button>
      </div>
    </div>
  </div>
  <PublicModeDialog :open="helpOpen" :is-public="direct.public" :port="port" :addresses="addresses" @update:open="(v) => (helpOpen = v)" @public="setPublic" @use-tor="useTor" />
</template>

<script>
  import { useStore } from '@/store';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import PublicModeDialog from './PublicModeDialog.vue';
  import { setChip, chipLocked } from '@/shared/directTx';
  import { httpUrl } from '@/shared/netAddresses';
  import { torPhase, torPercent, torStatus, torErrorText } from '@/shared/torUi';

  let seq = 0;

  export default {
    name: 'DirectTxRow',
    components: { EIcon, PublicModeDialog },
    setup() {
      return { store: useStore() };
    },
    data() {
      const c = this.configService.config || {};
      return { M: 'msg.modern.settings.direct.', uid: 'e-direct-' + (++seq), retrying: false, helpOpen: false, autostart: c.direct_autostart !== false, addresses: null };
    },
    computed: {
      direct() { return this.store.state.direct; },
      on() { return !!this.direct.on; },
      port() { return this.configService.walletListenerPort; },
      tor() { return this.store.state.tor; },
      torPhase() { return torPhase(this.tor); },
      torPct() { return torPercent(this.tor); },
      torStarting() { return this.direct.tor && (this.torPhase == 'starting' || this.torPhase == 'publishing'); },
      http() { return this.store.state.httpListener || {}; },
      httpRunning() { return this.http.state == 'on'; },
      httpFailed() { return this.http.state == 'failed' ? this.http : null; },
      lan() { return (this.addresses && this.addresses.lan && this.addresses.lan[0]) || ''; },
      httpAddr() {
        if (this.direct.public) return this.direct.httpAddr || httpUrl(this.addresses && this.addresses.public, this.port) || this.$t(this.M + 'public_unknown');
        return 'http://127.0.0.1:' + this.port;
      },
      onion() { return this.tor.onion || ''; },
      onionShort() {
        const k = this.onion.replace(/\.onion$/, '');
        return k.length > 12 ? k.slice(0, 6) + '…' + k.slice(-4) + '.onion' : this.onion;
      },
      bootText() {
        if (this.torPhase == 'failed') return this.$t(this.M + 'boot_stuck', { n: this.torPct });
        if (this.torPhase == 'off') return this.$t(this.M + 'boot_not_started');
        return this.torPct + ' %';
      },
      /* one line: {tone: ok|busy|down|'', text, retry} */
      status() {
        const t = (k, a) => this.$t(k, a);
        if (this.direct.http && this.httpFailed) {
          const f = this.httpFailed;
          const text = f.reason == 'port_in_use' ? t(this.M + 'port_busy', { port: f.port })
            : t(f.reason == 'node' ? 'msg.modern.send.rcv_http_failed_node' : 'msg.modern.send.rcv_http_failed_error');
          return { tone: 'down', text, retry: 'http' };
        }
        if (this.direct.tor && this.torPhase == 'failed') {
          const still = this.tor.retrying ? ' ' + t('msg.modern.settings.tor.still_trying') : '';
          return { tone: 'down', text: torErrorText(t, this.tor.error, this.tor.detail) + still, retry: 'tor' };
        }
        if (this.direct.tor && this.torPhase != 'ready') {
          const s = torStatus(this.tor);
          return { tone: 'busy', text: s ? t(s.key, s.params) : t(this.M + 'st_starting') };
        }
        if (this.direct.http && !this.httpRunning) return { tone: 'busy', text: t(this.M + 'st_starting') };
        const key = this.direct.http && this.direct.tor ? 'st_both' : this.direct.tor ? 'st_tor' : 'st_http';
        return { tone: 'ok', text: t(this.M + key) };
      },
      chips() {
        const sel = { http: this.direct.http, tor: this.direct.tor };
        const httpDot = !sel.http ? '' : this.httpFailed ? 'down' : this.httpRunning ? 'ok' : 'busy';
        const dots = { ready: 'ok', failed: 'down', off: '' };
        const torDot = !sel.tor ? '' : this.torPhase in dots ? dots[this.torPhase] : 'busy';
        const httpTip = !sel.http && sel.tor ? this.$t(this.M + 'http_tip_inside')
          : this.direct.public ? this.$t(this.M + 'http_tip_public', { port: this.port }) : this.$t(this.M + 'http_tip_local', { port: this.port });
        const lock = (k) => (chipLocked(sel, k) ? ' ' + this.$t(this.M + 'last_chip') : '');
        return [
          { key: 'http', icon: 'svc-http', label: this.$t(this.M + 'http'), pressed: sel.http, locked: chipLocked(sel, 'http'), dot: httpDot, tip: httpTip + lock('http') },
          { key: 'tor', icon: 'svc-tor', label: this.$t('msg.modern.settings.tor.title'), pressed: sel.tor, locked: chipLocked(sel, 'tor'), dot: torDot, tip: this.$t(this.M + 'tor_tip') + lock('tor') },
        ];
      },
    },
    watch: {
      'direct.public': { handler(v) { if (v) this.lookup(); }, immediate: true },
    },
    methods: {
      apply(change) {
        this.emitter.emit('app.direct', change);
      },
      setOn(on) {
        this.apply({ on: !!on });
      },
      toggle(c) {
        if (c.locked) return;
        const next = setChip({ http: this.direct.http, tor: this.direct.tor }, c.key, !c.pressed);
        this.apply(next);
      },
      setAutostart(on) {
        this.autostart = !!on;
        this.apply({ autostart: !!on });
      },
      setPublic(on) {
        if (!!on === !!this.direct.wantPublic && !!on === !!this.direct.public) return;
        //Make it public turns HTTP on too: Public is about the HTTP address
        this.apply(on ? { public: true, http: true } : { public: false });
      },
      useTor() {
        this.helpOpen = false;
        this.apply(setChip({ http: this.direct.http, tor: this.direct.tor }, 'tor', true));
      },
      openHelp() {
        this.helpOpen = true;
        this.lookup();
      },
      async lookup() {
        try {
          this.addresses = await window.api.directAddresses();
        } catch (e) {
          this.addresses = { lan: [], public: '' };
        }
      },
      retry() {
        if (this.retrying) return;
        this.retrying = true;
        if (this.status.retry == 'tor') this.emitter.emit('app.startTor');
        else this.apply({});
        setTimeout(() => { this.retrying = false; }, 1500);
      },
      copy(text) {
        window.clipboard.writeText(text);
        this.$toast.show(this.$t('msg.copy_to_clipboard'), { duration: 1000 });
      },
    },
  };
</script>
