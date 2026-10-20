<template>
  <!-- Get help / Report a problem (docs/support/DESIGN.md): one short screen. The description, an
       optional contact and the logs are sealed together for the developer; "Show what's sent" shows
       the cleaned content. Opened from anywhere, locked or not, by the 'open-support' event (Help
       page, unlock screen, Help menu). Nothing is sent without a click on Send. -->
  <div class="modal support-modal" :class="{ 'is-active': isOpen }" role="dialog" aria-modal="true" aria-labelledby="support-title" @keydown.esc="close">
    <div class="modal-background" @click="close"></div>
    <div class="modal-card">
      <header class="modal-card-head">
        <p id="support-title" ref="heading" tabindex="-1" class="modal-card-title">{{ $t('msg.support.title') }}</p>
        <button type="button" class="delete" :aria-label="$t('msg.close')" :disabled="!!busy" @click="close"></button>
      </header>

      <section class="modal-card-body">
        <p v-if="done.kind" role="status">{{ done.kind === 'sent' ? $t('msg.support.sent') : $t('msg.support.saved', { path: done.path }) }}</p>
        <form v-else novalidate @submit.prevent="send">
          <div class="field">
            <label class="is-sr-only" for="support-desc">{{ $t('msg.support.description_label') }}</label>
            <textarea id="support-desc" ref="desc" class="textarea" rows="5" :maxlength="maxDescription" v-model="description"
              :placeholder="$t('msg.support.description_label')" :aria-invalid="descriptionMissing ? 'true' : null"></textarea>
            <p v-if="descriptionMissing" class="help is-danger" role="alert">{{ $t('msg.support.description_required') }}</p>
          </div>
          <div class="field">
            <label class="is-sr-only" for="support-contact">{{ $t('msg.support.contact_label') }}</label>
            <input id="support-contact" class="input" type="text" :maxlength="maxContact" autocomplete="off" spellcheck="false"
              :placeholder="$t('msg.support.contact_label')" v-model="contact" />
          </div>
          <div class="field">
            <label class="checkbox">
              <input type="checkbox" v-model="attachLogs" aria-describedby="support-attach-h" />
              {{ $t('msg.support.attach_label') }}
            </label>
            <p id="support-attach-h" class="help">{{ $t('msg.support.attach_note') }}</p>
          </div>

          <details class="support-show" @toggle="onToggle">
            <summary>{{ $t('msg.support.show') }}</summary>
            <p v-if="loading" role="status" class="help">{{ $t('msg.support.preparing') }}</p>
            <p v-else-if="previewFailed" class="help is-danger">{{ $t('msg.support.preview_failed') }}</p>
            <template v-else-if="preview">
              <blockquote v-if="shownDescription" class="support-quote">{{ shownDescription }}</blockquote>
              <ul class="support-list">
                <li v-if="contact.trim()">{{ contact.trim() }}</li>
                <li translate="no">{{ appLine }}</li>
              </ul>
              <details v-for="f in files" :key="f.name" class="support-file">
                <summary><span translate="no">{{ f.name }}</span> · {{ sizeOf(f.bytes) }}</summary>
                <pre class="support-pre" tabindex="0" translate="no">{{ f.text }}</pre>
              </details>
              <p class="mt-2"><a href="#" class="is-size-7" @click.prevent="openLogs">{{ $t('msg.support.open_logs') }}</a></p>
            </template>
          </details>

          <p v-if="error" class="notification is-danger is-light mt-4 mb-0" role="alert">{{ errorText }}</p>
        </form>
      </section>

      <footer class="modal-card-foot support-foot">
        <button v-if="done.kind" type="button" class="button is-primary" @click="close">{{ $t('msg.close') }}</button>
        <template v-else>
          <button type="button" class="button" :disabled="!!busy" @click="close">{{ $t('msg.cancel') }}</button>
          <button type="button" class="button" :class="{ 'is-loading': busy === 'save' }" :disabled="!!busy" @click="save">{{ $t('msg.support.save') }}</button>
          <button v-if="canSend" type="button" class="button is-primary" :class="{ 'is-loading': busy === 'send' }" :disabled="!!busy" @click="send">{{ $t('msg.support.send') }}</button>
        </template>
      </footer>
    </div>
  </div>
</template>

<script>
import { nextTick } from 'vue';
import { useStore } from '@/store';

const MAX_DESCRIPTION = 2000;
const MAX_CONTACT = 100;

export default {
  name: 'SupportReportModalBox',
  setup() {
    return { store: useStore() };
  },
  data() {
    return {
      isOpen: false,
      description: '',
      contact: '',
      attachLogs: true,
      descriptionMissing: false,
      //"Show what's sent" is open: its content follows what is typed
      showing: false,
      preview: null,
      loading: false,
      previewFailed: false,
      //sending needs the intake (main tells with every preview); saving always works
      canSend: false,
      //'' | 'send' | 'save'
      busy: '',
      error: '',
      done: { kind: '', path: '' },
      maxDescription: MAX_DESCRIPTION,
      maxContact: MAX_CONTACT,
    };
  },
  computed: {
    //the description as it will be sealed (cleaned in the main process like the logs)
    shownDescription() {
      return (this.preview && typeof this.preview.description === 'string' && this.preview.description) || this.description.trim();
    },
    files() {
      return (this.preview && this.preview.files) || [];
    },
    appLine() {
      const a = (this.preview && this.preview.app) || {};
      return this.$t('msg.support.app_line', { version: a.version || '?', system: [a.platform, a.release, a.arch].filter(Boolean).join(' ') });
    },
    errorText() {
      if (this.error === 'phrase') return this.$t('msg.support.phrase_refused');
      const known = ['offline', 'rate', 'too-big', 'server', 'write'];
      return this.$t('msg.support.err_' + (known.includes(this.error) ? this.error : 'server').replace('-', '_'));
    },
  },
  watch: {
    description() { this.refresh(); },
    attachLogs() { this.refresh(); },
  },
  mounted() {
    this.emitter.on('open-support', this.show);
  },
  beforeUnmount() {
    this.emitter.off('open-support', this.show);
    clearTimeout(this.refreshTimer);
  },
  methods: {
    async show() {
      //a finished report starts a new one; one being written stays as it was
      if (this.done.kind) this.reset();
      this.isOpen = true;
      this.focus('desc');
      //whether Send is offered: a preview without logs reads nothing
      try {
        const p = await window.support.preview({ attachLogs: false, ui: this.store.state.ui, lang: this.$i18n.locale });
        this.canSend = !!(p && p.canSend);
      } catch (e) {
        this.canSend = false;
      }
    },
    reset() {
      Object.assign(this, { description: '', contact: '', attachLogs: true, descriptionMissing: false, preview: null,
        previewFailed: false, error: '', done: { kind: '', path: '' } });
    },
    close() {
      if (this.busy) return;
      this.isOpen = false;
    },
    focus(ref) {
      nextTick(() => {
        const el = this.$refs[ref];
        if (el && el.focus) el.focus();
      });
    },
    onToggle(e) {
      this.showing = !!(e && e.target && e.target.open);
      if (this.showing) this.loadPreview();
    },
    //the open preview follows the typing, a moment after it stops
    refresh() {
      this.error = '';
      if (this.description.trim()) this.descriptionMissing = false;
      if (!this.showing) return;
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.loadPreview(), 400);
    },
    async loadPreview() {
      this.loading = !this.preview;
      this.previewFailed = false;
      try {
        const p = await window.support.preview({ attachLogs: this.attachLogs, ui: this.store.state.ui, lang: this.$i18n.locale,
          description: this.description });
        if (!p || !p.token) throw new Error('no preview');
        this.preview = p;
        this.canSend = !!p.canSend;
        return p;
      } catch (e) {
        this.preview = null;
        this.previewFailed = true;
        return null;
      } finally {
        this.loading = false;
      }
    },
    async send() {
      await this.run('send', (req) => window.support.send(req));
    },
    async save() {
      await this.run('save', (req) => window.support.save(req));
    },
    //one send or save at a time, always with a fresh preview of what is on the screen now
    async run(kind, call) {
      if (this.busy) return;
      if (!this.description.trim()) {
        this.descriptionMissing = true;
        this.focus('desc');
        return;
      }
      this.busy = kind;
      this.error = '';
      let r;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const p = await this.loadPreview();
          if (!p) { r = { ok: false, error: 'server' }; break; }
          if (p.phrase) { r = { ok: false, error: 'phrase' }; break; }
          r = await call({ token: p.token, description: this.description.trim(), contact: this.contact.trim() });
          if (!(r && r.error === 'expired')) break;
        }
      } catch (e) {
        r = { ok: false, error: 'server' };
      } finally {
        this.busy = '';
      }
      if (r && r.ok) {
        this.done = { kind: kind === 'send' ? 'sent' : 'saved', path: r.path || '' };
        this.focus('heading');
      } else if (!(r && r.canceled)) {
        this.error = (r && r.error) || 'server';
      }
    },
    openLogs() {
      window.support.openLogsFolder();
    },
    sizeOf(bytes) {
      return bytes < 1024 ? bytes + ' B' : Math.round(bytes / 1024) + ' KB';
    },
  },
};
</script>

<style scoped>
  .support-modal .modal-card { width: min(640px, calc(100vw - 32px)); }
  .support-show { margin-top: .75rem; }
  .support-show > summary { cursor: pointer; }
  .support-quote { white-space: pre-wrap; overflow-wrap: anywhere; border-left: 3px solid currentColor; padding-left: .75rem; margin: .5rem 0; opacity: .9; }
  .support-list { list-style: disc; margin-left: 1.25rem; overflow-wrap: anywhere; }
  .support-file { margin-top: .5rem; }
  .support-file summary { cursor: pointer; overflow-wrap: anywhere; }
  .support-pre { max-height: 40vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .75rem; margin-top: .5rem; }
  .support-foot { flex-wrap: wrap; gap: .5rem; justify-content: flex-end; }
  .support-foot .button { margin: 0; }
</style>
