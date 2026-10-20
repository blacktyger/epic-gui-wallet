<template>
  <!-- Get help / Report a problem: the logic is SupportReportModalBox.vue's (both interfaces do the
       same); one short screen, the whole report sealed for the developer. -->
  <EDialog
    class="e-sup-dialog"
    :open="isOpen"
    :title="$t('msg.support.title')"
    :dismissible="!busy"
    @update:open="(v) => { if (!v) close(); }"
  >
    <div class="e-sup">
      <span ref="heading" tabindex="-1" class="e-sr-only">{{ $t('msg.support.title') }}</span>
      <p v-if="done.kind" class="e-sup-done" role="status"><EIcon name="check" size="sm" />{{ done.kind === 'sent' ? $t('msg.support.sent') : $t('msg.support.saved', { path: done.path }) }}</p>
      <form v-else class="e-sup-form" novalidate @submit.prevent="send">
        <div class="e-field">
          <label class="e-sr-only" for="e-sup-desc">{{ $t('msg.support.description_label') }}</label>
          <textarea id="e-sup-desc" ref="desc" class="e-textarea" rows="5" :maxlength="maxDescription" v-model="description"
            :placeholder="$t('msg.support.description_label')" :aria-invalid="descriptionMissing ? 'true' : null"></textarea>
          <p v-if="descriptionMissing" class="e-error-msg" role="alert">{{ $t('msg.support.description_required') }}</p>
        </div>
        <div class="e-field">
          <label class="e-sr-only" for="e-sup-contact">{{ $t('msg.support.contact_label') }}</label>
          <input id="e-sup-contact" class="e-input" type="text" :maxlength="maxContact" autocomplete="off" spellcheck="false"
            :placeholder="$t('msg.support.contact_label')" v-model="contact" />
        </div>
        <label class="e-switch e-sup-switch" for="e-sup-attach">
          <input id="e-sup-attach" type="checkbox" v-model="attachLogs" aria-describedby="e-sup-attach-h" />
          <span class="e-track"></span>
          <span><b>{{ $t('msg.support.attach_label') }}</b><span id="e-sup-attach-h" class="e-help"><EIcon name="lock" size="sm" />{{ $t('msg.support.attach_note') }}</span></span>
        </label>

        <details class="e-sup-show" @toggle="onToggle">
          <summary>{{ $t('msg.support.show') }}</summary>
          <p v-if="loading" class="e-sup-wait" role="status"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.support.preparing') }}</p>
          <p v-else-if="previewFailed" class="e-error-msg">{{ $t('msg.support.preview_failed') }}</p>
          <div v-else-if="preview" class="e-sup-content">
            <blockquote v-if="shownDescription" class="e-sup-quote">{{ shownDescription }}</blockquote>
            <ul class="e-sup-list">
              <li v-if="contact.trim()">{{ contact.trim() }}</li>
              <li translate="no">{{ appLine }}</li>
            </ul>
            <details v-for="f in files" :key="f.name" class="e-sup-file">
              <summary><span class="e-mono" translate="no">{{ f.name }}</span> <span class="e-faint">· {{ sizeOf(f.bytes) }}</span></summary>
              <pre class="e-sup-pre" tabindex="0" translate="no">{{ f.text }}</pre>
            </details>
            <button type="button" class="e-link-btn e-sup-logs" @click="openLogs"><EIcon name="folder" size="sm" />{{ $t('msg.support.open_logs') }}</button>
          </div>
        </details>

        <div v-if="error" class="e-notice e-risk e-sup-err" role="alert"><p>{{ errorText }}</p></div>
      </form>
    </div>

    <template #foot>
      <button v-if="done.kind" type="button" class="e-btn" @click="close">{{ $t('msg.close') }}</button>
      <template v-else>
        <button type="button" class="e-btn e-btn-ghost" :disabled="!!busy" @click="close">{{ $t('msg.cancel') }}</button>
        <button type="button" class="e-btn" :class="canSend ? 'e-btn-ghost' : null" :disabled="!!busy" :aria-busy="busy === 'save' ? 'true' : null" @click="save">
          <span v-if="busy === 'save'" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="download" />{{ $t('msg.support.save') }}
        </button>
        <button v-if="canSend" type="button" class="e-btn" :disabled="!!busy" :aria-busy="busy === 'send' ? 'true' : null" @click="send">
          <span v-if="busy === 'send'" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="send" />{{ $t('msg.support.send') }}
        </button>
      </template>
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
  /* wider than a confirm dialog: the preview shows log text; the buttons wrap instead of overflowing */
  dialog.e-dialog.e-sup-dialog { width: min(640px, calc(100vw - 48px)); }
  .e-sup-dialog .e-dialog-foot { flex-wrap: wrap; }
  .e-sup, .e-sup-form, .e-sup-content { display: grid; gap: 14px; min-width: 0; }
  .e-sup .e-field { margin: 0; }
  .e-sup-switch { align-items: flex-start; }
  .e-sup-switch .e-track { margin-top: 2px; }
  .e-sup-switch b { display: block; font-weight: 600; }
  .e-sup-switch .e-help { display: flex; gap: 6px; align-items: center; }
  .e-sup-done { display: flex; gap: 8px; align-items: center; margin: 0; }
  .e-sup-show > summary { cursor: pointer; font-weight: 600; padding: 4px 0; }
  .e-sup-show[open] > summary { margin-bottom: 10px; }
  .e-sup-wait { display: flex; gap: 10px; align-items: center; margin: 0; }
  .e-sup-quote { margin: 0; padding: 8px 12px; border-inline-start: 3px solid var(--accent); white-space: pre-wrap; overflow-wrap: anywhere; }
  .e-sup-list { margin: 0; padding-inline-start: 1.2em; overflow-wrap: anywhere; }
  .e-sup-file summary { cursor: pointer; overflow-wrap: anywhere; padding: 4px 0; }
  .e-sup-pre { max-height: 38vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.75rem; line-height: 1.45; margin: 6px 0 0; padding: 10px; border-radius: var(--r-sm); background: var(--s2); border: 1px solid var(--line); }
  .e-sup-logs { justify-self: start; display: inline-flex; gap: 6px; align-items: center; }
  .e-sup .e-notice p { margin: 0; }
</style>
