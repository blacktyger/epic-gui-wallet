<template>
  <!-- My nodes (shared/myNodes.js): saved node addresses with a label and a light live status.
       Shown only when it has entries. Use fills the address field; Save applies it, as before. -->
  <div v-if="nodes.length" class="field my-nodes">
    <label class="label" :id="uid + '-h'">{{ $t('msg.mynodes.title') }}</label>
    <ul class="my-nodes-list" :aria-labelledby="uid + '-h'">
      <li v-for="n in nodes" :key="n.address" class="my-nodes-row" :class="{ 'is-current': isCurrent(n) }">
        <template v-if="removing === n.address">
          <p class="my-nodes-ask" :id="uid + '-ask'">{{ $t('msg.mynodes.remove_ask', { name: nameOf(n) }) }}</p>
          <div class="buttons my-nodes-btns">
            <button ref="keep" type="button" class="button is-small" :disabled="disabled" @click="removing = ''">{{ $t('msg.mynodes.remove_keep') }}</button>
            <button type="button" class="button is-small is-danger is-outlined" :disabled="disabled" :aria-describedby="uid + '-ask'" @click="confirmRemove(n)">{{ $t('msg.mynodes.remove_yes') }}</button>
          </div>
        </template>
        <template v-else>
          <span class="my-nodes-main">
            <b v-if="n.label" class="my-nodes-label">{{ n.label }}</b>
            <code class="my-nodes-addr" translate="no">{{ n.address }}</code>
          </span>
          <span class="tags my-nodes-tags" :aria-label="statusLabel(n)">
            <template v-if="viewOf(n)">
              <span class="tag is-normal" :class="toneClass(viewOf(n))">{{ $t('msg.mynodes.state_' + viewOf(n).state) }}</span>
              <span v-if="viewOf(n).behind !== null" class="tag is-normal" :class="viewOf(n).behind === 0 ? 'is-success' : 'is-warning'">{{ lagText(viewOf(n)) }}</span>
              <span v-if="viewOf(n).ms !== null" class="tag is-normal is-light">{{ $t('msg.nodedir.latency_ms', { n: viewOf(n).ms }) }}</span>
            </template>
            <span v-else-if="checking.includes(n.address)" class="tag is-normal is-light">{{ $t('msg.mynodes.checking') }}</span>
          </span>
          <div class="buttons my-nodes-btns">
            <button type="button" class="button is-small is-primary is-outlined" :disabled="disabled || isCurrent(n)" :aria-label="$t('msg.mynodes.use_named', { name: nameOf(n) })" @click="$emit('use', n)">{{ isCurrent(n) ? $t('msg.mynodes.selected') : $t('msg.mynodes.use') }}</button>
            <button type="button" class="button is-small" :disabled="disabled" :aria-label="$t('msg.mynodes.edit_named', { name: nameOf(n) })" @click="$emit('edit', n)">{{ $t('msg.mynodes.edit') }}</button>
            <button type="button" class="button is-small" :disabled="disabled" :aria-label="$t('msg.mynodes.remove_named', { name: nameOf(n) })" @click="askRemove(n)">{{ $t('msg.mynodes.remove') }}</button>
          </div>
        </template>
      </li>
    </ul>
    <p class="help">{{ $t('msg.mynodes.use_hint') }}</p>
  </div>
</template>

<script>
  import { number } from '@/shared/nodeDirectory';
  import { nodeAddressKey } from '@/shared/nodeAddress';

  let seq = 0;

  /*
   * nodes: the list ({address, label}); views: {address: nodeCheck view} of the last checks;
   * checking: addresses being checked; current: the address in the field (that entry is marked).
   * Emits use(entry), edit(entry), remove(entry) (after the quiet confirm in its row).
   */
  export default {
    name: 'MyNodesList',
    props: {
      nodes: { type: Array, default: () => [] },
      views: { type: Object, default: () => ({}) },
      checking: { type: Array, default: () => [] },
      current: { type: String, default: '' },
      disabled: { type: Boolean, default: false },
    },
    emits: ['use', 'edit', 'remove'],
    data() {
      return { uid: 'my-nodes-' + (++seq), removing: '' };
    },
    computed: {
      locale() {
        return (this.$i18n && this.$i18n.locale) || 'en';
      },
      currentKey() {
        return nodeAddressKey(this.current);
      },
    },
    methods: {
      viewOf(n) {
        return this.views[n.address] || null;
      },
      isCurrent(n) {
        return !!this.currentKey && nodeAddressKey(n.address) === this.currentKey;
      },
      nameOf(n) {
        return n.label || n.address.replace(/^https?:\/\//, '');
      },
      toneClass(v) {
        return { ok: 'is-success', warn: 'is-warning', risk: 'is-danger' }[v.tone] || '';
      },
      lagText(v) {
        return v.behind === 0 ? this.$t('msg.nodedir.at_tip') : this.$t('msg.nodedir.behind', { n: number(v.behind, this.locale) });
      },
      /* the row's status in words, for a screen reader */
      statusLabel(n) {
        const v = this.viewOf(n);
        if (!v) return this.checking.includes(n.address) ? this.$t('msg.mynodes.checking') : null;
        const parts = [this.$t('msg.mynodes.state_' + v.state)];
        if (v.behind !== null) parts.push(this.lagText(v));
        if (v.ms !== null) parts.push(this.$t('msg.nodedir.latency_ms', { n: v.ms }));
        return parts.join(', ');
      },
      askRemove(n) {
        this.removing = n.address;
        //focus the safe choice, so Enter or Space twice never removes by accident
        this.$nextTick(() => { const k = this.$refs.keep; const el = Array.isArray(k) ? k[0] : k; if (el && el.focus) el.focus(); });
      },
      confirmRemove(n) {
        this.removing = '';
        this.$emit('remove', n);
      },
    },
  };
</script>

<style scoped>
  .my-nodes-list { border: 1px solid rgba(128, 128, 128, 0.3); border-radius: 4px; }
  .my-nodes-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.75rem; padding: 0.5rem 0.75rem; }
  .my-nodes-row + .my-nodes-row { border-top: 1px solid rgba(128, 128, 128, 0.25); }
  .my-nodes-row.is-current { box-shadow: inset 3px 0 0 hsl(171, 100%, 41%); }
  .my-nodes-main { flex: 1 1 14rem; min-width: 0; display: flex; flex-direction: column; }
  .my-nodes-label { overflow-wrap: anywhere; }
  .my-nodes-addr { background: none; padding: 0; font-size: 0.8125rem; color: inherit; opacity: 0.85; overflow-wrap: anywhere; }
  .my-nodes-tags { margin: 0; flex-wrap: wrap; }
  .my-nodes-tags .tag { margin-bottom: 0; }
  .my-nodes-btns { margin: 0 0 0 auto; flex-wrap: nowrap; }
  .my-nodes-btns .button { margin-bottom: 0; }
  .my-nodes-ask { flex: 1 1 14rem; overflow-wrap: anywhere; }
  @media (max-width: 560px) {
    .my-nodes-btns { margin-left: 0; flex-wrap: wrap; }
  }
</style>
