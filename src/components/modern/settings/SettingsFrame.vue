<template>
  <!-- Settings page frame: the topbar and the sub-navigation, every section its own item (#57) -->
  <header class="e-topbar"><h1>{{ $t('msg.menu.settings') }}</h1></header>
  <div class="e-content">
    <div class="e-stg-layout">
      <nav class="e-subnav e-stg-nav" :aria-label="$t('msg.modern.settings.sections')">
        <template v-for="item in items" :key="item.name || item.sep">
          <div v-if="item.sep" class="e-stg-nav-sep" role="separator"></div>
          <router-link v-else :to="{ name: item.name }" custom v-slot="{ href, navigate, isExactActive }">
            <a :href="href" :aria-current="isExactActive ? 'page' : null" @click="navigate"><EIcon :name="item.icon" />{{ item.label }}</a>
          </router-link>
        </template>
      </nav>
      <div class="e-stg-panes"><slot /></div>
    </div>
  </div>
</template>

<script>
  import EIcon from '@/components/modern/ui/EIcon.vue';

  export default {
    name: 'SettingsFrame',
    components: { EIcon },
    computed: {
      items() {
        return [
          { name: 'settings', icon: 'node', label: this.$t('msg.modern.settings.nav_node') },
          { name: 'settingsReceiving', icon: 'antenna', label: this.$t('msg.modern.settings.nav_receiving') },
          { name: 'settingsAppearance', icon: 'palette', label: this.$t('msg.modern.settings.nav_appearance') },
          { sep: 1 },
          { name: 'account', icon: 'wallet', label: this.$t('msg.modern.settings.nav_wallet') },
          { name: 'wallets', icon: 'coins', label: this.$t('msg.wallets.all_wallets') },
          { name: 'mnemonic', icon: 'key', label: this.$t('msg.modern.settings.nav_phrase') },
          { name: 'recheckBalance', icon: 'scan', label: this.$t('msg.modern.settings.nav_rescan') },
          { sep: 2 },
          { name: 'about', icon: 'info', label: this.$t('msg.modern.settings.nav_about') },
          { name: 'help', icon: 'help', label: this.$t('msg.modern.settings.nav_help') },
        ];
      },
    },
  };
</script>
