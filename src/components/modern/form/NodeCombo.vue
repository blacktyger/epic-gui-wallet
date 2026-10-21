<template>
  <!-- Settings › Node: the node as one combobox field (mockups direction 2). The list under it has My nodes
       first, then the public nodes (status.btlabs.uk), the built-in node last; a typed address is checked
       live and shown first. ☆ keeps an address in My nodes. A pick (or Enter on a typed address) is
       applied at once by the page (Settings.vue save: the node check, the chain data offer, the restart).
       The logic is the node field's (form/nodeserverField.vue + myNodesField.js). -->
  <div ref="root" class="e-combo-wrap" @focusout="onFocusOut" @keydown.esc="escape">
    <div class="e-combo" :class="{ 'e-is-open': expanded, 'e-is-bad': !!errors.nodeaddress }">
      <span class="e-st" :class="'e-' + fieldGlyph" aria-hidden="true"></span>
      <input
        :id="inputId"
        ref="field"
        class="e-combo-in"
        type="text"
        spellcheck="false"
        autocomplete="off"
        translate="no"
        data-test="node-combo"
        aria-autocomplete="list"
        :aria-expanded="expanded ? 'true' : 'false'"
        :aria-controls="uid + '-list'"
        :aria-invalid="errors.nodeaddress ? 'true' : null"
        :aria-describedby="describedby"
        :placeholder="$t('msg.modern.settings.node_find')"
        :disabled="busy"
        :value="shownText"
        @focus="openList"
        @click="openList"
        @input="typed($event.target.value)"
        @paste="pasted = true"
        @keydown.enter.prevent="enterPick"
        @keydown.down.prevent="moveInto(0)"
      />
      <span v-if="!editing && savedOperator" class="e-combo-op" translate="no">{{ savedOperator }}</span>
      <span v-if="busy" class="e-spinner e-combo-spin" role="status" :aria-label="$t('msg.modern.settings.saving')"></span>
      <button v-else type="button" class="e-combo-chev" tabindex="-1" :aria-label="$t('msg.modern.settings.node_list')" @click="toggleList"><EIcon name="chevd" size="sm" /></button>
    </div>

    <div v-show="expanded" :id="uid + '-list'" ref="list" class="e-combo-list" role="group" data-test="node-list" :aria-label="$t('msg.modern.settings.node_list')" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)">
      <!-- the typed address, checked live -->
      <template v-if="typedShown">
        <div class="e-opt" :class="{ 'e-is-on': isCurrent(typedAddr) }">
          <button type="button" class="e-opt-pick" :aria-label="$t('msg.modern.settings.node_use', { node: typedAddr }) + ', ' + typedWord" @click="pick(typedAddr)"></button>
          <span class="e-st" :class="'e-' + typedGlyph" aria-hidden="true"></span>
          <span class="e-opt-name">
            <span class="e-stword" :class="'e-' + typedGlyph">{{ typedWord }}</span>
            <span v-if="check.view && check.view.height !== null" class="e-h" translate="no">{{ fmt(check.view.height) }}<HeightMeter :behind="check.view.behind" /></span>
            <span v-if="check.view && check.view.version" class="e-opt-op" translate="no" :class="{ 'e-srv-old': check.view.versionOld }">{{ check.view.versionOld ? $t('msg.mynodes.version_old', { min: minVersion }) : check.view.version }}</span>
          </span>
          <span></span>
          <button v-if="myNodesReady && !inMyNodes" type="button" class="e-opt-trail e-icon-btn" :aria-label="$t('msg.mynodes.add')" :title="$t('msg.mynodes.add')" @click="openAddMyNode"><EIcon name="staro" size="sm" /></button>
          <span v-else class="e-opt-trail"></span>
        </div>
        <p class="e-combo-note">{{ typedProblem || $t('msg.modern.settings.node_typed_note') }}</p>
      </template>

      <template v-if="mine.length">
        <div class="e-combo-grp" aria-hidden="true">{{ $t('msg.mynodes.title') }}</div>
        <div v-for="n in mine" :key="n.address" class="e-opt" :class="{ 'e-is-on': isCurrent(n.address) }">
          <button type="button" class="e-opt-pick" :aria-label="$t('msg.modern.settings.node_use', { node: n.label || n.address })" :aria-current="isCurrent(n.address) ? 'true' : null" @click="pick(n.address)"></button>
          <span class="e-st" :class="'e-' + viewGlyph(myNodeViews[n.address], myNodesChecking.includes(n.address))" aria-hidden="true"></span>
          <span class="e-opt-name"><span class="e-srv-host" translate="no">{{ hostOf(n.address) }}</span><span v-if="n.label" class="e-opt-op" translate="no">{{ n.label }}</span></span>
          <span class="e-h" translate="no"><template v-if="myNodeViews[n.address] && myNodeViews[n.address].height !== null">{{ fmt(myNodeViews[n.address].height) }}<HeightMeter :behind="myNodeViews[n.address].behind" /></template></span>
          <span class="e-opt-acts">
            <button type="button" class="e-icon-btn" :aria-label="$t('msg.mynodes.edit_named', { name: n.label || n.address })" :title="$t('msg.mynodes.edit')" @click="openEditMyNode(n)"><EIcon name="pencil" size="sm" /></button>
            <button type="button" class="e-icon-btn" aria-pressed="true" :aria-label="$t('msg.modern.settings.node_remove_mine', { node: n.label || n.address })" :title="$t('msg.modern.settings.node_remove_mine', { node: n.label || n.address })" @click="removeMyNode(n)"><EIcon name="star" size="sm" /></button>
          </span>
        </div>
      </template>

      <template v-if="publicNodes.length">
        <div class="e-combo-grp" aria-hidden="true">{{ $t('msg.nodedir.title') }}</div>
        <div v-for="n in publicNodes" :key="n.endpoint" class="e-opt" :class="{ 'e-is-on': isCurrent(n.endpoint) }" :title="facts(n)">
          <button type="button" class="e-opt-pick" :aria-label="$t('msg.modern.settings.node_use', { node: n.host }) + (n.operator ? ', ' + n.operator : '')" :aria-current="isCurrent(n.endpoint) ? 'true' : null" @click="pick(n.endpoint)"></button>
          <span class="e-st" :class="'e-' + publicGlyph(n)" aria-hidden="true"></span>
          <span class="e-opt-name">
            <span class="e-srv-host" translate="no">{{ n.host }}</span>
            <span v-if="isDefault(n.endpoint)" class="e-def">{{ $t('msg.modern.settings.default_label') }}</span>
            <span v-else-if="n.operator" class="e-opt-op" translate="no">{{ n.operator }}</span>
          </span>
          <span class="e-h" translate="no"><template v-if="n.height !== null">{{ fmt(n.height) }}<HeightMeter :behind="n.tipLag" /></template></span>
          <button v-if="myNodesReady && !inMine(n.endpoint)" type="button" class="e-opt-trail e-icon-btn" :aria-label="$t('msg.modern.settings.node_save_named', { node: n.host })" :title="$t('msg.mynodes.add')" @click="addPublicToMine(n)"><EIcon name="staro" size="sm" /></button>
          <span v-else class="e-opt-trail"><EIcon v-if="isCurrent(n.endpoint)" name="check" size="sm" /></span>
        </div>
      </template>
      <p v-else-if="!typedShown && !mine.length" class="e-combo-note">{{ dirLoading ? $t('msg.mynodes.checking') : $t('msg.modern.settings.node_none') }}</p>

      <template v-if="!q">
        <div class="e-combo-grp" aria-hidden="true">{{ $t('msg.modern.settings.node_grp_computer') }}</div>
        <div class="e-opt" :class="{ 'e-is-on': savedInternal }">
          <button type="button" class="e-opt-pick" data-test="node-use-builtin" :aria-label="$t('msg.modern.settings.node_builtin') + ', ' + $t('msg.modern.settings.node_builtin_hint')" :aria-current="savedInternal ? 'true' : null" @click="useBuiltin"></button>
          <EIcon name="monitor" size="sm" class="e-opt-pc" />
          <span class="e-opt-name"><span>{{ $t('msg.modern.settings.node_builtin') }}</span><span class="e-opt-op">{{ $t('msg.modern.settings.node_builtin_hint') }}</span></span>
          <span></span>
          <span class="e-opt-trail"><EIcon v-if="savedInternal" name="check" size="sm" /></span>
        </div>
      </template>
    </div>
    <p v-if="errors.nodeaddress" :id="uid + '-e'" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ errors.nodeaddress }}</span></p>
  </div>

  <MyNodeDialog
    v-if="myNodeDialog"
    :mode="myNodeDialog.mode"
    :initial-address="myNodeDialog.address"
    :initial-label="myNodeDialog.label"
    :was="myNodeDialog.was"
    :nodes="myNodes"
    :error="myNodeDialog.error"
    :probe="probe"
    :cache="checkCache"
    @save="saveMyNode"
    @close="myNodeDialog = null"
  />
</template>

<script>
  import Base from '@/components/form/nodeserverField.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import HeightMeter from '@/components/modern/ui/HeightMeter.vue';
  import MyNodeDialog from '@/components/modern/form/MyNodeDialog.vue';
  import { reskin } from '@/components/modern/reskin';
  import { loadDirectory, findNode, number, percent } from '@/shared/nodeDirectory';
  import { nodeFieldAddress } from '@/shared/nodeAddress';
  import { findMyNode } from '@/shared/myNodes';
  import { MIN_NODE_VERSION } from '@/shared/nodeVersion';
  let seq = 0;

  //something typed that may be an address: a dot or a colon, no spaces
  const ADDRESS_LIKE = /^[^\s]*[.:][^\s]*$/;

  export default reskin(Base, {
    name: 'ModernNodeCombo',
    components: { EIcon, HeightMeter, MyNodeDialog },
    props: {
      inputId: { type: String, default: '' },
      //the saved node: its address (remote) and whether the built-in node is in use
      savedAddress: { type: String, default: '' },
      savedInternal: { type: Boolean, default: false },
      //the page is saving a pick
      busy: { type: Boolean, default: false },
      describedby: { type: String, default: null },
      //the glyph of the node in use (the page's NodeStatus)
      currentGlyph: { type: String, default: 'busy' },
    },
    emits: ['apply'],
    data() {
      return { uid: 'e-nodecombo-' + (++seq), expanded: false, editing: false, query: '', publicDir: null, dirLoading: true, minVersion: MIN_NODE_VERSION };
    },
    computed: {
      q() {
        return this.editing ? this.query.trim().toLowerCase() : '';
      },
      shownText() {
        if (this.editing) return this.query;
        return this.savedInternal ? this.$t('msg.modern.settings.node_builtin') : this.hostOf(this.savedAddress);
      },
      savedListed() {
        return this.savedInternal ? null : findNode(this.publicDir, this.savedAddress);
      },
      savedOperator() {
        const mine = this.savedInternal ? null : findMyNode(this.myNodes, this.savedAddress);
        return (mine && mine.label) || (this.savedListed && this.savedListed.operator) || '';
      },
      //the glyph in the field: the node in use (nodeBadge.js), or the typed address's check
      fieldGlyph() {
        return this.editing && this.typedShown ? this.typedGlyph : this.currentGlyph;
      },
      publicNodes() {
        const nodes = this.publicDir ? this.publicDir.nodes : [];
        return this.q ? nodes.filter((n) => (n.host + ' ' + (n.operator || '')).toLowerCase().includes(this.q)) : nodes;
      },
      mine() {
        return this.q ? this.myNodes.filter((n) => (n.address + ' ' + (n.label || '')).toLowerCase().includes(this.q)) : this.myNodes;
      },
      typedAddr() {
        return this.editing ? this.query.trim() : '';
      },
      //a typed address that is not one of the listed nodes
      typedShown() {
        const a = this.typedAddr;
        return !!a && ADDRESS_LIKE.test(a) && !findNode(this.publicDir, a) && !findMyNode(this.myNodes, a);
      },
      typedGlyph() {
        return this.check.phase == 'checking' || !this.check.view ? 'busy' : this.viewGlyph(this.check.view);
      },
      typedWord() {
        if (this.check.phase == 'checking' || !this.check.view) return this.$t('msg.mynodes.checking');
        return this.$t('msg.mynodes.state_' + this.check.view.state);
      },
      typedProblem() {
        const v = this.check.phase == 'done' && this.check.view;
        return v && v.tone == 'risk' ? this.$t('msg.modern.settings.node_check_port') : '';
      },
      defaultAddr() {
        return nodeFieldAddress(this.configService.getNodeFallBack());
      },
      locale() {
        return (this.$i18n && this.$i18n.locale) || 'en';
      },
    },
    mounted() {
      this.loadPublic();
    },
    methods: {
      async loadPublic() {
        this.dirLoading = true;
        const dir = await loadDirectory(window.api, this.directoryChain, 4000);
        this.publicDir = dir;
        this.dirLoading = false;
        //the field's live check waits for the list (myNodesField.js)
        this.directoryLoaded(dir);
      },
      openList() {
        if (this.busy) return;
        if (!this.expanded) {
          this.expanded = true;
          if (this.errors) this.errors.nodeaddress = null;
          if (!this.publicDir && !this.dirLoading) this.loadPublic();
        }
      },
      toggleList() {
        if (this.expanded) this.collapse();
        else {
          this.openList();
          this.$refs.field.focus();
        }
      },
      /* back to showing the saved node; the field goes back to it too */
      collapse() {
        this.expanded = false;
        this.editing = false;
        this.query = '';
        this.select = this.savedInternal ? 'internal' : 'external';
        this.input = this.savedInternal ? '' : this.savedAddress;
      },
      escape(e) {
        if (!this.expanded || this.myNodeDialog) return;
        e.stopPropagation();
        this.collapse();
        this.$refs.field.focus();
      },
      onFocusOut(e) {
        const root = this.$refs.root;
        if (this.myNodeDialog || (root && e.relatedTarget && root.contains(e.relatedTarget))) return;
        setTimeout(() => {
          if (this.myNodeDialog || this.busy) return;
          if (root && !root.contains(document.activeElement)) this.collapse();
        }, 0);
      },
      typed(text) {
        this.editing = true;
        this.expanded = true;
        this.query = text;
        //the field's address is what is typed: the live check runs on it (myNodesField.js)
        this.select = 'external';
        this.input = text.trim();
        if (this.errors) this.errors.nodeaddress = null;
      },
      enterPick() {
        if (!this.expanded) { this.openList(); return; }
        if (this.typedShown) this.pick(this.typedAddr);
        else if (this.publicNodes.length + this.mine.length === 1) this.pick((this.mine[0] && this.mine[0].address) || this.publicNodes[0].endpoint);
      },
      /* arrow keys: from the field into the list, then up and down its rows */
      picks() {
        return this.$refs.list ? [...this.$refs.list.querySelectorAll('.e-opt-pick')] : [];
      },
      moveInto(i) {
        this.openList();
        this.$nextTick(() => { const p = this.picks(); if (p[i]) p[i].focus(); });
      },
      move(d) {
        const p = this.picks();
        const i = p.indexOf(document.activeElement);
        if (i < 0) return;
        if (i + d < 0) this.$refs.field.focus();
        else if (p[i + d]) p[i + d].focus();
      },
      pick(address) {
        if (this.busy) return;
        if (this.isCurrent(address)) { this.collapse(); return; }
        this.select = 'external';
        this.input = address;
        this.nodeserverFieldChanged();
        this.expanded = false;
        this.$refs.field.focus();
        this.$emit('apply');
      },
      useBuiltin() {
        if (this.busy) return;
        if (this.savedInternal) { this.collapse(); return; }
        this.select = 'internal';
        this.nodeserverFieldChanged();
        this.expanded = false;
        this.editing = false;
        this.$emit('apply');
      },
      /* after the page's save: the field shows the saved node again; failed: the typed text stays */
      done(ok) {
        if (ok || this.select == 'internal') {
          this.collapse();
          return;
        }
        this.editing = true;
        this.query = this.hostOf(this.input);
      },
      inMine(address) {
        return !!findMyNode(this.myNodes, address);
      },
      addPublicToMine(n) {
        this.myNodeDialog = { mode: 'add', address: n.endpoint, label: n.operator || '', was: '', error: '' };
      },
      isCurrent(address) {
        return !this.savedInternal && !!address && nodeFieldAddress(address) === nodeFieldAddress(this.savedAddress);
      },
      isDefault(address) {
        return nodeFieldAddress(address) === this.defaultAddr;
      },
      hostOf(address) {
        return String(address || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
      },
      viewGlyph(view, checking) {
        if (!view) return checking ? 'busy' : 'off';
        return view.tone == 'ok' ? 'ok' : view.tone == 'warn' ? 'sync' : 'down';
      },
      publicGlyph(n) {
        return n.state === 'healthy' && !n.awaitingPeers && (n.tipLag === null || n.tipLag <= 2) ? 'ok' : 'sync';
      },
      /* the details of a public node, in its tooltip only: response time and uptime (status.btlabs.uk) */
      facts(n) {
        const out = [];
        if (n.latencyMs !== null) out.push(this.$t('msg.nodedir.latency') + ' ' + this.$t('msg.nodedir.latency_ms', { n: n.latencyMs }));
        if (n.uptime30d !== null) out.push(this.$t('msg.nodedir.uptime') + ' ' + this.$t('msg.nodedir.uptime_30d', { p: percent(n.uptime30d, this.locale) }));
        return out.length ? out.join(' · ') + ' — ' + this.$t('msg.nodedir.latency_note') : null;
      },
      fmt(n) { return number(n, this.locale); },
    },
  });
</script>
