<template>
  <!-- Get help / Report a problem: the logic is SupportReportModalBox.vue's (both interfaces do the
       same); write → review exactly what is sent → send, or save an encrypted file. -->
  <EDialog
    class="e-sup-dialog"
    :open="isOpen"
    icon="help"
    :title="heading"
    :dismissible="!busy"
    @update:open="(v) => { if (!v) close(); }"
  >
    <div class="e-sup">
      <h3 ref="heading" tabindex="-1" class="e-sr-only">{{ heading }}</h3>

      <!-- 1: write -->
      <form v-if="step === 'write'" id="e-sup-form" novalidate @submit.prevent="review">
        <p class="e-sup-lead">{{ $t('msg.support.lead') }}</p>
        <div class="e-field">
          <label class="e-label" for="e-sup-desc">{{ $t('msg.support.description_label') }}</label>
          <textarea id="e-sup-desc" ref="desc" class="e-textarea" rows="5" :maxlength="maxDescription" v-model="description"
            aria-describedby="e-sup-desc-h e-sup-desc-n" :aria-invalid="descriptionMissing ? 'true' : null"></textarea>
          <div class="e-sup-row">
            <p id="e-sup-desc-h" class="e-help">{{ $t('msg.support.description_hint') }} <b>{{ $t('msg.support.never_secrets') }}</b></p>
            <p id="e-sup-desc-n" class="e-help e-mono e-sup-count" aria-live="polite">{{ $t('msg.support.description_counter', { n: description.length, max: maxDescription }) }}</p>
          </div>
          <p v-if="descriptionMissing" class="e-error-msg" role="alert">{{ $t('msg.support.description_required') }}</p>
        </div>
        <div class="e-field">
          <label class="e-label" for="e-sup-contact">{{ $t('msg.support.contact_label') }}</label>
          <input id="e-sup-contact" class="e-input" type="text" :maxlength="maxContact" autocomplete="off" spellcheck="false"
            :placeholder="$t('msg.support.contact_placeholder')" v-model="contact" aria-describedby="e-sup-contact-h" />
          <p id="e-sup-contact-h" class="e-help">{{ $t('msg.support.contact_hint') }}</p>
        </div>
        <label class="e-switch e-sup-switch" for="e-sup-attach">
          <input id="e-sup-attach" type="checkbox" v-model="attachLogs" aria-describedby="e-sup-attach-h" />
          <span class="e-track"></span>
          <span><b>{{ $t('msg.support.attach_label') }}</b><span id="e-sup-attach-h" class="e-help">{{ $t('msg.support.attach_hint') }}</span></span>
        </label>
        <div class="e-notice e-sup-privacy"><EIcon name="lock" size="sm" /><p>{{ $t('msg.support.privacy') }}</p></div>
      </form>

      <!-- 2: review, exactly what will be sent -->
      <div v-else-if="step === 'review'">
        <p v-if="loading" class="e-sup-wait" role="status"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.support.preparing') }}</p>
        <div v-else-if="previewFailed" class="e-notice e-risk" role="alert"><p>{{ $t('msg.support.preview_failed') }}</p></div>
        <div v-else-if="phrase" class="e-notice e-risk" role="alert"><p>{{ $t('msg.support.phrase_refused') }}</p></div>
        <template v-else-if="preview">
          <section class="e-sup-part" aria-labelledby="e-sup-pub">
            <h4 id="e-sup-pub"><EIcon name="lockopen" size="sm" />{{ $t('msg.support.public_label') }}</h4>
            <p class="e-help">{{ $t('msg.support.public_note') }}</p>
            <blockquote class="e-sup-quote">{{ shownDescription }}</blockquote>
          </section>
          <section class="e-sup-part" aria-labelledby="e-sup-priv">
            <h4 id="e-sup-priv"><EIcon name="lock" size="sm" />{{ $t('msg.support.private_label') }}</h4>
            <p class="e-help">{{ files.length ? $t('msg.support.private_note') : $t('msg.support.private_note_no_logs') }}</p>
            <ul class="e-sup-list">
              <li>{{ contact.trim() || $t('msg.support.no_contact') }}</li>
              <li translate="no">{{ appLine }}</li>
              <li v-if="files.length">{{ $t('msg.support.files_count', files.length) }}<span v-if="removedLine" class="e-faint"> · {{ removedLine }}</span></li>
            </ul>
            <details v-for="f in files" :key="f.name" class="e-sup-file">
              <summary><span class="e-mono" translate="no">{{ f.name }}</span> <span class="e-faint">· {{ sizeOf(f.bytes) }}<span v-if="f.cut"> · {{ $t('msg.support.file_cut') }}</span></span></summary>
              <pre class="e-sup-pre" tabindex="0" translate="no">{{ f.text }}</pre>
            </details>
          </section>
          <div v-if="!canSend" class="e-notice e-warn"><p>{{ $t('msg.support.no_send') }}</p></div>
        </template>
        <div v-if="error" class="e-notice e-risk e-sup-err" role="alert"><p>{{ errorText }}</p></div>
      </div>

      <!-- 3: done -->
      <div v-else class="e-notice e-ok" role="status">
        <p v-if="result.kind === 'sent'">{{ $t('msg.support.sent_text', { id: result.id }) }}</p>
        <p v-else>{{ $t('msg.support.saved_text', { path: result.path }) }}</p>
      </div>

      <button type="button" class="e-link-btn e-sup-logs" @click="openLogs"><EIcon name="folder" size="sm" />{{ $t('msg.support.open_logs') }}</button>
    </div>

    <template #foot>
      <template v-if="step === 'write'">
        <button type="button" class="e-btn e-btn-ghost" @click="close">{{ $t('msg.cancel') }}</button>
        <button type="button" class="e-btn" @click="review">{{ $t('msg.support.review') }}</button>
      </template>
      <template v-else-if="step === 'review'">
        <button type="button" class="e-btn e-btn-ghost" :disabled="!!busy" @click="back">{{ $t('msg.support.back') }}</button>
        <button type="button" class="e-btn" :class="canSend ? 'e-btn-ghost' : null" :disabled="!ready || !!busy" :aria-busy="busy === 'save' ? 'true' : null" @click="save">
          <span v-if="busy === 'save'" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="download" />{{ busy === 'save' ? $t('msg.support.saving') : $t('msg.support.save') }}
        </button>
        <button v-if="canSend" type="button" class="e-btn" :disabled="!ready || !!busy" :aria-busy="busy === 'send' ? 'true' : null" @click="send">
          <span v-if="busy === 'send'" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="send" />{{ busy === 'send' ? $t('msg.support.sending') : $t('msg.support.send') }}
        </button>
      </template>
      <button v-else type="button" class="e-btn" @click="close">{{ $t('msg.support.close') }}</button>
    </template>
  </EDialog>
</template>

<script>
  import SupportReportModalBox from '@/components/layout/SupportReportModalBox.vue';
  import { reskin } from '@/components/modern/reskin';
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';

  export default reskin(SupportReportModalBox, {
    components: { EDialog, EIcon },
  });
</script>

<style>
  /* wider than a confirm dialog: it shows log text; three buttons wrap instead of overflowing */
  dialog.e-dialog.e-sup-dialog { width: min(640px, calc(100vw - 48px)); }
  .e-sup-dialog .e-dialog-foot { flex-wrap: wrap; }
  .e-sup { display: grid; gap: 14px; min-width: 0; }
  .e-sup > div, .e-sup > form { display: grid; gap: 14px; min-width: 0; }
  .e-sup-switch { align-items: flex-start; }
  .e-sup-switch .e-track { margin-top: 2px; }
  .e-sup-switch b { display: block; font-weight: 600; }
  .e-sup-lead { margin: 0; }
  .e-sup .e-field { margin: 0; }
  .e-sup-row { display: flex; gap: 12px; justify-content: space-between; align-items: baseline; }
  .e-sup-count { flex: none; }
  .e-sup-privacy { display: flex; gap: 10px; align-items: flex-start; }
  .e-sup-privacy p { margin: 0; }
  .e-sup-wait { display: flex; gap: 10px; align-items: center; }
  .e-sup-part { display: grid; gap: 6px; }
  .e-sup-part h4 { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 0.95rem; }
  .e-sup-quote { margin: 0; padding: 8px 12px; border-inline-start: 3px solid var(--accent); white-space: pre-wrap; overflow-wrap: anywhere; opacity: 0.9; }
  .e-sup-list { margin: 0; padding-inline-start: 1.2em; overflow-wrap: anywhere; }
  .e-sup-file summary { cursor: pointer; overflow-wrap: anywhere; padding: 4px 0; }
  .e-sup-pre { max-height: 38vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.75rem; line-height: 1.45; margin: 6px 0 0; padding: 10px; border-radius: var(--r-sm); background: var(--s2); border: 1px solid var(--line); }
  .e-sup-logs { justify-self: start; display: inline-flex; gap: 6px; align-items: center; }
  .e-sup-err p, .e-sup .e-notice p { margin: 0; }
</style>
