<template>
  <!-- The saved node's details, read-only: the main views show only a status icon (nodeBadge.js).
       From the status poll that already runs: no extra request. -->
  <div class="e-nodeinfo" role="group" :aria-label="$t('msg.modern.settings.node_info')">
    <p class="e-nodeinfo-state" role="status"><EIcon :name="badge.icon" size="sm" :class="'e-' + badge.tone" />{{ tip }}</p>
    <dl v-if="rows.length" class="e-nodeinfo-rows">
      <div v-for="r in rows" :key="r.k">
        <dt>{{ r.k }}</dt>
        <dd class="e-num" translate="no">{{ r.v }}</dd>
      </div>
    </dl>
  </div>
</template>

<script>
  import { computed } from 'vue';
  import { useStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { nodeBadge } from '@/components/modern/nodeBadge';

  export default {
    name: 'CurrentNodeInfo',
    components: { EIcon },
    setup() {
      const store = useStore();
      const { t, locale } = useI18n();
      const num = (n) => Number(n).toLocaleString(locale.value);
      const badge = computed(() => nodeBadge(store.state.nodeStatus, store.state.nodeProblem));
      const tip = computed(() => t('msg.modern.' + badge.value.key, { n: num(badge.value.n) }));
      const rows = computed(() => {
        const s = store.state.nodeStatus || {};
        const out = [];
        const addr = store.state.nodeType;
        if (addr) out.push({ k: t('msg.modern.settings.node_info_address'), v: addr == 'internal' ? t('msg.modern.overview.node_builtin') : (addr == 'external' ? t('msg.modern.overview.node_external') : addr) });
        if (s.error || !s.tip) return out;
        const ua = String(s.user_agent || '');
        const m = ua.match(/(\d+\.\d+\.\d+[^\s]*)/);
        if (ua) out.push({ k: t('msg.modern.settings.node_info_version'), v: m ? m[1] : ua });
        if (s.tip.height > 0) {
          const lag = s.node_behind > 0 ? t('msg.nodedir.behind', { n: num(s.node_behind) }) : (s.sync_status == 'synced' ? t('msg.nodedir.at_tip') : '');
          out.push({ k: t('msg.modern.settings.node_info_height'), v: num(s.tip.height) + (lag ? ' · ' + lag : '') });
        }
        if (Number.isFinite(s.response_ms)) out.push({ k: t('msg.modern.settings.node_info_response'), v: t('msg.nodedir.latency_ms', { n: num(s.response_ms) }) });
        if (s.checked_at) out.push({ k: t('msg.modern.settings.node_info_checked'), v: new Date(s.checked_at).toLocaleTimeString(locale.value) });
        return out;
      });
      return { badge, tip, rows };
    },
  };
</script>
