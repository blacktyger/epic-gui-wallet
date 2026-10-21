<template>
  <!-- Receive from the internet (bot #67): Local only or Public for the HTTP address, how to forward the
       port, and Tor as the no-setup way. "Make it public" sets api_listen_interface = "0.0.0.0" in this
       wallet's epic-wallet.toml (shared/directTx.js listenInterface); kept until switched back. -->
  <EDialog class="e-pub-dialog" :open="open" :title="$t(M + 'title')" @update:open="(v) => $emit('update:open', v)">
    <svg class="e-pub-dia" viewBox="0 0 520 74" role="img" :aria-label="$t(M + 'dia_label', { port })">
      <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="8" y="20" width="58" height="34" rx="6" /><path d="M26 60h22" />
        <path d="M82 37h96" stroke-dasharray="2 5" />
        <path d="M206 27a14 14 0 0 1 27-3 11 11 0 0 1 3 22h-27a11 11 0 0 1-3-19z" transform="translate(-6 -2)" />
        <path d="M240 37h46" stroke-dasharray="2 5" />
        <rect x="300" y="28" width="66" height="22" rx="4" /><path d="M312 39h.01M322 39h.01M360 20v8" />
        <path d="M374 39h58" /><path d="M426 33l6 6-6 6" />
        <rect x="446" y="16" width="62" height="38" rx="5" /><path d="M462 62h30" />
      </g>
      <g fill="currentColor" font-size="11" text-anchor="middle" aria-hidden="true">
        <text x="37" y="72">{{ $t(M + 'dia_sender') }}</text><text x="204" y="72">{{ $t(M + 'dia_internet') }}</text>
        <text x="333" y="72">{{ $t(M + 'dia_router') }}</text><text x="408" y="24" class="e-pub-hl">{{ $t(M + 'dia_port', { port }) }}</text>
        <text x="477" y="72">{{ $t(M + 'dia_this') }}</text>
      </g>
    </svg>

    <div class="e-pub-two">
      <div class="e-pub-opt" :class="{ 'e-on': !isPublic }"><b>{{ $t(M + 'opt_local') }}<span v-if="!isPublic" class="e-pub-tag">{{ $t(M + 'opt_now') }}</span></b><p>{{ $t(M + 'opt_local_text') }}</p></div>
      <div class="e-pub-opt" :class="{ 'e-on': isPublic }"><b>{{ $t(M + 'opt_public') }}<span v-if="isPublic" class="e-pub-tag">{{ $t(M + 'opt_now') }}</span></b><p>{{ $t(M + 'opt_public_text') }}</p></div>
    </div>

    <ol class="e-pub-steps">
      <li>
        <span class="e-pub-num" aria-hidden="true">1</span>
        <div>
          <b>{{ $t(M + 's1_title') }}</b>
          <p>{{ $t(M + 's1_text', { ip: '0.0.0.0', file: 'epic-wallet.toml', port }) }}</p>
          <p v-if="windows">{{ $t(M + 's1_windows') }}</p>
          <button v-if="!isPublic" type="button" class="e-btn e-btn-primary e-pub-go" data-test="direct-make-public" @click="$emit('public', true)">{{ $t(M + 's1_btn') }}</button>
          <button v-else type="button" class="e-btn e-btn-sm e-pub-go" data-test="direct-make-local" @click="$emit('public', false)">{{ $t(M + 's1_back') }}</button>
        </div>
      </li>
      <li>
        <span class="e-pub-num" aria-hidden="true">2</span>
        <div>
          <b>{{ $t(M + 's2_title') }}</b>
          <p>{{ $t(M + 's2_text', { router: routerGuess, port }) }}</p>
          <div class="e-pub-addr"><code translate="no" dir="ltr">{{ lan || (addresses ? $t(M + 'not_found') : $t(M + 'looking')) }}</code><button v-if="lan" type="button" class="e-icon-btn e-inline" :aria-label="$t(M + 'copy_lan')" :title="$t(M + 'copy_lan')" @click="copy(lan)"><EIcon name="o-copy" /></button></div>
        </div>
      </li>
      <li>
        <span class="e-pub-num" aria-hidden="true">3</span>
        <div>
          <b>{{ $t(M + 's3_title') }}</b>
          <p>{{ $t(M + 's3_text') }}</p>
          <div class="e-pub-addr" data-test="direct-public-addr"><code translate="no" dir="ltr">{{ publicUrl || (addresses ? $t(M + 'not_found') : $t(M + 'looking')) }}</code><button v-if="publicUrl" type="button" class="e-icon-btn e-inline" :aria-label="$t(M + 'copy_public')" :title="$t(M + 'copy_public')" @click="copy(publicUrl)"><EIcon name="o-copy" /></button></div>
        </div>
      </li>
    </ol>

    <p class="e-pub-alt">
      <EIcon name="svc-tor" />
      <span><b>{{ $t(M + 'alt_title') }}</b> {{ $t(M + 'alt_text') }} <button type="button" class="e-btn-inline" data-test="direct-use-tor" @click="$emit('use-tor')">{{ $t(M + 'alt_btn') }}</button></span>
    </p>
    <p class="e-pub-note">{{ $t(M + 'sec_note', { path: '/v2/foreign' }) }}</p>
  </EDialog>
</template>

<script>
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { httpUrl } from '@/shared/netAddresses';

  export default {
    name: 'PublicModeDialog',
    components: { EDialog, EIcon },
    props: {
      open: { type: Boolean, default: false },
      isPublic: { type: Boolean, default: false },
      port: { type: Number, default: 3415 },
      //window.api.directAddresses(): {lan: [ipv4], public: ''|ipv4}; null while it is looked up
      addresses: { type: Object, default: null },
    },
    emits: ['update:open', 'public', 'use-tor'],
    data() {
      return { M: 'msg.modern.settings.direct.pub.' };
    },
    computed: {
      windows() { return String((this.configService && this.configService.platform) || '').startsWith('win'); },
      lan() { return (this.addresses && this.addresses.lan && this.addresses.lan[0]) || ''; },
      publicUrl() { return httpUrl(this.addresses && this.addresses.public, this.port); },
      //the router is usually the .1 of the LAN address
      routerGuess() { return this.lan ? this.lan.replace(/\.\d+$/, '.1') : '192.168.1.1'; },
    },
    methods: {
      copy(text) {
        window.clipboard.writeText(text);
        this.$toast.show(this.$t('msg.copy_to_clipboard'), { duration: 1000 });
      },
    },
  };
</script>
