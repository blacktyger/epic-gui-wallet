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
      :title="line.name + ': ' + (line.tip || line.detail) + (line.action ? ' · ' + line.action : '')"
      :aria-label="line.open + ': ' + (line.tip || line.detail)"
      @click="go(line.to)"
    >
      <EIcon :name="line.tone == 'busy' ? 'sync' : line.icon" />
      <span><b>{{ line.name }}</b></span>
      <small v-if="line.detail">{{ line.detail }}</small>
      <small v-if="line.action" class="e-svc-act">{{ line.action }}</small>
    </button>
  </div>
</template>

<script>
  import { computed } from 'vue';
  import { useStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { openSettingsSection } from '@/components/modern/settings/jump';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { nodeBadge } from '@/components/modern/nodeBadge';
  import { epicboxStatus } from '@/shared/epicboxStatus';
  import { httpShown } from '@/shared/httpListener';

  export default {
    name: 'ServiceStatus',
    components: { EIcon },
    setup() {
      const store = useStore();
      const { t, locale } = useI18n();

      //the node is one icon and a short tooltip; the details are in Settings › Node
      const node = computed(() => {
        const b = nodeBadge(store.state.nodeStatus, store.state.nodeProblem);
        const tip = t('msg.modern.' + b.key, { n: Number(b.n).toLocaleString(locale.value) });
        return {
          key: 'node', icon: b.icon, name: t('msg.modern.svc_node'), to: { path: '/settings', hash: '#node' }, open: t('msg.modern.svc_open_node'),
          tone: b.tone, detail: '', tip, action: b.behind ? t('msg.modern.switch_node') : '',
        };
      });

      const receiving = computed(() => {
        const base = { key: 'rcv', icon: 'antenna', name: t('msg.modern.svc_receiving'), to: { path: '/settings', hash: '#epicbox' }, open: t('msg.modern.svc_open_epicbox') };
        //HTTP only while its listener runs, "failed" when it couldn't start (shared/httpListener.js, QA W01)
        const httpState = httpShown(store.state.httpListener);
        const http = httpState == 'on';
        const epicbox = store.state.walletEpicboxService;
        //the server the Epicbox listener is really on (its own output), not the saved setting
        const box = epicboxStatus(store.state.epicbox, epicbox);
        if (box.kind == 'checking') return { ...base, tone: 'busy', detail: t('msg.modern.svc_epicbox_checking', { s: box.checking }) };
        if ((box.kind == 'starting' || box.kind == 'connecting') && box.server) return { ...base, tone: 'busy', detail: t('msg.modern.svc_epicbox_connecting', { s: box.server }) };
        if (store.state.listenerStarting) return { ...base, tone: 'busy', detail: t('msg.modern.svc_listener_starting') };
        if (epicbox && box.server) {
          if (httpState == 'failed') return { ...base, tone: 'warn', detail: t('msg.modern.svc_epicbox_http_failed', { s: box.server }) };
          return { ...base, tone: box.kind == 'paused' ? 'warn' : 'ok', detail: t(http ? 'msg.modern.svc_epicbox_http_on' : 'msg.modern.svc_epicbox_on', { s: box.server }) };
        }
        if (httpState == 'failed') return { ...base, tone: 'warn', detail: t(epicbox ? 'msg.modern.svc_epicbox_http_failed_short' : 'msg.modern.svc_http_failed') };
        if (http && epicbox) return { ...base, tone: 'ok', detail: t('msg.modern.svc_epicbox_http') };
        if (epicbox) return { ...base, tone: 'ok', detail: t('msg.modern.svc_epicbox') };
        if (http) return { ...base, tone: 'warn', detail: t('msg.modern.svc_http_only') };
        return { ...base, tone: 'warn', detail: t('msg.modern.svc_off') };
      });

      const lines = computed(() => [node.value, receiving.value]);
      const router = useRouter();
      const go = (to) => openSettingsSection(router, to);
      return { lines, go };
    },
  };
</script>
