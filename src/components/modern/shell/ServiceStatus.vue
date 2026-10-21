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
  import { nodeBadge, nodeBadgeText } from '@/components/modern/nodeBadge';
  import { httpShown } from '@/shared/httpListener';
  import { torCardLine } from '@/shared/torUi';
  import epicboxSwitch from '@/components/modern/epicboxSwitch';

  let seq = 0;
  const GLYPH = { online: 'ok', syncing: 'sync', offline: 'down' };

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
        const t = (k, a) => this.$t(k, a);
        const b = nodeBadge(this.store.state.nodeStatus, this.store.state.nodeProblem);
        const s = this.store.state.nodeStatus || {};
        const internal = !!(this.store.state.user && this.store.state.user.nodeInternal);
        const addr = String(((this.configService && this.configService.config) || {}).check_node_api_http_addr || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const height = s.tip && s.tip.height > 0 && !s.error ? Number(s.tip.height).toLocaleString(this.$i18n.locale) : '';
        const lines = [[internal ? t('msg.modern.settings.node_builtin') : addr, height].filter(Boolean).join(' · ')];
        if (b.state != 'online') lines.push(nodeBadgeText(b, t));
        return {
          key: 'node', name: t('msg.modern.svc_node'), to: { path: '/settings', hash: '#node' }, open: t('msg.modern.svc_open_node'),
          glyph: GLYPH[b.state] || 'busy',
          word: { online: t('msg.mynodes.state_online'), syncing: t('msg.mynodes.state_syncing'), offline: t('msg.mynodes.state_offline') }[b.state] || t('msg.modern.eb_connecting'),
          lines: lines.filter(Boolean),
        };
      },
      receiving() {
        const t = (k, a) => this.$t(k, a);
        const h = this.ebHealth;
        //HTTP only while its listener runs, "failed" when it couldn't start (shared/httpListener.js)
        const http = httpShown(this.store.state.httpListener);
        const epicLine = h.state == 'off' ? t('msg.modern.svc_epicbox_off')
          : t('msg.modern.svc_epicbox_line', { server: h.server || this.ebDomain, state: t('msg.modern.eb_' + h.state) + (h.why ? ' (' + t('msg.modern.eb_why_' + h.why) + ')' : '') });
        const httpLine = t(http == 'on' ? 'msg.modern.svc_http_on' : http == 'failed' ? 'msg.modern.svc_http_failed_line' : 'msg.modern.svc_http_off');
        let glyph = { listening: 'ok', connecting: 'sync', down: 'down', off: 'off' }[h.state];
        let word = t('msg.modern.eb_' + h.state);
        if (h.state == 'listening') word = t('msg.modern.svc_on');
        if (h.state == 'off' && http == 'on') { glyph = 'ok'; word = t('msg.modern.svc_http_only_word'); }
        if (h.state == 'listening' && http == 'failed') glyph = 'sync';
        if (this.store.state.listenerStarting && h.state == 'off') { glyph = 'sync'; word = t('msg.modern.eb_connecting'); }
        //Tor: one more line, only while it is on
        const tor = torCardLine(this.store.state.tor, t);
        const lines = tor ? [epicLine, httpLine, tor] : [epicLine, httpLine];
        return {
          key: 'rcv', name: t('msg.modern.svc_receiving'), to: { path: '/settings/receiving', hash: '#epicbox' }, open: t('msg.modern.svc_open_epicbox'),
          glyph, word, lines,
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
