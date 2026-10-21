<template>
  <!-- Settings › Receiving: the Epicbox server as one combobox field (mockups direction 2). The list has the
       public servers with their status (status.btlabs.uk); a domain typed in is offered first. A pick (or
       Enter on a typed domain) is saved at once by the page (modern/epicboxSwitch.js). -->
  <div ref="root" class="e-combo-wrap" @focusout="onFocusOut" @keydown.esc="escape">
    <div class="e-combo" :class="{ 'e-is-open': expanded }">
      <span class="e-st" :class="'e-' + fieldGlyph" aria-hidden="true"></span>
      <input
        :id="inputId"
        ref="field"
        class="e-combo-in"
        type="text"
        spellcheck="false"
        autocomplete="off"
        translate="no"
        data-test="epicbox-combo"
        aria-autocomplete="list"
        :aria-expanded="expanded ? 'true' : 'false'"
        :aria-controls="uid + '-list'"
        :aria-describedby="describedby"
        :placeholder="$t('msg.modern.settings.eb_find')"
        :disabled="busy"
        :value="editing ? query : current"
        @focus="open"
        @click="open"
        @input="typed($event.target.value)"
        @keydown.enter.prevent="enterPick"
        @keydown.down.prevent="moveInto(0)"
      />
      <span v-if="!editing && currentOperator" class="e-combo-op" translate="no">{{ currentOperator }}</span>
      <span v-if="busy" class="e-spinner e-combo-spin" role="status" :aria-label="$t('msg.modern.settings.eb_switching')"></span>
      <button v-else type="button" class="e-combo-chev" tabindex="-1" :aria-label="$t('msg.epicboxdir.title')" @click="toggle"><EIcon name="chevd" size="sm" /></button>
    </div>
    <div v-show="expanded" :id="uid + '-list'" ref="list" class="e-combo-list" role="group" data-test="epicbox-list" :aria-label="$t('msg.epicboxdir.title')" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)">
      <template v-if="typedDomain">
        <div class="e-opt">
          <button type="button" class="e-opt-pick" :aria-label="$t('msg.modern.settings.node_use', { node: typedDomain })" @click="pick(typedDomain)"></button>
          <span class="e-st e-off" aria-hidden="true"></span>
          <span class="e-opt-name"><span class="e-srv-host" translate="no">{{ typedDomain }}</span><span class="e-opt-op">{{ $t('msg.modern.settings.eb_unlisted') }}</span></span>
          <span></span>
          <span class="e-opt-trail"></span>
        </div>
        <p class="e-combo-note">{{ $t('msg.modern.settings.eb_typed_note') }}</p>
      </template>
      <div v-for="s in shown" :key="s.domain" class="e-opt" :class="{ 'e-is-on': s.domain === current }" :title="facts(s)">
        <button type="button" class="e-opt-pick" :aria-label="$t('msg.modern.settings.node_use', { node: s.domain }) + ', ' + stateWord(s)" :aria-current="s.domain === current ? 'true' : null" @click="pick(s.domain)"></button>
        <span class="e-st" :class="'e-' + glyph(s)" aria-hidden="true"></span>
        <span class="e-opt-name">
          <span class="e-srv-host" translate="no">{{ s.domain }}</span>
          <span v-if="s.state === 'down'" class="e-stword e-down">{{ stateWord(s) }}</span>
          <span v-else-if="s.isDefault" class="e-def">{{ $t('msg.modern.settings.default_label') }}</span>
          <span v-else-if="s.operator || s.label" class="e-opt-op" translate="no">{{ s.operator || s.label }}</span>
        </span>
        <span></span>
        <span class="e-opt-trail"><EIcon v-if="s.domain === current" name="check" size="sm" /></span>
      </div>
      <p class="e-combo-note">{{ live ? $t('msg.epicboxdir.live_note') : $t('msg.epicboxdir.unknown_note') }}</p>
    </div>
  </div>
</template>

<script>
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { cleanDomain, findServer } from '@/shared/epicboxDirectory';
  import { percent } from '@/shared/nodeDirectory';
  let seq = 0;

  export default {
    name: 'EpicboxCombo',
    components: { EIcon },
    props: {
      inputId: { type: String, default: '' },
      describedby: { type: String, default: null },
      //the public servers (epicboxDirectory.js) and whether their status is live
      servers: { type: Array, default: () => [] },
      live: { type: Boolean, default: false },
      //the saved server's domain and the glyph of our listener on it
      current: { type: String, default: '' },
      currentGlyph: { type: String, default: 'busy' },
      busy: { type: Boolean, default: false },
    },
    emits: ['pick'],
    data() {
      return { uid: 'e-ebcombo-' + (++seq), expanded: false, editing: false, query: '' };
    },
    computed: {
      q() {
        return this.editing ? this.query.trim().toLowerCase() : '';
      },
      shown() {
        return this.q ? this.servers.filter((s) => (s.domain + ' ' + (s.operator || '')).toLowerCase().includes(this.q)) : this.servers;
      },
      //a typed domain that isn't listed
      typedDomain() {
        const d = this.editing ? cleanDomain(this.query) : '';
        return d && !this.servers.some((s) => s.domain === d) ? d : '';
      },
      currentOperator() {
        const s = findServer(this.servers, this.current);
        return s ? (s.operator || s.label || '') : '';
      },
      fieldGlyph() {
        return this.editing && this.typedDomain ? 'off' : this.currentGlyph;
      },
    },
    methods: {
      open() {
        if (!this.busy) this.expanded = true;
      },
      toggle() {
        if (this.expanded) this.collapse();
        else {
          this.open();
          this.$refs.field.focus();
        }
      },
      collapse() {
        this.expanded = false;
        this.editing = false;
        this.query = '';
      },
      escape(e) {
        if (!this.expanded) return;
        e.stopPropagation();
        this.collapse();
        this.$refs.field.focus();
      },
      onFocusOut(e) {
        const root = this.$refs.root;
        if (root && e.relatedTarget && root.contains(e.relatedTarget)) return;
        setTimeout(() => {
          if (!this.busy && root && !root.contains(document.activeElement)) this.collapse();
        }, 0);
      },
      typed(text) {
        this.editing = true;
        this.expanded = true;
        this.query = text;
      },
      enterPick() {
        if (!this.expanded) { this.open(); return; }
        if (this.typedDomain) this.pick(this.typedDomain);
        else if (this.shown.length === 1) this.pick(this.shown[0].domain);
      },
      picks() {
        return this.$refs.list ? [...this.$refs.list.querySelectorAll('.e-opt-pick')] : [];
      },
      moveInto(i) {
        this.open();
        this.$nextTick(() => { const p = this.picks(); if (p[i]) p[i].focus(); });
      },
      move(d) {
        const p = this.picks();
        const i = p.indexOf(document.activeElement);
        if (i < 0) return;
        if (i + d < 0) this.$refs.field.focus();
        else if (p[i + d]) p[i + d].focus();
      },
      pick(domain) {
        if (this.busy) return;
        this.collapse();
        this.$refs.field.focus();
        if (domain !== this.current) this.$emit('pick', domain);
      },
      glyph(s) {
        return { healthy: 'ok', degraded: 'sync', down: 'down' }[s.state] || 'off';
      },
      stateWord(s) {
        return this.$t('msg.epicboxdir.' + s.state);
      },
      /* response time and uptime, in the row's tooltip only (status.btlabs.uk) */
      facts(s) {
        const locale = (this.$i18n && this.$i18n.locale) || 'en';
        const out = [];
        if (s.latencyMs !== null) out.push(this.$t('msg.nodedir.latency') + ' ' + this.$t('msg.epicboxdir.latency_ms', { n: s.latencyMs }));
        if (s.uptime24h !== null) out.push(this.$t('msg.nodedir.uptime') + ' ' + this.$t('msg.nodedir.uptime_24h', { p: percent(s.uptime24h, locale) }));
        return out.length ? out.join(' · ') + ' — ' + this.$t('msg.nodedir.latency_note') : null;
      },
    },
  };
</script>
