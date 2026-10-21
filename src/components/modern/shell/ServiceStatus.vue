<template>
  <!-- Connection status, sidebar option A: one row per service, the dot is the state (shape and colour)
       with one word; the details in a hover card; a click opens that service's Settings page. Nothing
       here is cut off at the 224 px sidebar: server names are only in the card. -->
  <div class="e-sbA">
    <div v-for="row in rows" :key="row.key" class="e-sbA-wrap" :class="{ 'e-is-dismissed': dismissed == row.key }" @keydown.esc="dismissed = row.key" @mouseenter="place($event)" @focusin="place($event)" @mouseleave="dismissed = ''" @focusout="dismissed = ''">
      <button type="button" class="e-sbA-row" :data-test="'svc-' + row.key" :aria-label="row.open + ': ' + row.word" :aria-describedby="uid + '-' + row.key" @click="go(row.to)">
        <span class="e-st" :class="'e-' + row.glyph" aria-hidden="true"></span>
        <b>{{ row.name }}</b>
        <small :class="'e-' + row.glyph">{{ row.word }}</small>
      </button>
      <div :id="uid + '-' + row.key" class="e-hcard" role="tooltip" :style="cardAt">
        <span class="e-st" :class="'e-' + row.glyph" aria-hidden="true"></span>
        <b>{{ row.name }} · {{ row.word }}</b>
        <small v-for="(line, i) in row.lines" :key="i" translate="no">{{ line }}</small>
        <small class="e-hcard-go">{{ row.open }}</small>
      </div>
    </div>
  </div>
</template>

<script>
  import { useStore } from '@/store';
  import { openSettingsSection } from '@/components/modern/settings/jump';
  import { nodeRow, receivingRow } from '@/components/modern/serviceRows';
  import epicboxSwitch from '@/components/modern/epicboxSwitch';

  let seq = 0;

  export default {
    name: 'ServiceStatus',
    mixins: [epicboxSwitch],
    setup() {
      return { store: useStore() };
    },
    data() {
      //Esc hides that row's card until the pointer or the focus leaves (WCAG 1.4.13)
      //cardAt: where the card opens, next to its row (fixed: the sidebar scrolls, so it would clip it)
      return { uid: 'e-svc-' + (++seq), dismissed: '', cardAt: null };
    },
    computed: {
      node() {
        const internal = !!(this.store.state.user && this.store.state.user.nodeInternal);
        const addr = String(((this.configService && this.configService.config) || {}).check_node_api_http_addr || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const row = nodeRow({ status: this.store.state.nodeStatus, problem: this.store.state.nodeProblem, internal, addr, locale: this.$i18n.locale }, (k, a) => this.$t(k, a));
        return { key: 'node', name: this.$t('msg.modern.svc_node'), to: { path: '/settings', hash: '#node' }, open: this.$t('msg.modern.svc_open_node'), glyph: row.glyph, word: row.word, lines: row.lines };
      },
      receiving() {
        const st = this.store.state;
        const row = receivingRow({ health: this.ebHealth, domain: this.ebDomain, httpListener: st.httpListener, listenerStarting: st.listenerStarting, tor: st.tor }, (k, a) => this.$t(k, a));
        return {
          key: 'rcv', name: this.$t('msg.modern.svc_receiving'), to: { path: '/settings/receiving', hash: '#epicbox' }, open: this.$t('msg.modern.svc_open_epicbox'),
          glyph: row.glyph, word: row.word, lines: row.lines,
        };
      },
      rows() {
        return [this.node, this.receiving];
      },
    },
    methods: {
      place(e) {
        const r = e.currentTarget.getBoundingClientRect();
        this.cardAt = { left: Math.round(r.right + 10) + 'px', bottom: Math.max(8, Math.round(window.innerHeight - r.bottom)) + 'px' };
      },
      go(to) {
        openSettingsSection(this.$router, to);
      },
    },
  };
</script>
