<template>
  <!-- The Modern interface's root: icon sprite, the route's Modern view inside the app frame (or
       bare for unlock and first run), and the app-level dialogs App.vue drives. -->
  <div class="e-root" :class="{ 'e-is-hidden-values': store.state.hideValues }">
    <IconSprite />
    <router-view v-slot="{ Component, route }">
      <AppShell v-if="layoutOf(route) == 'app'">
        <component :is="viewOf(route, Component)" :key="route.fullPath" />
      </AppShell>
      <component v-else :is="viewOf(route, Component)" :key="route.fullPath" />
    </router-view>

    <NodeSyncedDialog
      :is-active="isNodeModalActive"
      @confirm="$emit('nodesynced-confirm')"
      @cancel="$emit('nodesynced-cancel')"
    />
    <KillProcessDialog />
    <SupportDialog />
    <FirstscanDialog
      :is-active="isFirstscanModalActive"
      :output-data="scanoutput"
      @confirm="$emit('firstscan-confirm')"
      @cancel="$emit('firstscan-cancel')"
    />
  </div>
</template>

<script>
  import { useStore } from '@/store';
  import IconSprite from '@/components/modern/ui/IconSprite.vue';
  import AppShell from '@/components/modern/shell/AppShell.vue';
  import NodeSyncedDialog from '@/components/modern/dialogs/NodeSyncedDialog.vue';
  import KillProcessDialog from '@/components/modern/dialogs/KillProcessDialog.vue';
  import FirstscanDialog from '@/components/modern/dialogs/FirstscanDialog.vue';
  import SupportDialog from '@/components/modern/dialogs/SupportDialog.vue';
  import { MODERN_VIEWS } from '@/components/modern/views';

  export default {
    name: 'ModernApp',
    components: { IconSprite, AppShell, NodeSyncedDialog, KillProcessDialog, FirstscanDialog, SupportDialog },
    props: {
      isNodeModalActive: { type: Boolean, default: false },
      isFirstscanModalActive: { type: Boolean, default: false },
      scanoutput: { type: Array, default: () => [] },
    },
    emits: ['nodesynced-confirm', 'nodesynced-cancel', 'firstscan-confirm', 'firstscan-cancel'],
    setup() {
      return { store: useStore() };
    },
    watch: {
      //the window title follows the page
      '$route.name': {
        immediate: true,
        handler() {
          const v = MODERN_VIEWS[this.$route.name];
          const page = v && v.titleKey ? this.$t(v.titleKey) : '';
          document.title = page ? page + ' · Epic Cash wallet' : 'Epic Cash wallet';
        },
      },
    },
    methods: {
      layoutOf(route) {
        const v = MODERN_VIEWS[route.name];
        return v ? v.layout : 'bare';
      },
      //a route without a Modern view yet falls back to its Classic component
      viewOf(route, Component) {
        const v = MODERN_VIEWS[route.name];
        return v ? v.component : Component;
      },
    },
  };
</script>

<style>
  .e-root { min-height: 100vh; }
</style>
