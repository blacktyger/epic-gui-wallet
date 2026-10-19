<template>
  <!-- Remove a wallet (Modern): the Classic dialog's logic (components/removalPlan.js) in an EDialog -->
  <EDialog
    class="e-rm-dialog"
    :open="!!removeTarget"
    role="alertdialog"
    icon="trash"
    tone="risk"
    :dismissible="!removeBusy"
    :title="$t('msg.removal.title', [name])"
    :description="$t('msg.removal.lead')"
    @update:open="(v) => { if (!v) close(); }"
  >
    <p class="e-help e-rm-checking" role="status"><span v-if="!removePlan" class="e-spinner" aria-hidden="true"></span>{{ removeStatus }}</p>
    <fieldset class="e-wpick e-rm-choices" :disabled="removeBusy">
      <legend class="e-label">{{ $t('msg.removal.legend') }}</legend>
      <div class="e-wpick-list">
        <label v-for="c in removeChoices" :key="c.mode" :class="{ 'e-rm-off': c.disabled, 'e-rm-danger': c.mode === 'everything' }">
          <input type="radio" name="e-rm-mode" :value="c.mode" v-model="removeMode" :disabled="c.disabled" :aria-describedby="'e-rm-h-' + c.mode + (c.reason ? ' e-rm-r-' + c.mode : '')" />
          <span class="e-dot" aria-hidden="true"></span>
          <span class="e-wpick-text">
            <span class="e-wpick-name">{{ c.label }}</span>
            <small :id="'e-rm-h-' + c.mode" class="e-rm-hint">{{ c.hint }}</small>
            <small v-if="c.reason" :id="'e-rm-r-' + c.mode" class="e-rm-reason"><EIcon name="info" size="sm" /><span>{{ c.reason }}</span></small>
          </span>
        </label>
      </div>
    </fieldset>

    <div v-if="removeMode === 'everything'" class="e-rm-confirm">
      <div class="e-notice e-risk">
        <EIcon name="alertc" />
        <div><b>{{ $t('msg.removal.danger_title') }}</b><p>{{ $t('msg.removal.danger_text') }}</p></div>
      </div>
      <div class="e-field">
        <label class="e-label" for="e-rm-name">{{ $t('msg.removal.type_label', [name]) }}</label>
        <input id="e-rm-name" class="e-input" type="text" v-model="removeTyped" autocomplete="off" spellcheck="false" translate="no" :disabled="removeBusy" :aria-invalid="removeNameWrong ? 'true' : null" :aria-describedby="removeNameWrong ? 'e-rm-name-e' : null" />
        <p v-if="removeNameWrong" id="e-rm-name-e" class="e-help">{{ $t('msg.removal.type_mismatch') }}</p>
      </div>
      <label class="e-onb-check">
        <input type="checkbox" v-model="removeAck" :disabled="removeBusy" />
        <span>{{ $t('msg.removal.ack') }}</span>
      </label>
    </div>

    <template #foot>
      <button type="button" class="e-btn e-btn-ghost" :disabled="removeBusy" @click="close">{{ $t('msg.cancel') }}</button>
      <button type="button" class="e-btn e-btn-danger" :disabled="!removeReady" :aria-busy="removeBusy ? 'true' : null" @click="confirmRemoval">
        <span v-if="removeBusy" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="trash" />{{ removeButton }}
      </button>
    </template>
  </EDialog>
</template>

<script>
  import Classic from '@/components/layout/RemoveWalletDialog.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import EDialog from '@/components/modern/ui/EDialog.vue';

  export default reskin(Classic, {
    components: { EIcon, EDialog },
  });
</script>
