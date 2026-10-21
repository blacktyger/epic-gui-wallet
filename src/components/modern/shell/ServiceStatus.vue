<template>
  <!-- Connection status, sidebar option A: one row per service, the dot is the state (shape and colour)
       with one word; the details in a hover card; a click opens that service's Settings page. Nothing
       here is cut off at the 224 px sidebar: server names are only in the card. -->
  <div class="e-sbA">
    <div v-for="row in rows" :key="row.key" class="e-sbA-wrap" :class="{ 'e-is-dismissed': dismissed == row.key }" @keydown.esc="dismissed = row.key" @mouseenter="place($event)" @focusin="place($event)" @mouseleave="dismissed = ''" @focusout="dismissed = ''">
      <button type="button" class="e-sbA-row" :data-test="'svc-' + row.key" :aria-label="row.open + ': ' + row.word" :aria-describedby="uid + '-' + row.key" @click="go(row.to)">
        <span class="e-ico" :class="{ 'e-err': row.glyph == 'down' }" aria-hidden="true"><EIcon :name="row.icon" size="sm" /><span class="e-st" :class="'e-' + row.glyph"></span></span>
        <b>{{ row.name }}</b>
        <small :class="'e-' + row.glyph">{{ row.word }}</small>
      </button>
      <div :id="uid + '-' + row.key" class="e-hcard" role="tooltip" :style="cardAt">
        <div v-for="r in row.svc" :key="r.key" class="e-hcard-row" :data-test="'hc-' + r.key">
          <span class="e-ico" :class="{ 'e-err': r.err }" aria-hidden="true"><EIcon :name="r.icon" size="sm" /><span class="e-st" :class="'e-' + r.glyph"></span></span>
          <b>{{ r.label }}</b>
          <span class="e-hcard-val" :class="{ 'e-mono': r.mono }" translate="no">{{ r.hoverValue }}</span>
          <small v-for="(line, i) in r.tip" :key="i" translate="no">{{ line }}</small>
        </div>
        <small class="e-hcard-go">{{ row.open }}</small>
      </div>
    </div>
  </div>
</template>

<script>
  import { useStore } from '@/store';
  import { openSettingsSection } from '@/components/modern/settings/jump';
  import { nodeRow, receivingRow, serviceRows } from '@/components/modern/serviceRows';
  import epicboxSwitch from '@/components/modern/epicboxSwitch';
  import EIcon from '@/components/modern/ui/EIcon.vue';

  let seq = 0;

  export default {
    name: 'ServiceStatus',
    components: { EIcon },
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
      /* the service rows of the hover cards (modern/serviceRows.js), the Overview card's too */
      svc() {
        const st = this.store.state;
        const cfg = (this.configService && this.configService.config) || {};
        const addr = String(cfg.check_node_api_http_addr || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const t = (k, a) => this.$t(k, a);
        const node = nodeRow({ status: st.nodeStatus, problem: st.nodeProblem, internal: !!(st.user && st.user.nodeInternal), addr, locale: this.$i18n.locale }, t);
        const httpAddr = (st.direct && st.direct.httpAddr) || 'http://127.0.0.1:' + (this.configService && this.configService.walletListenerPort);
        return { node, rows: serviceRows({ node, health: this.ebHealth, domain: this.ebDomain, direct: st.direct, httpListener: st.httpListener, listenerStarting: st.listenerStarting, tor: st.tor, httpAddr }, t) };
      },
      node() {
        const row = this.svc.node;
        return { key: 'node', icon: 'svc-node', name: this.$t('msg.modern.svc_node'), to: { path: '/settings', hash: '#node' }, open: this.$t('msg.modern.svc_open_node'), glyph: row.glyph, word: row.word, svc: this.svc.rows.filter(r => r.key == 'node') };
      },
      receiving() {
        const st = this.store.state;
        const row = receivingRow({ health: this.ebHealth, domain: this.ebDomain, httpListener: st.httpListener, listenerStarting: st.listenerStarting, tor: st.tor }, (k, a) => this.$t(k, a));
        return {
          key: 'rcv', icon: 'svc-epicbox', name: this.$t('msg.modern.svc_receiving'), to: { path: '/settings/receiving', hash: '#epicbox' }, open: this.$t('msg.modern.svc_open_epicbox'),
          glyph: row.glyph, word: row.word, svc: this.svc.rows.filter(r => r.key != 'node'),
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
