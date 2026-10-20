<template>
  <!-- Get help / Report a problem (docs/support/DESIGN.md): write → review exactly what is sent →
       send, or save an encrypted file. Opened from anywhere, locked or not, by the 'open-support'
       event (Help page, unlock screen, Help menu). Nothing is sent without a click on Send. -->
  <div class="modal support-modal" :class="{ 'is-active': isOpen }" role="dialog" aria-modal="true" aria-labelledby="support-title" @keydown.esc="close">
    <div class="modal-background" @click="close"></div>
    <div class="modal-card">
      <header class="modal-card-head">
        <p id="support-title" ref="heading" tabindex="-1" class="modal-card-title">{{ heading }}</p>
        <button type="button" class="delete" :aria-label="$t('msg.support.close')" :disabled="!!busy" @click="close"></button>
      </header>

      <section class="modal-card-body">
        <!-- 1: write -->
        <form v-if="step === 'write'" novalidate @submit.prevent="review">
          <p class="mb-4">{{ $t('msg.support.lead') }}</p>
          <div class="field">
            <label class="label" for="support-desc">{{ $t('msg.support.description_label') }}</label>
            <div class="control">
              <textarea id="support-desc" ref="desc" class="textarea" rows="5" :maxlength="maxDescription" v-model="description"
                aria-describedby="support-desc-h support-desc-n" :aria-invalid="descriptionMissing ? 'true' : null"></textarea>
            </div>
            <p id="support-desc-h" class="help">{{ $t('msg.support.description_hint') }} <strong>{{ $t('msg.support.never_secrets') }}</strong></p>
            <p id="support-desc-n" class="help has-text-right" aria-live="polite">{{ $t('msg.support.description_counter', { n: description.length, max: maxDescription }) }}</p>
            <p v-if="descriptionMissing" class="help is-danger" role="alert">{{ $t('msg.support.description_required') }}</p>
          </div>
          <div class="field">
            <label class="label" for="support-contact">{{ $t('msg.support.contact_label') }}</label>
            <div class="control">
              <input id="support-contact" class="input" type="text" :maxlength="maxContact" autocomplete="off" spellcheck="false"
                :placeholder="$t('msg.support.contact_placeholder')" v-model="contact" aria-describedby="support-contact-h" />
            </div>
            <p id="support-contact-h" class="help">{{ $t('msg.support.contact_hint') }}</p>
          </div>
          <div class="field">
            <label class="checkbox">
              <input type="checkbox" v-model="attachLogs" aria-describedby="support-attach-h" />
              {{ $t('msg.support.attach_label') }}
            </label>
            <p id="support-attach-h" class="help">{{ $t('msg.support.attach_hint') }}</p>
          </div>
          <article class="message is-dark"><div class="message-body">{{ $t('msg.support.privacy') }}</div></article>
        </form>

        <!-- 2: review, exactly what will be sent -->
        <div v-else-if="step === 'review'">
          <p v-if="loading" role="status">{{ $t('msg.support.preparing') }}</p>
          <p v-else-if="previewFailed" class="notification is-danger is-light" role="alert">{{ $t('msg.support.preview_failed') }}</p>
          <p v-else-if="phrase" class="notification is-danger is-light" role="alert">{{ $t('msg.support.phrase_refused') }}</p>
          <template v-else-if="preview && !phrase">
            <h3 class="title is-6 mb-2">{{ $t('msg.support.public_label') }}</h3>
            <p class="help mb-2">{{ $t('msg.support.public_note') }}</p>
            <blockquote class="support-quote">{{ shownDescription }}</blockquote>

            <h3 class="title is-6 mt-4 mb-2">{{ $t('msg.support.private_label') }}</h3>
            <p class="help mb-2">{{ files.length ? $t('msg.support.private_note') : $t('msg.support.private_note_no_logs') }}</p>
            <ul class="support-list">
              <li>{{ contact.trim() || $t('msg.support.no_contact') }}</li>
              <li translate="no">{{ appLine }}</li>
              <li v-if="files.length">{{ $t('msg.support.files_count', files.length) }}<span v-if="removedLine"> · {{ removedLine }}</span></li>
            </ul>
            <details v-for="f in files" :key="f.name" class="support-file">
              <summary><span translate="no">{{ f.name }}</span> · {{ sizeOf(f.bytes) }}<span v-if="f.cut"> · {{ $t('msg.support.file_cut') }}</span></summary>
              <pre class="support-pre" tabindex="0" translate="no">{{ f.text }}</pre>
            </details>
            <p v-if="!canSend" class="notification is-warning is-light mt-4">{{ $t('msg.support.no_send') }}</p>
          </template>
          <p v-if="error" class="notification is-danger is-light mt-4" role="alert">{{ errorText }}</p>
        </div>

        <!-- 3: done -->
        <div v-else role="status">
          <p v-if="result.kind === 'sent'">{{ $t('msg.support.sent_text', { id: result.id }) }}</p>
          <p v-else>{{ $t('msg.support.saved_text', { path: result.path }) }}</p>
        </div>

        <p class="mt-4"><a href="#" class="is-size-7" @click.prevent="openLogs">{{ $t('msg.support.open_logs') }}</a></p>
      </section>

      <footer class="modal-card-foot support-foot">
        <template v-if="step === 'write'">
          <button type="button" class="button" @click="close">{{ $t('msg.cancel') }}</button>
          <button type="button" class="button is-primary" @click="review">{{ $t('msg.support.review') }}</button>
        </template>
        <template v-else-if="step === 'review'">
          <button type="button" class="button" :disabled="!!busy" @click="back">{{ $t('msg.support.back') }}</button>
          <button type="button" class="button" :class="{ 'is-loading': busy === 'save' }" :disabled="!ready || !!busy" @click="save">{{ $t('msg.support.save') }}</button>
          <button v-if="canSend" type="button" class="button is-primary" :class="{ 'is-loading': busy === 'send' }" :disabled="!ready || !!busy" @click="send">{{ $t('msg.support.send') }}</button>
        </template>
        <button v-else type="button" class="button is-primary" @click="close">{{ $t('msg.support.close') }}</button>
      </footer>
    </div>
  </div>
</template>

<script>
import { nextTick } from 'vue';
import { useStore } from '@/store';

const MAX_DESCRIPTION = 2000;
const MAX_CONTACT = 100;
const KINDS = ['paths', 'users', 'hosts', 'ips', 'addresses', 'secrets', 'phrases', 'blocks', 'hex'];

export default {
  name: 'SupportReportModalBox',
  setup() {
    return { store: useStore() };
  },
  data() {
    return {
      isOpen: false,
      //write | review | done
      step: 'write',
      description: '',
      contact: '',
      attachLogs: true,
      descriptionMissing: false,
      preview: null,
      loading: false,
      previewFailed: false,
      //'' | 'send' | 'save'
      busy: '',
      error: '',
      result: { kind: '', id: '', path: '' },
      maxDescription: MAX_DESCRIPTION,
      maxContact: MAX_CONTACT,
    };
  },
  computed: {
    heading() {
      if (this.step === 'review') return this.$t('msg.support.review_title');
      if (this.step === 'done') return this.$t(this.result.kind === 'sent' ? 'msg.support.sent_title' : 'msg.support.saved_title');
      return this.$t('msg.support.title');
    },
    //the description as it will be posted (cleaned in the main process like the logs)
    shownDescription() {
      return (this.preview && typeof this.preview.description === 'string' && this.preview.description) || this.description.trim();
    },
    files() {
      return (this.preview && this.preview.files) || [];
    },
    canSend() {
      return !!(this.preview && this.preview.canSend);
    },
    //the description looks like a recovery phrase: nothing can be sent or saved (checked again in main)
    phrase() {
      return !!(this.preview && this.preview.phrase);
    },
    ready() {
      return !!this.preview && !this.loading && !this.phrase;
    },
    appLine() {
      const a = (this.preview && this.preview.app) || {};
      return this.$t('msg.support.app_line', { version: a.version || '?', system: [a.platform, a.release, a.arch].filter(Boolean).join(' ') });
    },
    removedLine() {
      const c = (this.preview && this.preview.counts) || {};
      const kinds = KINDS.filter((k) => c[k] > 0).map((k) => this.$t('msg.support.kind_' + k));
      return kinds.length ? this.$t('msg.support.removed', { list: kinds.join(', ') }) : '';
    },
    errorText() {
      if (this.error === 'phrase') return this.$t('msg.support.phrase_refused');
      const known = ['offline', 'rate', 'too-big', 'server', 'no-endpoint', 'write', 'expired'];
      return this.$t('msg.support.err_' + (known.includes(this.error) ? this.error : 'server').replace('-', '_'));
    },
  },
  mounted() {
    this.emitter.on('open-support', this.show);
  },
  beforeUnmount() {
    this.emitter.off('open-support', this.show);
  },
  methods: {
    show() {
      //a finished report starts a new one; one being written stays as it was
      if (this.step === 'done') this.reset();
      this.isOpen = true;
      this.focus(this.step === 'write' ? 'desc' : 'heading');
    },
    reset() {
      Object.assign(this, { step: 'write', description: '', contact: '', attachLogs: true, descriptionMissing: false,
        preview: null, previewFailed: false, error: '', result: { kind: '', id: '', path: '' } });
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
    async review() {
      if (!this.description.trim()) {
        this.descriptionMissing = true;
        this.focus('desc');
        return;
      }
      this.descriptionMissing = false;
      this.step = 'review';
      this.error = '';
      this.focus('heading');
      await this.loadPreview();
    },
    async loadPreview() {
      this.loading = true;
      this.previewFailed = false;
      this.preview = null;
      try {
        this.preview = await window.support.preview({ attachLogs: this.attachLogs, ui: this.store.state.ui, lang: this.$i18n.locale,
          description: this.description });
        if (!this.preview || !this.preview.token) throw new Error('no preview');
      } catch (e) {
        this.preview = null;
        this.previewFailed = true;
      } finally {
        this.loading = false;
      }
    },
    back() {
      if (this.busy) return;
      this.step = 'write';
      this.error = '';
      this.focus('desc');
    },
    request() {
      return { token: this.preview.token, description: this.description.trim(), contact: this.contact.trim() };
    },
    async send() {
      await this.run('send', (req) => window.support.send(req), (r) => ({ kind: 'sent', id: r.id }));
    },
    async save() {
      await this.run('save', (req) => window.support.save(req), (r) => ({ kind: 'saved', path: r.path }));
    },
    //one send or save at a time; an expired preview is made again for the user to check
    async run(kind, call, done) {
      if (this.busy || !this.ready) return;
      this.busy = kind;
      this.error = '';
      let r;
      try {
        r = await call(this.request());
      } catch (e) {
        r = { ok: false, error: 'server' };
      } finally {
        this.busy = '';
      }
      if (r && r.ok) {
        this.result = Object.assign({ kind: '', id: '', path: '' }, done(r));
        this.step = 'done';
        this.focus('heading');
      } else if (r && r.canceled) {
        //the save dialog was closed: nothing happened
      } else if (r && r.error === 'expired') {
        await this.loadPreview();
        this.error = 'expired';
      } else {
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
  .support-modal .modal-card { width: min(720px, calc(100vw - 32px)); }
  .support-quote { white-space: pre-wrap; overflow-wrap: anywhere; border-left: 3px solid currentColor; padding-left: .75rem; opacity: .9; }
  .support-list { list-style: disc; margin-left: 1.25rem; overflow-wrap: anywhere; }
  .support-file { margin-top: .5rem; }
  .support-file summary { cursor: pointer; overflow-wrap: anywhere; }
  .support-pre { max-height: 40vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .75rem; margin-top: .5rem; }
  .support-foot { flex-wrap: wrap; gap: .5rem; justify-content: flex-end; }
  .support-foot .button { margin: 0; }
</style>
