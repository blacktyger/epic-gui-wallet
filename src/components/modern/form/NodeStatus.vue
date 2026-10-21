<template>
  <!-- Settings › Node: the status line under the node field (mockups direction 2). One status glyph from
       ready_for_txs (nodeBadge.js), the height with a meter (the gap in its tooltip), the last block as a
       relative time (get_header, only while shown, once per new tip), the version only when too old. -->
  <p :id="id || null" class="e-stg-meta e-node-status" role="status" data-test="node-status">
    <span class="e-stword" :class="'e-' + glyph" :title="tip">{{ stateText }}</span>
    <template v-if="shown && height > 0">
      <span class="e-sep" aria-hidden="true">·</span>
      <span class="e-tipwrap" tabindex="0" :aria-describedby="uid + '-gap'">
        <span class="e-h" translate="no">{{ num(height) }}<HeightMeter :behind="behind" bare /></span>
        <span :id="uid + '-gap'" class="e-tip" role="tooltip">{{ gapText }}</span>
      </span>
    </template>
    <template v-if="shown && blockTime">
      <span class="e-sep" aria-hidden="true">·</span>
      <span :title="exact">{{ $t('msg.modern.settings.node_last_block', { age }) }}</span>
    </template>
    <template v-if="glyph == 'down' && why">
      <span class="e-sep" aria-hidden="true">·</span>
      <span>{{ why }}</span>
    </template>
    <template v-if="versionOld">
      <span class="e-sep" aria-hidden="true">·</span>
      <span class="e-srv-old">{{ $t('msg.mynodes.version_old', { min: minVersion }) }}</span>
    </template>
  </p>
</template>

<script>
  import { computed, ref, watch, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue';
  import { useStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import HeightMeter from '@/components/modern/ui/HeightMeter.vue';
  import { nodeBadge, nodeBadgeText } from '@/components/modern/nodeBadge';
  import { relativeAge, exactTime, heightMeter } from '@/shared/nodeTip';
  import { compareVersions, MIN_NODE_VERSION } from '@/shared/nodeVersion';

  //the "N s ago" text is refreshed this often without any request
  const TICK_MS = 15000;
  let seq = 0;

  export default {
    name: 'NodeStatus',
    components: { HeightMeter },
    props: {
      id: { type: String, default: '' },
    },
    //glyph: the node's state for the field ('ok' | 'sync' | 'down' | 'busy')
    emits: ['glyph'],
    setup(props, { emit }) {
      const store = useStore();
      const { t, locale } = useI18n();
      const self = getCurrentInstance();
      const uid = 'e-noderow-' + (++seq);
      const num = (n) => Number(n).toLocaleString(locale.value);
      const status = computed(() => store.state.nodeStatus || {});
      const badge = computed(() => nodeBadge(store.state.nodeStatus, store.state.nodeProblem));
      const glyph = computed(() => ({ online: 'ok', syncing: 'sync', offline: 'down' }[badge.value.state] || 'busy'));
      const tip = computed(() => nodeBadgeText(badge.value, t));
      const why = computed(() => (badge.value.why ? t('msg.modern.' + badge.value.why, { code: badge.value.code }) : ''));
      const stateText = computed(() => ({
        online: t('msg.mynodes.state_online'), syncing: t('msg.mynodes.state_syncing'), offline: t('msg.mynodes.state_offline'),
      }[badge.value.state] || t('msg.mynodes.checking')));
      //details only while the node answers
      const shown = computed(() => !status.value.error && !!status.value.tip);
      const version = computed(() => {
        const ua = String(status.value.user_agent || '');
        const m = ua.match(/(\d+\.\d+\.\d+[^\s]*)/);
        return m ? m[1] : ua;
      });
      const versionOld = computed(() => !!version.value && compareVersions(version.value, MIN_NODE_VERSION) < 0);
      const height = computed(() => (status.value.tip && status.value.tip.height) || 0);
      //blocks below the network tip, null when the tip (the public node list) is unknown
      const behind = computed(() => {
        const net = Number(status.value.network_height) || 0;
        return net > 0 && height.value > 0 ? Math.max(0, net - height.value) : null;
      });
      const gapText = computed(() => {
        const m = heightMeter(behind.value);
        if (m.level === 'unknown') return t('msg.mynodes.height_unknown');
        if (m.level === 'level') return t('msg.mynodes.height_level');
        return t('msg.mynodes.height_behind', { n: num(behind.value) });
      });

      watch(glyph, (g) => emit('glyph', g), { immediate: true });

      const blockTime = ref(0);
      const now = ref(Date.now());
      const age = computed(() => relativeAge(now.value - blockTime.value, locale.value));
      const exact = computed(() => exactTime(blockTime.value, locale.value));
      let alive = true;
      let timer = null;
      let asked = 0;
      const ask = async () => {
        const h = height.value;
        const nodeService = self.proxy.$nodeService;
        if (!shown.value || !h || !nodeService || typeof nodeService.lastBlockTime !== 'function' || asked === h) return;
        asked = h;
        const ms = await nodeService.lastBlockTime(h);
        if (alive && ms && asked === h) {
          blockTime.value = ms;
          now.value = Date.now();
        }
      };
      watch([height, shown], ask);
      onMounted(() => {
        ask();
        timer = setInterval(() => { now.value = Date.now(); }, TICK_MS);
      });
      onBeforeUnmount(() => {
        alive = false;
        if (timer) clearInterval(timer);
      });
      return { uid, glyph, tip, why, stateText, shown, version, versionOld, minVersion: MIN_NODE_VERSION, height, behind, gapText, num,
        blockTime, age, exact };
    },
  };
</script>
