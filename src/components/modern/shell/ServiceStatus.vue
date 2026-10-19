<template>
  <!-- Connection status: one line per service, always in the same place. Text and icon, never a
       coloured dot alone. Each line opens its settings. -->
  <div class="e-svc-block">
    <button
      v-for="line in lines"
      :key="line.key"
      type="button"
      class="e-svc"
      :class="'e-is-' + line.tone"
      :title="line.name + ': ' + line.detail + (line.action ? ' · ' + line.action : '')"
      @click="$router.push(line.to)"
    >
      <EIcon :name="line.tone == 'busy' ? 'sync' : line.icon" />
      <span><b>{{ line.name }}</b></span>
      <small>{{ line.detail }}</small>
    </button>
  </div>
</template>

<script>
  import { computed } from 'vue';
  import { useStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { nodeSyncPercent } from '@/components/modern/format';
  import { epicboxStatus } from '@/shared/epicboxStatus';

  export default {
    name: 'ServiceStatus',
    components: { EIcon },
    setup() {
      const store = useStore();
      const { t, locale } = useI18n();

      const node = computed(() => {
        const s = store.state.nodeStatus || {};
        const base = { key: 'node', icon: 'server', name: t('msg.modern.svc_node'), to: '/settings' };
        if (s.error) return { ...base, tone: 'risk', detail: t('msg.modern.svc_node_down') };
        if (!s.user_agent) return { ...base, tone: 'busy', detail: t('msg.modern.svc_connecting') };
        //behind the network tip (nodeService.assessStatus): the line opens Settings, node first, to switch
        if (s.node_behind > 0) {
          return { ...base, tone: 'warn', detail: t('msg.modern.svc_behind', { n: Number(s.node_behind).toLocaleString(locale.value) }), action: t('msg.modern.switch_node') };
        }
        if (s.sync_status != 'synced') {
          return { ...base, tone: 'warn', detail: t('msg.modern.svc_syncing', { p: nodeSyncPercent(s, locale.value) }) };
        }
        const h = s.tip && s.tip.height ? Number(s.tip.height).toLocaleString(locale.value) : '';
        return { ...base, tone: 'ok', detail: t('msg.modern.svc_synced', { h }) };
      });

      const receiving = computed(() => {
        const base = { key: 'rcv', icon: 'antenna', name: t('msg.modern.svc_receiving'), to: '/httpReceive' };
        const http = store.state.walletListenerService;
        const epicbox = store.state.walletEpicboxService;
        //the server the Epicbox listener is really on (its own output), not the saved setting
        const box = epicboxStatus(store.state.epicbox, epicbox);
        if (box.kind == 'checking') return { ...base, tone: 'busy', detail: t('msg.modern.svc_epicbox_checking', { s: box.checking }) };
        if ((box.kind == 'starting' || box.kind == 'connecting') && box.server) return { ...base, tone: 'busy', detail: t('msg.modern.svc_epicbox_connecting', { s: box.server }) };
        if (store.state.listenerStarting) return { ...base, tone: 'busy', detail: t('msg.modern.svc_listener_starting') };
        if (epicbox && box.server) {
          return { ...base, tone: box.kind == 'paused' ? 'warn' : 'ok', detail: t(http ? 'msg.modern.svc_epicbox_http_on' : 'msg.modern.svc_epicbox_on', { s: box.server }) };
        }
        if (http && epicbox) return { ...base, tone: 'ok', detail: t('msg.modern.svc_epicbox_http') };
        if (epicbox) return { ...base, tone: 'ok', detail: t('msg.modern.svc_epicbox') };
        if (http) return { ...base, tone: 'warn', detail: t('msg.modern.svc_http_only') };
        return { ...base, tone: 'warn', detail: t('msg.modern.svc_off') };
      });

      const lines = computed(() => [node.value, receiving.value]);
      return { lines };
    },
  };
</script>
