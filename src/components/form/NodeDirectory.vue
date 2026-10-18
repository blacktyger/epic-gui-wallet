<template>
  <!-- Public nodes from status.btlabs.uk. Renders nothing until the list has arrived, and nothing at all when it can't be had. -->
  <div v-if="nodes.length" class="field node-directory">
    <label class="label" :for="uid">{{ $t('msg.nodedir.title') }} <span class="node-directory-source">{{ $t('msg.nodedir.source') }}</span></label>
    <div class="control">
      <div class="select is-fullwidth">
        <select :id="uid" :value="selected ? selected.endpoint : ''" :disabled="disabled" @change="pick($event.target)">
          <option value="">{{ address.trim() && !selected ? $t('msg.nodedir.custom') : $t('msg.nodedir.pick') }}</option>
          <option v-for="n in nodes" :key="n.endpoint" :value="n.endpoint">{{ optionText(n) }}</option>
        </select>
      </div>
    </div>
    <div v-if="selected" class="node-directory-summary" :aria-label="$t('msg.nodedir.summary', { host: selected.host })" role="group">
      <div class="tags">
        <span class="tag is-normal" :class="stateClass(selected)">{{ stateText(selected) }}</span>
        <span v-if="selected.tipLag !== null" class="tag is-normal" :class="selected.tipLag === 0 ? 'is-success' : 'is-warning'">{{ lagText(selected) }}</span>
      </div>
      <p class="help">
        <span v-for="(f, i) in facts(selected)" :key="i">{{ i ? ' · ' : '' }}{{ f }}</span>
      </p>
      <p class="help">
        {{ $t('msg.nodedir.latency_note') }}
        <a :href="pageUrl(selected)" @click.prevent="openPage(selected)">{{ $t('msg.nodedir.more') }}&nbsp;<mdicon name="open-in-new" size="12" /></a>
      </p>
    </div>
  </div>
</template>

<script>
  import { loadDirectory, findNode, nodePageUrl, number, percent, flag, countryName } from '@/shared/nodeDirectory';

  let seq = 0;

  export default {
    name: 'NodeDirectory',
    props: {
      //the address in the node field; the node with this address is the selected one
      address: { type: String, default: '' },
      //mainnet or floonet; anything else shows nothing
      chain: { type: String, default: 'mainnet' },
      disabled: { type: Boolean, default: false },
    },
    emits: ['pick'],
    data() {
      return { uid: 'node-directory-' + (++seq), dir: null };
    },
    computed: {
      nodes() {
        return this.dir ? this.dir.nodes : [];
      },
      selected() {
        return findNode(this.dir, this.address);
      },
      locale() {
        return (this.$i18n && this.$i18n.locale) || 'en';
      },
    },
    watch: {
      chain() { this.load(); },
    },
    mounted() {
      this.load();
    },
    beforeUnmount() {
      this.gone = true;
    },
    methods: {
      async load() {
        const chain = this.chain;
        const dir = await loadDirectory(window.api, chain);
        if (!this.gone && chain === this.chain) this.dir = dir;
      },
      pick(el) {
        const n = this.nodes.find((x) => x.endpoint === el.value);
        if (n) this.$emit('pick', n.endpoint);
        //the placeholder fills nothing: the select shows the address field's node again
        else el.value = this.selected ? this.selected.endpoint : '';
      },
      stateText(n) {
        if (n.awaitingPeers) return this.$t('msg.nodedir.waiting_peers');
        return n.state === 'healthy' ? this.$t('msg.nodedir.online') : this.$t('msg.nodedir.degraded');
      },
      stateClass(n) {
        return n.state === 'healthy' && !n.awaitingPeers ? 'is-success' : 'is-warning';
      },
      lagText(n) {
        return n.tipLag === 0 ? this.$t('msg.nodedir.at_tip') : this.$t('msg.nodedir.behind', { n: number(n.tipLag, this.locale) });
      },
      optionText(n) {
        const parts = [n.host];
        if (n.operator) parts.push(n.operator);
        if (n.state !== 'healthy' || n.awaitingPeers) parts.push(this.stateText(n));
        if (n.tipLag !== null) parts.push(this.lagText(n));
        if (n.latencyMs !== null) parts.push(this.$t('msg.nodedir.latency_ms', { n: n.latencyMs }));
        return parts.join(' · ');
      },
      facts(n) {
        const t = (k, v) => this.$t('msg.nodedir.' + k, v);
        const out = [];
        if (n.height !== null) out.push(t('height') + ' ' + number(n.height, this.locale));
        if (n.version) out.push(t('version') + ' ' + n.version);
        if (n.peers !== null) out.push(t('peers_n', { n: number(n.peers, this.locale) }));
        if (n.latencyMs !== null) out.push(t('latency') + ' ' + t('latency_ms', { n: n.latencyMs }));
        if (n.country) out.push((flag(n.country) + ' ' + countryName(n.country, this.locale)).trim());
        const up = [];
        if (n.uptime24h !== null) up.push(t('uptime_24h', { p: percent(n.uptime24h, this.locale) }));
        if (n.uptime30d !== null) up.push(t('uptime_30d', { p: percent(n.uptime30d, this.locale) }));
        if (up.length) out.push(t('uptime') + ' ' + up.join(', '));
        return out;
      },
      pageUrl(n) {
        return nodePageUrl(this.chain, n.id);
      },
      openPage(n) {
        try { window.openlink.open(this.pageUrl(n)); } catch (e) { /* nothing to show */ }
      },
    },
  };
</script>

<style scoped>
  .node-directory-source { font-weight: normal; font-size: 0.75rem; opacity: 0.7; margin-left: 0.25rem; }
  .node-directory-summary { margin-top: 0.5rem; }
  .node-directory-summary .tags { margin-bottom: 0.25rem; }
  .node-directory-summary .tags .tag { margin-bottom: 0.25rem; }
  .node-directory-summary .help { margin-top: 0.125rem; overflow-wrap: anywhere; }
</style>
