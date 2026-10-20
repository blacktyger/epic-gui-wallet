<template>
  <!-- The Modern app frame: sidebar (brand, pages, connection status, wallet and lock) and the
       scrolling main column. The logic is NavBar's (logout, wallet folder), so Lock does what
       Classic's Log out does. -->
  <a class="e-skip" href="#e-main" @click.prevent="focusMain">{{ $t('msg.modern.skip') }}</a>
  <div class="e-app">
    <nav class="e-side" :aria-label="$t('msg.modern.nav_main')">
      <!-- the logo is only a logo; the version opens its release on GitHub in the browser -->
      <div class="e-side-brand">
        <svg viewBox="0 0 281 324" aria-hidden="true"><use href="#i-mark" /></svg>
        <div>
          <b>Epic Cash</b><br>
          <a v-if="version" class="e-side-version" :href="releasesUrl" :title="$t('msg.modern.version_link')" @click.prevent="openRelease" @auxclick.prevent>
            {{ $t('msg.modern.wallet_version', { v: version }) }}
          </a>
        </div>
      </div>
      <div class="e-nav">
        <router-link v-for="item in nav" :key="item.to" :to="item.to" :aria-current="isCurrent(item) ? 'page' : null" custom v-slot="{ href, navigate }">
          <a :href="href" :aria-current="isCurrent(item) ? 'page' : null" :data-tour="item.tour" @click="navigate">
            <EIcon :name="item.icon" /><span>{{ item.label }}</span>
            <span v-if="item.count" class="e-count" :title="$t('msg.modern.needs_action', item.count)">
              <span aria-hidden="true">{{ item.count }}</span><span class="e-sr-only">, {{ $t('msg.modern.needs_action', item.count) }}</span>
            </span>
          </a>
        </router-link>
        <div class="e-nav-sep" role="separator"></div>
        <router-link to="/settings" custom v-slot="{ href, navigate }">
          <a :href="href" :aria-current="isSettings ? 'page' : null" data-tour="settings" @click="navigate"><EIcon name="settings" /><span>{{ $t('msg.menu.settings') }}</span></a>
        </router-link>
      </div>
      <div class="e-side-foot">
        <ServiceStatus />
        <div class="e-account">
          <router-link to="/account" custom v-slot="{ href, navigate }">
            <a class="e-account-link e-grow" :href="href" :aria-label="$t('msg.modern.svc_open_wallet') + ': ' + accountName" :title="$t('msg.modern.svc_open_wallet')" @click="navigate">
              <div class="e-avatar" aria-hidden="true">{{ initials }}</div>
              <div class="e-grow"><b class="e-truncate">{{ accountName }}</b><small>{{ network }}</small></div>
            </a>
          </router-link>
          <button
            v-if="canSwitch"
            type="button"
            class="e-icon-btn e-sm"
            :disabled="isLoading"
            :title="$t('msg.wallets.switch')"
            :aria-label="$t('msg.wallets.switch')"
            @click="switchWallet"
          ><EIcon name="swap" /></button>
          <button
            type="button"
            class="e-icon-btn e-sm"
            :class="{ 'e-is-busy': isLoading }"
            :disabled="isLoading"
            :aria-busy="isLoading ? 'true' : null"
            :title="$t('msg.modern.lock') + ' (Ctrl+L)'"
            :aria-label="$t('msg.modern.lock')"
            @click="logout"
          ><span v-if="isLoading" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="lock" /></button>
        </div>
        <Credits />
      </div>
    </nav>
    <main class="e-main" id="e-main" ref="main" tabindex="-1">
      <slot />
    </main>
  </div>
</template>

<script>
  import NavBar from '@/components/layout/NavBar.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import ServiceStatus from '@/components/modern/shell/ServiceStatus.vue';
  import Credits from '@/components/modern/ui/Credits.vue';
  import { reskin } from '@/components/modern/reskin';
  import { RELEASES_URL, openRelease } from '@/shared/releaseLink';

  /* routes that belong to a sidebar entry without being its path */
  const SECTIONS = {
    '/dashboard': [],
    '/activity': [],
    '/httpSend': [],
    '/httpReceive': ['importTransaction', 'finalizeTransaction'],
    '/addressBook': [],
  };
  const SETTINGS = ['settings', 'account', 'mnemonic', 'recheckBalance', 'about', 'help'];

  export default reskin(NavBar, {
    name: 'AppShell',
    components: { EIcon, ServiceStatus, Credits },
    data() {
      return { version: '', releasesUrl: RELEASES_URL };
    },
    computed: {
      /* file sends that wait for the recipient's response file: the same test as the Finalize
         button in Transaction.vue */
      pendingFiles() {
        return (this.store.state.txs || []).filter(tx =>
          tx.status == 'unconfirmed' && tx.address && tx.address.type == 'file' && String(tx.tx_type).startsWith('TxSent')
        ).length;
      },
      nav() {
        return [
          { to: '/dashboard', icon: 'home', label: this.$t('msg.modern.nav_overview') },
          { to: '/activity', icon: 'activity', label: this.$t('msg.modern.activity'), count: this.pendingFiles, tour: 'activity' },
          { to: '/httpSend', icon: 'send', label: this.$t('msg.menu.send'), tour: 'send' },
          { to: '/httpReceive', icon: 'receive', label: this.$t('msg.menu.receive'), tour: 'receive' },
          { to: '/addressBook', icon: 'contacts', label: this.$t('msg.modern.contacts') },
        ];
      },
      isSettings() {
        return SETTINGS.includes(this.$route.name);
      },
      network() {
        return this.configService.defaultAccountNetwork || '';
      },
      initials() {
        const name = String(this.accountName || '').trim();
        if (!name) return '·';
        const parts = name.split(/[\s_-]+/).filter(Boolean);
        return ((parts[0] || '')[0] + ((parts[1] || parts[0] || '')[1] || '')).toUpperCase();
      },
    },
    async mounted() {
      window.addEventListener('keydown', this.onKey);
      try { this.version = await window.api.version(); } catch (e) { this.version = ''; }
    },
    beforeUnmount() {
      window.removeEventListener('keydown', this.onKey);
    },
    methods: {
      /* this version's release on GitHub (or the releases page), in the browser */
      async openRelease() {
        if (this.releaseOpening) return;
        this.releaseOpening = true;
        try { await openRelease(window.api, (url) => window.openlink.open(url)); } finally { this.releaseOpening = false; }
      },
      isCurrent(item) {
        return this.$route.path == item.to || (SECTIONS[item.to] || []).includes(this.$route.name);
      },
      focusMain() {
        this.$refs.main && this.$refs.main.focus();
      },
      onKey(e) {
        //Ctrl+L locks, like the sidebar button
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() == 'l' && !this.isLoading) {
          e.preventDefault();
          this.logout();
        }
      },
    },
  });
</script>
