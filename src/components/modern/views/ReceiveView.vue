<template>
  <header class="e-topbar">
    <h1>{{ $t('msg.menu.receive') }}</h1>
    <div class="e-topbar-actions">
      <span class="e-rcv-live e-small" role="status">
        <EIcon :name="listening ? 'okc' : 'minusc'" size="sm" :class="listening ? 'e-ok' : 'e-faint'" />{{ listening ? $t('msg.modern.send.rcv_on') : $t('msg.modern.send.rcv_off') }}
      </span>
    </div>
  </header>

  <div class="e-content">
    <div class="e-rcv-page">

      <!-- Off: one calm block that says what is missing and starts it -->
      <section v-if="!listening" class="e-panel e-rcv-start" aria-labelledby="e-rcv-start-t">
        <div class="e-rcv-start-text">
          <EIcon name="antenna" />
          <div>
            <h2 id="e-rcv-start-t">{{ $t('msg.modern.send.rcv_start_title') }}</h2>
            <p>{{ $t('msg.modern.send.rcv_start_text') }}</p>
          </div>
        </div>
        <form class="e-rcv-start-form" novalidate @submit.prevent="isLoading || start()">
          <button type="submit" class="e-btn e-btn-primary" :class="{ 'e-is-busy': isLoading }" :aria-busy="isLoading ? 'true' : null"><EIcon name="antenna" />{{ $t('msg.modern.send.rcv_start') }}</button>
        </form>
      </section>

      <!-- Your Epic address -->
      <section class="e-panel e-rcv-hero" aria-labelledby="e-rcv-addr-t">
        <div class="e-rcv-hero-text">
          <h2 id="e-rcv-addr-t">{{ $t('msg.modern.send.rcv_addr_title') }}</h2>
          <p class="e-dim">{{ $t('msg.modern.send.rcv_addr_text') }}</p>
          <!-- shown whenever it is known, dimmed while nothing receives on it (QA T09, shared/receiveAddress.js) -->
          <div class="e-addr e-lg e-rcv-addr" :class="{ 'e-is-off': epicView.dim }">
            <code v-if="epicShown" translate="no"><span :class="{ 'e-hl': !epicView.dim }">{{ epicHead }}</span>{{ epicMid }}<span :class="{ 'e-hl': !epicView.dim }">{{ epicTail }}</span>{{ epicDomain }}</code>
            <code v-else-if="epicView.state == 'unknown'">{{ $t('msg.httpReceive.epicbox_address_unknown') }}</code>
            <code v-else>{{ $t('msg.httpReceive.epicbox_off') }}</code>
          </div>
          <p v-if="epicShown" class="e-small e-faint">{{ $t('msg.modern.send.rcv_addr_check') }}</p>
          <div class="e-rcv-hero-actions">
            <button type="button" class="e-btn" :class="{ 'e-btn-primary': epicView.state == 'receiving' }" :disabled="!epicShown" @click="copy(epicboxAddress)"><EIcon name="copy" />{{ $t('msg.modern.send.rcv_copy_addr') }}</button>
            <button v-if="epicShown && addressTypeHeader != 'epicbox'" type="button" class="e-btn e-btn-ghost" @click="showQr(epicboxAddress, 'epicbox')"><EIcon name="qr" />{{ $t('msg.modern.send.rcv_show_qr') }}</button>
            <p class="e-rcv-status" role="status">
              <template v-if="!listening"><EIcon name="minusc" size="sm" class="e-faint" />{{ $t('msg.httpReceive.epicbox_address_off') }}</template>
              <template v-else-if="epicboxLine && epicboxLine.tone != 'ok'"><EIcon :name="epicboxLine.tone == 'busy' ? 'sync' : 'alert'" size="sm" :class="epicboxLine.tone == 'busy' ? 'e-faint' : 'e-warn'" />{{ epicboxLine.text }}</template>
              <template v-else-if="store.state.walletEpicboxService && epicDomainName"><EIcon name="okc" size="sm" class="e-ok" />{{ $t('msg.modern.send.rcv_listening_via', { domain: epicDomainName }) }}</template>
              <!-- the listener is up but the address isn't known yet (the first seconds after unlock): not "Listening via " with no server -->
              <template v-else-if="store.state.walletEpicboxService"><EIcon name="sync" size="sm" class="e-faint" />{{ $t('msg.modern.svc_connecting') }}</template>
              <template v-else><EIcon name="alert" size="sm" class="e-warn" />{{ $t('msg.modern.send.rcv_listening_no_epicbox') }}</template>
            </p>
          </div>
        </div>
        <div class="e-rcv-qrbox">
          <!-- the Epic address works while the listener is stopped, so its QR code stays scannable -->
          <div class="e-qr e-rcv-qr" :class="{ 'e-is-off': qrOff }">
            <canvas v-show="addressTypeHeader" id="qrcodeCanvas" role="img" :aria-label="addressTypeHeader ? $t('msg.httpReceive.your_qrcode', [addressTypeHeader]) : null"></canvas>
            <p v-show="!addressTypeHeader" class="e-rcv-qr-empty"><EIcon name="qr" size="lg" />{{ $t('msg.modern.send.rcv_qr_empty') }}</p>
            <span v-if="qrOff" class="e-rcv-qr-note" aria-hidden="true">{{ $t('msg.modern.send.rcv_paused') }}</span>
          </div>
          <p v-if="addressTypeHeader" class="e-small e-faint e-rcv-qr-cap">{{ $t('msg.httpReceive.your_qrcode', [addressTypeHeader]) }}</p>
        </div>
      </section>

      <div class="e-rcv-cols">
        <div>
          <div class="e-section-head"><h2>{{ $t('msg.modern.send.rcv_other') }}</h2></div>
          <div class="e-set-list">

            <div class="e-set-row e-rcv-row">
              <div>
                <b>{{ $t('msg.modern.send.rcv_http') }}</b>
                <div class="e-rcv-line"><code class="e-mono" :class="{ 'e-faint': !httpOn }" translate="no">{{ localAddress || '…' }}</code></div>
                <!-- the HTTP listener didn't start: say why; Epicbox goes on (QA W01) -->
                <p v-if="httpFailed" class="e-rcv-check" role="status"><EIcon name="alert" size="sm" class="e-warn" /><span><b>{{ $t('msg.modern.send.rcv_http_failed') }}</b>{{ httpFailed.reason == 'port_in_use' ? $t('msg.modern.send.rcv_http_failed_port', { port: httpFailed.port }) : $t(httpFailed.reason == 'node' ? 'msg.modern.send.rcv_http_failed_node' : 'msg.modern.send.rcv_http_failed_error') }}</span></p>
                <!-- the wallet's toml listens on 127.0.0.1 only: no port check, no "forward the port" (it would not help) -->
                <p v-else-if="httpOn" class="e-rcv-check" role="status"><EIcon name="okc" size="sm" class="e-ok" /><span>{{ $t('msg.modern.send.rcv_http_local_only', { port }) }}</span></p>
                <p v-else class="e-rcv-check"><EIcon name="minusc" size="sm" class="e-faint" /><span>{{ $t('msg.modern.send.rcv_http_on_demand') }}</span></p>
              </div>
              <div class="e-ctl">
                <button v-if="httpFailed" type="button" class="e-btn e-btn-sm" :class="{ 'e-is-busy': httpRetrying }" :aria-busy="httpRetrying ? 'true' : null" @click="httpRetrying || retryHttp()"><EIcon name="refresh" />{{ $t('msg.httpReceive.http_retry') }}</button>
                <button v-if="httpOn || httpFailed" type="button" class="e-btn e-btn-sm" :class="{ 'e-is-busy': httpSwitching }" :aria-busy="httpSwitching ? 'true' : null" @click="httpSwitching || httpTurnOff()"><EIcon name="stop" />{{ $t('msg.modern.send.rcv_http_turn_off') }}</button>
                <button v-else type="button" class="e-btn e-btn-sm" :class="{ 'e-is-busy': httpSwitching }" :aria-busy="httpSwitching ? 'true' : null" @click="httpSwitching || httpTurnOn()"><EIcon name="antenna" />{{ $t('msg.modern.send.rcv_http_turn_on') }}</button>
                <button type="button" class="e-icon-btn" :disabled="!httpOn || !localAddress" :aria-label="httpOn ? $t('msg.modern.send.rcv_copy_http') : $t('msg.modern.send.rcv_copy_http_off')" @click="copy(localAddress)"><EIcon name="copy" size="sm" /></button>
                <button type="button" class="e-icon-btn" :disabled="!httpOn || !localAddress" :aria-label="$t('msg.modern.send.rcv_qr_http')" @click="showQr(localAddress, 'local')"><EIcon name="qr" size="sm" /></button>
              </div>
            </div>

          </div>
        </div>

        <div>
          <div class="e-section-head"><h2>{{ $t('msg.modern.send.rcv_files') }}</h2></div>
          <div class="e-set-list">
            <div class="e-set-row">
              <div>
                <b id="e-rcv-sign-t">{{ $t('msg.modern.send.rcv_sign_title') }}</b>
                <p>{{ $t('msg.modern.send.rcv_sign_text') }}</p>
              </div>
              <div class="e-ctl"><router-link id="e-rcv-sign-l" class="e-btn e-btn-sm" to="/importTransaction" aria-labelledby="e-rcv-sign-l e-rcv-sign-t"><EIcon name="filedown" />{{ $t('msg.modern.send.rcv_open') }}</router-link></div>
            </div>
            <div class="e-set-row">
              <div>
                <b id="e-rcv-fin-t">{{ $t('msg.modern.send.rcv_finalize_title') }}</b>
                <p>{{ $t('msg.modern.send.rcv_finalize_text') }}</p>
              </div>
              <div class="e-ctl"><router-link id="e-rcv-fin-l" class="e-btn e-btn-sm" to="/finalizeTransaction" aria-labelledby="e-rcv-fin-l e-rcv-fin-t"><EIcon name="fileup" />{{ $t('msg.modern.send.rcv_open') }}</router-link></div>
            </div>
          </div>

          <template v-if="listening">
            <div class="e-section-head"><h2>{{ $t('msg.modern.send.rcv_listener') }}</h2></div>
            <div class="e-set-list">
              <div class="e-set-row">
                <div>
                  <b>{{ $t('msg.modern.send.rcv_on') }}</b>
                  <p>{{ $t(httpOn ? 'msg.modern.send.rcv_listener_on_text' : 'msg.modern.send.rcv_listener_on_epicbox') }}</p>
                </div>
                <div class="e-ctl"><button type="button" class="e-btn e-btn-sm" :class="{ 'e-is-busy': isLoading }" :aria-busy="isLoading ? 'true' : null" @click="isLoading || stop()"><EIcon name="stop" />{{ $t('msg.modern.send.rcv_stop') }}</button></div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import HttpReceive from '@/components/HttpReceive.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import httpListenerSwitch from '@/components/modern/httpListenerSwitch';

  export default reskin(HttpReceive, {
    components: { EIcon },
    mixins: [httpListenerSwitch],
    data() {
      return {
        //the user picked a QR code; until then the Epic address is shown
        qrChosen: false,
      };
    },
    watch: {
      epicShown(v) {
        if (v && !this.qrChosen) this.qrcode(this.epicboxAddress, 'epicbox');
      },
    },
    computed: {
      listening() { return !!this.store.state.walletListenerService; },
      epicShown() { return this.epicView.show; },
      //the HTTP address's QR code while nothing listens on it (its button is disabled then; a QR code picked before)
      qrOff() { return !this.listening && !!this.addressTypeHeader && this.addressTypeHeader != 'epicbox'; },
      port() { return this.configService.walletListenerPort; },
      //the Epic address split for reading out: first five and last four characters of the key
      epicKey() { return String(this.epicboxAddress || '').split('@')[0]; },
      epicDomain() { return this.epicboxAddress ? this.epicboxAddress.slice(this.epicKey.length) : ''; },
      epicDomainName() { return this.epicDomain.replace(/^@/, ''); },
      epicHead() { return this.epicKey.slice(0, 5); },
      epicTail() { return this.epicKey.length > 9 ? this.epicKey.slice(-4) : ''; },
      epicMid() { return this.epicKey.length > 9 ? this.epicKey.slice(5, -4) : this.epicKey.slice(5); },
    },
    methods: {
      showQr(text, type) {
        this.qrChosen = true;
        this.qrcode(text, type);
      },
      /* HTTP receiving turned off here: its QR code, if shown, gives way to the Epic address's */
      httpTurnedOff() {
        if (this.addressTypeHeader == 'local') {
          if (this.epicShown) this.qrcode(this.epicboxAddress, 'epicbox');
          else this.addressTypeHeader = '';
        }
      },
    },
  });
</script>
