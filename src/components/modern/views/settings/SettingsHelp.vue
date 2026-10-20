<template>
  <SettingsFrame>
    <section v-if="hasSupport" class="e-set-group" aria-labelledby="stg-sup-h">
      <h2 id="stg-sup-h">{{ $t(SUPPORT + 'entry_title') }}</h2>
      <button type="button" class="e-btn" @click="openSupport"><EIcon name="bug" />{{ $t(SUPPORT + 'open') }}</button>
    </section>

    <section class="e-set-group" aria-labelledby="stg-hp-h">
      <h2 id="stg-hp-h">{{ $t('msg.modern.settings.help') }}</h2>
      <p class="e-stg-lede e-hlp-lede">{{ ui.lede }}</p>

      <form class="e-stg-search" role="search" @submit.prevent>
        <label class="e-label" for="stg-help-q">{{ ui.search_label }}</label>
        <div class="e-input-wrap">
          <input id="stg-help-q" ref="search" class="e-input" type="search" autocomplete="off" spellcheck="false" :placeholder="ui.search_placeholder" aria-describedby="stg-help-n stg-help-k" v-model="query" @keydown.esc.prevent="clearSearch" />
          <div class="e-trail">
            <button v-if="query" type="button" class="e-icon-btn" :aria-label="ui.clear" @click="clearSearch"><EIcon name="close" size="sm" /></button>
            <EIcon v-else name="search" size="sm" class="e-hlp-glass" />
          </div>
        </div>
        <p id="stg-help-k" class="e-help">{{ ui.search_keys }}</p>
        <p id="stg-help-n" class="e-help e-hlp-count" role="status">{{ statusText }}</p>
      </form>

      <div v-for="group in groups" :key="group.id" class="e-hlp-group">
        <h3 v-if="group.title" class="e-hlp-sec">{{ group.title }}</h3>
        <article v-for="t in group.topics" :key="t.id" :id="'help-' + t.id" class="e-hlp-topic" :class="{ 'e-is-open': isOpen(t) }">
          <h4 class="e-hlp-title" v-html="mark(t.title)"></h4>
          <p class="e-hlp-short" v-html="mark(t.short)"></p>
          <button type="button" class="e-hlp-more" :aria-expanded="isOpen(t) ? 'true' : 'false'" :aria-controls="'help-d-' + t.id" @click="toggle(t)"><EIcon name="chevr" size="sm" />{{ isOpen(t) ? ui.less : ui.more }}</button>
          <div v-show="isOpen(t)" :id="'help-d-' + t.id" class="e-hlp-body">
            <div v-html="markHtml(t.body)"></div>
            <HelpHandshake v-if="t.visual === 'handshake'" :labels="ui.handshake" :steps="ui.handshake.steps" btn-class="e-btn e-btn-sm" />
            <button v-if="t.id === 'getting-help' && hasSupport" type="button" class="e-btn e-btn-primary" @click="openSupport"><EIcon name="bug" />{{ $t(SUPPORT + 'open') }}</button>
          </div>
        </article>
      </div>
    </section>
  </SettingsFrame>
</template>

<script>
  /*
   * Settings › Help: task-based topics (src/help/topics_<lang>.js) in the app's language. Search
   * (src/help/search.js) filters as you type: the matching topics, best first, with the words marked;
   * a match in the detail opens the fold. Keys: / or Ctrl+F focuses the search, Esc clears it.
   * "Report a problem" opens the support dialog (the open-support event, feat/support-logs) where it exists.
   */
  import { useTopics, topicsFor } from '@/help/topics';
  import { searchTopics, queryWords, highlightText, highlightHtml, escapeHtml } from '@/help/search';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import HelpHandshake from '@/components/help/HelpHandshake.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';

  //msg.support.* come with the support flow (feat/support-logs); until it is merged the card and the button stay hidden
  const SUPPORT = 'msg.support.';

  export default {
    name: 'SettingsHelp',
    components: { EIcon, HelpHandshake, SettingsFrame },
    data() {
      return {
        SUPPORT,
        query: '',
        //topic id → opened (true) or closed (false) by hand; unset follows the search
        opened: {},
      };
    },
    computed: {
      helpData() {
        return useTopics((this.$i18n && this.$i18n.locale) || 'en');
      },
      ui() {
        return this.helpData.ui;
      },
      topics() {
        return topicsFor(this.helpData);
      },
      words() {
        return queryWords(this.query);
      },
      results() {
        return searchTopics(this.topics, this.query);
      },
      //browsing: the sections in order; searching: one list of matches, best first
      groups() {
        if (!this.words.length) {
          return this.helpData.sections.map(s => ({ id: s.id, title: s.title, topics: this.topics.filter(t => t.section === s.id) }));
        }
        return [{ id: 'results', title: '', topics: this.results.map(r => r.topic) }];
      },
      statusText() {
        if (!this.words.length) return '';
        return this.results.length ? this.ui.results.replace('{n}', this.results.length) : this.ui.no_results.replace('{q}', this.query.trim());
      },
      hasSupport() {
        return !!(this.$te && this.$te(SUPPORT + 'open'));
      },
    },
    watch: {
      query() {
        this.opened = {};
      },
      '$i18n.locale'() {
        this.opened = {};
      },
    },
    mounted() {
      window.addEventListener('keydown', this.onKey);
    },
    unmounted() {
      window.removeEventListener('keydown', this.onKey);
    },
    methods: {
      isOpen(t) {
        if (t.id in this.opened) return this.opened[t.id];
        const r = this.words.length && this.results.find(x => x.topic.id === t.id);
        return !!(r && r.inBody);
      },
      toggle(t) {
        this.opened = { ...this.opened, [t.id]: !this.isOpen(t) };
      },
      mark(text) {
        return this.words.length ? highlightText(text, this.words) : escapeHtml(text);
      },
      markHtml(html) {
        return highlightHtml(html, this.words);
      },
      clearSearch() {
        this.query = '';
        this.$refs.search && this.$refs.search.focus();
      },
      onKey(e) {
        const el = document.activeElement;
        const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 'f')) {
          if (!this.$refs.search) return;
          e.preventDefault();
          this.$refs.search.focus();
          this.$refs.search.select();
        }
      },
      openSupport() {
        this.emitter.emit('open-support');
      },
    },
  };
</script>

<style>
  .e-hlp-lede { margin: 0 0 var(--sp-4); }
  .e-stg-search .e-label { display: block; margin-bottom: var(--sp-2); }
  .e-stg-search input::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
  .e-stg-search .e-help { margin-top: var(--sp-2); }
  .e-hlp-glass { color: var(--faint); }
  .e-hlp-count:empty { display: none; }
  .e-hlp-group { display: flex; flex-direction: column; gap: var(--sp-2); max-width: 760px; }
  .e-hlp-group + .e-hlp-group { margin-top: var(--sp-6); }
  .e-hlp-sec { font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); margin: 0 0 var(--sp-1); }
  .e-hlp-topic { border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--s1); padding: var(--sp-3) var(--sp-4); }
  .e-hlp-topic.e-is-open { border-color: var(--line-strong); }
  .e-hlp-title { font-size: var(--fs-md); font-weight: 600; color: var(--text); margin: 0; }
  .e-hlp-short { color: var(--dim); margin: var(--sp-1) 0 0; max-width: 68ch; }
  .e-hlp-more { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; margin-top: var(--sp-1); padding: 0 6px 0 0; background: none; border: 0; border-radius: var(--r-sm); color: var(--accent-text); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
  .e-hlp-more:hover { text-decoration: underline; }
  .e-hlp-more .e-icon { transition: transform var(--dur) var(--ease); }
  .e-hlp-more[aria-expanded='true'] .e-icon { transform: rotate(90deg); }
  @media (prefers-reduced-motion: reduce) { .e-hlp-more .e-icon { transition: none; } }
  .e-hlp-body { color: var(--dim); max-width: 68ch; padding-top: var(--sp-2); }
  .e-hlp-body p, .e-hlp-body ul, .e-hlp-body ol { margin: 0 0 var(--sp-3); }
  .e-hlp-body ul, .e-hlp-body ol { padding-left: 1.25em; }
  .e-hlp-body ul { list-style: disc; }
  .e-hlp-body ol { list-style: decimal; }
  .e-hlp-body li + li { margin-top: var(--sp-1); }
  .e-hlp-body b { color: var(--text); font-weight: 600; }
  .e-hlp-body h5 { color: var(--text); font-size: var(--fs-md); font-weight: 600; margin: var(--sp-4) 0 var(--sp-1); }
  .e-hlp-body .hs { color: var(--text); }
  .e-hlp-topic mark { background: var(--accent-soft); color: var(--text); box-shadow: 0 0 0 1px var(--accent); border-radius: 2px; }
</style>
