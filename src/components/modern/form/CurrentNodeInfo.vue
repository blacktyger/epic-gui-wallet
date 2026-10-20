<template>
  <!-- The saved node's details, read-only: the main views show only a status icon (nodeBadge.js).
       Status, version and height come from the status poll that already runs. The last block's time
       is asked (get_header) only while this is shown, once per new tip. -->
  <div class="e-nodeinfo" role="group" :aria-label="$t('msg.modern.settings.node_info')">
    <p class="e-nodeinfo-state" role="status" :title="tip"><EIcon :name="badge.icon" size="sm" :class="'e-' + badge.tone" />{{ stateText }}</p>
    <dl v-if="shown" class="e-nodeinfo-rows">
      <div v-if="version">
        <dt>{{ $t('msg.modern.settings.node_info_version') }}</dt>
        <dd class="e-num e-nodeinfo-version" :class="{ 'e-bad': versionOld }" translate="no">{{ version }}<template v-if="versionOld"> · {{ $t('msg.mynodes.version_old', { min: minVersion }) }}</template></dd>
      </div>
      <div v-if="height > 0">
        <dt>{{ $t('msg.modern.settings.node_info_height') }}</dt>
        <dd class="e-num" translate="no"><span class="e-nodeinfo-height">{{ num(height) }}<HeightMeter :behind="behind" /></span></dd>
      </div>
      <div v-if="blockTime">
        <dt>{{ $t('msg.modern.settings.node_info_block') }}</dt>
        <dd class="e-num" :title="exact">{{ age }}</dd>
      </div>
    </dl>
  </div>
</template>

<script>
  import { computed, ref, watch, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue';
  import { useStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import HeightMeter from '@/components/modern/ui/HeightMeter.vue';
  import { nodeBadge, nodeBadgeText } from '@/components/modern/nodeBadge';
  import { relativeAge, exactTime } from '@/shared/nodeTip';
  import { compareVersions, MIN_NODE_VERSION } from '@/shared/nodeVersion';

  //the "N s ago" text is refreshed this often without any request
  const TICK_MS = 15000;

  export default {
    name: 'CurrentNodeInfo',
    components: { EIcon, HeightMeter },
    setup() {
      const store = useStore();
      const { t, locale } = useI18n();
      const self = getCurrentInstance();
      const num = (n) => Number(n).toLocaleString(locale.value);
      const status = computed(() => store.state.nodeStatus || {});
      const badge = computed(() => nodeBadge(store.state.nodeStatus, store.state.nodeProblem));
      const tip = computed(() => nodeBadgeText(badge.value, t));
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
      return { badge, tip, stateText, shown, version, versionOld, minVersion: MIN_NODE_VERSION, height, behind, num, blockTime, age, exact };
    },
  };
</script>
