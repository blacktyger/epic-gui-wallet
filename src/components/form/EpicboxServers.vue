<template>
  <!-- Public Epicbox servers and whether they are online (shared/epicboxDirectory.js), under the Epicbox server field.
       Picking one fills the field; typing your own server there still works. -->
  <div v-if="servers.length" class="field epicbox-servers">
    <label class="label" :for="uid">{{ $t('msg.epicboxdir.title') }}</label>
    <div class="control">
      <div class="select is-fullwidth">
        <select :id="uid" :value="selected ? selected.domain : ''" :disabled="disabled" :aria-describedby="uid + '-h'" @change="pick($event.target)">
          <option value="">{{ domain.trim() && !selected ? $t('msg.epicboxdir.custom') : $t('msg.epicboxdir.pick') }}</option>
          <option v-for="s in servers" :key="s.domain" :value="s.domain">{{ optionText(s) }}</option>
        </select>
      </div>
    </div>
    <p :id="uid + '-h'" class="help">
      <template v-if="selected"><span class="tag is-normal" :class="stateClass(selected)">{{ stateText(selected) }}</span>&nbsp;</template>
      {{ live ? $t('msg.epicboxdir.live_note') : $t('msg.epicboxdir.unknown_note') }}
    </p>
  </div>
</template>

<script>
  import { loadEpicboxServers, findServer } from '@/shared/epicboxDirectory';
  import { number, percent } from '@/shared/nodeDirectory';

  let seq = 0;

  export default {
    name: 'EpicboxServers',
    props: {
      //the domain in the Epicbox server field; the server with this domain is the selected one
      domain: { type: String, default: '' },
      //mainnet or floonet
      chain: { type: String, default: 'mainnet' },
      disabled: { type: Boolean, default: false },
    },
    emits: ['pick'],
    data() {
      return { uid: 'epicbox-servers-' + (++seq), servers: [], live: false };
    },
    computed: {
      selected() {
        return findServer(this.servers, this.domain);
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
      /* once when the field shows (the main process caches the status site for a minute) */
      async load() {
        const chain = this.chain;
        const res = await loadEpicboxServers(window.api, chain);
        if (this.gone || chain !== this.chain) return;
        this.servers = res.servers;
        this.live = res.live;
      },
      pick(el) {
        const s = this.servers.find((x) => x.domain === el.value);
        if (s) this.$emit('pick', s.domain);
        //the placeholder fills nothing: the select shows the field's server again
        else el.value = this.selected ? this.selected.domain : '';
      },
      stateText(s) {
        return this.$t('msg.epicboxdir.' + s.state);
      },
      stateClass(s) {
        return s.state === 'healthy' ? 'is-success' : s.state === 'down' ? 'is-danger' : s.state === 'degraded' ? 'is-warning' : 'is-light';
      },
      fmt(n) { return number(n, this.locale); },
      pct(f) { return percent(f, this.locale); },
      optionText(s) {
        const parts = [s.domain];
        if (s.operator) parts.push(s.operator);
        if (s.isDefault) parts.push(this.$t('msg.epicboxdir.default'));
        if (s.state !== 'unknown') parts.push(this.stateText(s));
        if (s.latencyMs !== null) parts.push(this.$t('msg.epicboxdir.latency_ms', { n: this.fmt(s.latencyMs) }));
        return parts.join(' · ');
      },
    },
  };
</script>

<style scoped>
  .epicbox-servers .help { overflow-wrap: anywhere; }
  .epicbox-servers .help .tag { height: 1.5em; vertical-align: baseline; }
</style>
