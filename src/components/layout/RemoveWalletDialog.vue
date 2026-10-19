<template>
  <!-- Remove a wallet (Classic): the three choices (components/removalPlan.js) on a native modal
       <dialog>, so the page behind is inert and focus stays inside; Esc closes unless removing -->
  <dialog ref="dlg" class="rm-dialog" aria-labelledby="rmTitle" aria-describedby="rmLead" @cancel.prevent="close" @click="onBackdrop">
    <div class="modal-card">
      <header class="modal-card-head"><p id="rmTitle" class="modal-card-title">{{ $t('msg.removal.title', [name]) }}</p></header>
      <section class="modal-card-body">
        <p id="rmLead">{{ $t('msg.removal.lead') }}</p>
        <p class="help" role="status">{{ removeStatus }}</p>

        <fieldset class="rm-choices" :disabled="removeBusy">
          <legend class="label">{{ $t('msg.removal.legend') }}</legend>
          <div v-for="c in removeChoices" :key="c.mode" class="rm-choice" :class="{ 'is-disabled': c.disabled }">
            <label class="radio">
              <input type="radio" name="rm-mode" :value="c.mode" v-model="removeMode" :disabled="c.disabled" :aria-describedby="'rm-h-' + c.mode + (c.reason ? ' rm-r-' + c.mode : '')" />
              <b>{{ c.label }}</b>
            </label>
            <p :id="'rm-h-' + c.mode" class="help rm-path">{{ c.hint }}</p>
            <p v-if="c.reason" :id="'rm-r-' + c.mode" class="help is-danger rm-path">{{ c.reason }}</p>
          </div>
        </fieldset>

        <div v-if="removeMode === 'everything'" class="rm-confirm">
          <article class="message is-danger"><div class="message-body">
            <p><b>{{ $t('msg.removal.danger_title') }}</b></p>
            <p>{{ $t('msg.removal.danger_text') }}</p>
          </div></article>
          <div class="field">
            <label class="label" for="rmName">{{ $t('msg.removal.type_label', [name]) }}</label>
            <div class="control"><input id="rmName" class="input" type="text" v-model="removeTyped" autocomplete="off" spellcheck="false" translate="no" :disabled="removeBusy" :aria-invalid="removeNameWrong ? 'true' : null" :aria-describedby="removeNameWrong ? 'rmNameErr' : null" /></div>
            <p v-if="removeNameWrong" id="rmNameErr" class="help">{{ $t('msg.removal.type_mismatch') }}</p>
          </div>
          <label class="checkbox"><input type="checkbox" v-model="removeAck" :disabled="removeBusy" /> {{ $t('msg.removal.ack') }}</label>
        </div>
      </section>
      <footer class="modal-card-foot">
        <button type="button" class="button" :disabled="removeBusy" @click="close">{{ $t('msg.cancel') }}</button>
        <button type="button" class="button is-danger" :class="{ 'is-loading': removeBusy }" :disabled="!removeReady" @click="confirmRemoval">{{ removeButton }}</button>
      </footer>
    </div>
  </dialog>
</template>

<script>
import { removalDialog } from '@/components/removalPlan';

/*
 * wallet: the record to remove; name: what it is called (walletName); folderMissing: its data
 * folder is gone (Unlock), so removing everything is not offered. Emits close, and done(result)
 * after a removal ran.
 */
export default {
  name: 'RemoveWalletDialog',
  mixins: [removalDialog],
  props: {
    wallet: { type: Object, required: true },
    name: { type: String, default: '' },
    folderMissing: { type: Boolean, default: false },
  },
  emits: ['close', 'done'],
  mounted() {
    const d = this.$refs.dlg;
    if (d && d.showModal && !d.open) d.showModal();
    this.openRemoval(this.wallet, { name: this.name, folderMissing: this.folderMissing });
  },
  beforeUnmount() {
    const d = this.$refs.dlg;
    if (d && d.open) d.close();
  },
  methods: {
    close() {
      if (this.removeBusy) return;
      this.closeRemoval();
      this.$emit('close');
    },
    onBackdrop(e) {
      if (e.target === this.$refs.dlg) this.close();
    },
    removalDone(result) {
      this.$emit('done', result);
    },
  },
};
</script>

<style scoped>
.rm-dialog { padding: 0; border: 0; background: transparent; width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: visible; }
.rm-dialog::backdrop { background: rgba(10, 10, 10, 0.86); }
.rm-dialog .modal-card { width: 100%; max-height: calc(100vh - 32px); margin: 0; }
.rm-dialog .modal-card-title { flex-shrink: 1; overflow-wrap: anywhere; }
.rm-dialog .modal-card-foot { flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
.rm-dialog .modal-card-foot .button { margin: 0; }
.rm-choices { border: 0; margin: 1rem 0 0; padding: 0; min-width: 0; }
.rm-choice { padding: 0.5rem 0; }
.rm-choice + .rm-choice { border-top: 1px solid rgba(128, 128, 128, 0.25); }
.rm-choice.is-disabled b { opacity: 0.6; }
.rm-choice .radio { display: flex; gap: 0.5rem; align-items: flex-start; }
.rm-choice .radio input { margin-top: 0.3rem; flex: none; }
.rm-path { overflow-wrap: anywhere; margin-left: 1.5rem; }
.rm-confirm { margin-top: 1rem; }
.rm-confirm .checkbox { display: flex; gap: 0.5rem; align-items: center; min-height: 44px; }
</style>
