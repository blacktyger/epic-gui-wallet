<template>
  <!-- The live check of a typed or saved node address (shared/nodeCheck.js), under the field and in
       the Add to my nodes dialog. Never blocks typing or saving; nothing at all while idle. -->
  <div class="node-check" :class="{ 'is-idle': !view && phase !== 'checking' }" role="status" aria-live="polite" :aria-label="$t('msg.mynodes.status_label')">
    <template v-if="phase === 'checking'">
      <p class="help node-check-line" aria-hidden="true"><span class="loader node-check-spin"></span>{{ $t('msg.mynodes.checking') }}</p>
    </template>
    <template v-else-if="view">
      <div class="tags node-check-tags">
        <span class="tag is-normal" :class="toneClass">{{ stateText }}</span>
        <span v-if="view.behind !== null" class="tag is-normal" :class="view.behind === 0 ? 'is-success' : 'is-warning'">{{ lagText }}</span>
        <button v-if="!short" type="button" class="node-check-again" @click="$emit('recheck')">{{ $t('msg.mynodes.recheck') }}</button>
      </div>
      <p v-if="facts.length" class="help node-check-line">
        <span v-for="(f, i) in facts" :key="i">{{ i ? ' · ' : '' }}{{ f }}</span>
      </p>
      <p v-if="problemText && !short" class="help node-check-line">{{ problemText }}</p>
      <p v-if="hintText && !short" class="help node-check-line">{{ hintText }}</p>
    </template>
  </div>
</template>

<script>
  import { number } from '@/shared/nodeDirectory';

  /*
   * state: a nodeCheck.js checker state {phase, address, view}; short: the dialog's one line (state,
   * at tip, facts) without the explanation. Emits recheck.
   */
  export default {
    name: 'NodeCheckStatus',
    props: {
      state: { type: Object, default: () => ({ phase: 'idle', address: '', view: null }) },
      short: { type: Boolean, default: false },
    },
    emits: ['recheck'],
    computed: {
      phase() {
        return (this.state && this.state.phase) || 'idle';
      },
      view() {
        return this.phase === 'done' && this.state.view ? this.state.view : null;
      },
      locale() {
        return (this.$i18n && this.$i18n.locale) || 'en';
      },
      stateText() {
        return this.view ? this.$t('msg.mynodes.state_' + this.view.state) : '';
      },
      toneClass() {
        return { ok: 'is-success', warn: 'is-warning', risk: 'is-danger' }[this.view && this.view.tone] || '';
      },
      lagText() {
        const v = this.view;
        return v.behind === 0 ? this.$t('msg.nodedir.at_tip') : this.$t('msg.nodedir.behind', { n: number(v.behind, this.locale) });
      },
      facts() {
        const v = this.view;
        if (!v) return [];
        const t = (k, a) => this.$t('msg.nodedir.' + k, a);
        const out = [];
        if (v.version) out.push(t('version') + ' ' + v.version);
        if (v.height !== null) out.push(t('height') + ' ' + number(v.height, this.locale));
        if (v.peers !== null) out.push(t('peers_n', { n: number(v.peers, this.locale) }));
        if (v.ms !== null) out.push(this.$t('msg.mynodes.response', { ms: t('latency_ms', { n: number(v.ms, this.locale) }) }));
        return out;
      },
      problemText() {
        return this.view && this.view.problem ? this.$t('msg.mynodes.problem_' + this.view.problem) : '';
      },
      hintText() {
        return this.view && this.view.hint ? this.$t('msg.mynodes.hint_' + this.view.hint) : '';
      },
    },
  };
</script>

<style scoped>
  .node-check { margin-top: 0.5rem; }
  .node-check.is-idle { margin: 0; }
  .node-check-tags { margin-bottom: 0.25rem; align-items: center; }
  .node-check-tags .tag { margin-bottom: 0.25rem; }
  .node-check-line { margin-top: 0.125rem; overflow-wrap: anywhere; display: flex; flex-wrap: wrap; align-items: center; gap: 0 0.25rem; }
  .node-check-spin { display: inline-block; width: 0.875rem; height: 0.875rem; margin-inline-end: 0.375rem; }
  .node-check-again { background: none; border: 0; padding: 0 0 0.25rem; font: inherit; font-size: 0.75rem; color: inherit; text-decoration: underline; cursor: pointer; }
</style>
