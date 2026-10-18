<template>
  <header class="e-topbar">
    <h1>{{ $t('msg.modern.send.file_fin_title') }}</h1>
  </header>

  <div class="e-content e-content-narrow">
    <p class="e-notice e-file-note"><EIcon name="info" /><span>{{ $t('msg.modern.send.file_fin_note') }}</span></p>

    <div role="status">
      <p v-if="isSending" class="e-file-sending"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.modern.send.file_fin_sending') }}</p>
    </div>

    <!-- id="filebox" is what the global drop guard (mixin.js) lets a file be dropped on -->
    <div
      v-show="!isSent"
      id="filebox"
      class="e-drop e-rcv-drop e-file-drop"
      :class="{ 'e-is-over': isDragOver }"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="drop($event); isDragOver = false"
      @click="$refs.fileInput.click()"
    >
      <EIcon name="fileup" />
      <b>{{ $t('msg.modern.send.file_fin_drop') }}</b>
      <span class="e-small">{{ $t('msg.modern.send.file_fin_text') }}</span>
      <button type="button" class="e-btn"><EIcon name="folder" />{{ $t('msg.modern.send.file_choose') }}</button>
      <input ref="fileInput" type="file" class="e-sr-only" tabindex="-1" aria-hidden="true" @click.stop @change="drop($event); $event.target.value = ''" />
    </div>

    <div role="status">
      <div v-if="isSent" class="e-panel e-sent">
        <div class="e-glyph-sq e-ok e-lg"><EIcon name="check" size="lg" /></div>
        <h2>{{ $t('msg.modern.send.file_fin_done') }}</h2>
        <p class="e-dim">{{ $t('msg.modern.send.file_fin_done_text') }}</p>
        <div class="e-row e-file-actions">
          <router-link class="e-btn" to="/activity">{{ $t('msg.modern.send.file_fin_activity') }}</router-link>
          <button type="button" class="e-btn e-btn-primary" @click="clearup">{{ $t('msg.modern.send.file_fin_again') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import Finalize from '@/components/Finalize.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';

  export default reskin(Finalize, { components: { EIcon } });
</script>
