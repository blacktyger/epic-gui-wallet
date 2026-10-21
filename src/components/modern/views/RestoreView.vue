<template>
  <div>
    <!-- 1. the recovery phrase (mockup 15: paste, check, fix) -->
    <OnboFrame
      v-if="page === 'addSeeds'"
      :side="$t('msg.modern.unlock.side_restore')"
      :groups="groups('phrase')"
      :title="$t('msg.modern.unlock.restore_title')"
      :lead="$t('msg.modern.unlock.restore_lead')"
      focus-heading
    >
      <div v-if="invalidCount" class="e-notice e-risk">
        <EIcon name="alertc" />
        <div>
          <b>{{ $t('msg.modern.unlock.restore_bad_word', { n: firstInvalid + 1, word: slots[firstInvalid] }) }}</b>
          <p>{{ $t('msg.modern.unlock.restore_bad_more') }}</p>
        </div>
      </div>
      <div v-else-if="enoughSeeds" class="e-notice e-ok">
        <EIcon name="check" />
        <div><b>{{ $t('msg.modern.unlock.restore_ok_title', { n: length }) }}</b><p>{{ $t('msg.modern.unlock.restore_ok_hint') }}</p></div>
      </div>

      <div class="e-field e-rs-box">
        <div class="e-rs-head">
          <label class="e-label" for="restorePhrase">{{ $t('msg.restore.phrase') }}</label>
          <p class="restore-count e-rs-count" role="status" aria-live="polite">
            <span :class="{ 'e-risk': filled > length, 'e-ok': enoughSeeds }">{{ $t('msg.restore.word_count', [filled, length]) }}</span>
            <span v-if="invalidCount" class="e-risk"> · {{ $t('msg.restore.invalid_words', [invalidCount]) }}</span>
            <span v-else-if="filled > 0 && !validLengths.includes(filled) && filled == slots.length" class="e-risk"> · {{ $t('msg.restore.bad_length') }}</span>
          </p>
        </div>
        <textarea
          id="restorePhrase"
          class="e-textarea e-mono"
          rows="4"
          v-model="phrase"
          @input="phraseInput"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          translate="no"
          aria-describedby="restorePhraseHelp"
          :aria-invalid="invalidCount ? 'true' : null"
          :placeholder="$t('msg.restore.phrase_placeholder')"
        ></textarea>
        <p id="restorePhraseHelp" class="e-help">{{ $t('msg.modern.unlock.restore_phrase_help') }}</p>
      </div>

      <div class="e-field e-rs-length">
        <label class="e-label" for="restoreLength">{{ $t('msg.restore.phrase_length') }}</label>
        <select id="restoreLength" class="e-select" v-model.number="length" @change="lengthChanged">
          <option v-for="n in validLengths" :key="n" :value="n">{{ $t('msg.restore.n_words', [n]) }}</option>
        </select>
      </div>

      <datalist id="bip39-words">
        <option v-for="w in mnemonicWords" :key="w" :value="w"></option>
      </datalist>

      <div v-if="filled == 0" class="e-rs-empty">
        <EIcon name="paste" />
        <p>{{ $t('msg.modern.unlock.restore_empty') }}</p>
      </div>
      <template v-else>
        <h2 class="e-rs-h">{{ $t('msg.modern.unlock.restore_check') }} <span class="e-faint e-small">{{ $t('msg.modern.unlock.restore_check_hint') }}</span></h2>
        <ol class="e-onb-words" :aria-label="$t('msg.restore.title')">
          <li v-for="(word, index) in slots" :key="index" class="e-onb-word">
            <label :for="'restoreWord' + index"><span class="e-sr-only">{{ $t('msg.restore.word_n', ['']) }}</span>{{ index + 1 }}</label>
            <input
              :id="'restoreWord' + index"
              class="e-input"
              :aria-invalid="isInvalid(word) ? 'true' : null"
              type="text"
              list="bip39-words"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              translate="no"
              :value="word"
              @input="wordInput(index, $event)"
              @paste="wordPaste(index, $event)"
              @keydown.space.prevent="focusWord(index + 1)"
            />
            <EIcon v-if="isInvalid(word)" name="alertc" class="e-bad" />
          </li>
        </ol>
        <p class="e-help e-onb-inline-help e-rs-never"><EIcon name="info" /><span>{{ $t('msg.modern.unlock.restore_never_leaves') }}</span></p>
      </template>

      <template #actions>
        <button type="button" class="e-btn e-btn-ghost" @click="back"><EIcon name="chevl" />{{ $t('msg.back') }}</button>
        <button type="button" class="e-btn e-btn-ghost" :disabled="filled == 0" @click="clearup"><EIcon name="trash" />{{ $t('msg.reset') }}</button>
        <span class="e-grow"></span>
        <span class="e-hint">{{ hint }}</span>
        <button type="button" class="e-btn e-btn-primary" :disabled="!enoughSeeds" @click="page = 'addPassword'">{{ $t('msg.modern.unlock.continue') }}<EIcon name="arrowr" /></button>
      </template>
    </OnboFrame>

    <!-- 2. the password (and a label when adding a wallet). Stays mounted while the wallet is
         restored (the Classic logic reads its fields) -->
    <OnboFrame
      v-if="page === 'addPassword'"
      v-show="!working"
      :side="$t('msg.modern.unlock.side_restore')"
      :groups="groups('account')"
      :title="$t('msg.modern.unlock.restore_account_title')"
      :lead="$t('msg.modern.unlock.restore_account_lead')"
      :active="!working"
      focus-heading
    >
      <p v-if="networkName" class="e-net-note e-create-net"><span class="e-tag e-warn">{{ networkName }}</span><span class="e-small e-dim">{{ $t('msg.wallets.network_wallet', [networkName]) }}</span></p>
      <div v-if="adding" class="e-field">
        <label class="e-label" for="restoreLabel">{{ $t('msg.wallets.label') }} <span class="e-faint e-small">{{ $t('msg.wallets.optional') }}</span></label>
        <input id="restoreLabel" class="e-input" type="text" v-model="label" maxlength="32" autocomplete="off" spellcheck="false" aria-describedby="restoreLabelHelp" />
        <p id="restoreLabelHelp" class="e-help">{{ $t('msg.wallets.label_hint') }}</p>
      </div>
      <div class="e-field">
        <label class="e-label" data-field>{{ $t('msg.modern.unlock.password') }}</label>
        <PasswordField ref="passwordField" required="true" name="password" />
      </div>
      <div class="e-field">
        <label class="e-label" data-field>{{ $t('msg.modern.unlock.password_confirm') }}</label>
        <PasswordField ref="passwordField2" required="true" :repeat="passwordField ? passwordField.input : null" name="password2" />
      </div>
      <template #actions>
        <button type="button" class="e-btn e-btn-ghost" @click="page = 'addSeeds'"><EIcon name="chevl" />{{ $t('msg.back') }}</button>
        <span class="e-grow"></span>
        <button type="button" class="e-btn e-btn-primary" @click="initR">{{ $t('msg.modern.unlock.restore_action') }}<EIcon name="arrowr" /></button>
      </template>
    </OnboFrame>

    <!-- 3. the wallet is being restored, then it opens (the unlock steps), or it failed -->
    <div v-if="page === 'addPassword' && working" class="e-hero-screen">
      <div class="e-onb-progress">
        <BrandTile />
        <div class="e-auth-title">
          <h1 ref="progressHeading" tabindex="-1">{{ failure ? $t('msg.modern.unlock.restore_failed_title') : $t('msg.modern.unlock.restoring_title') }}</h1>
        </div>
        <div v-if="!failure" class="e-panel">
          <StageList :stages="restoreAllStages" :current="restoreCurrent || 'restore'" :label="$t('msg.modern.unlock.progress')" />
        </div>
        <div v-if="failure" class="e-notice e-risk" role="alert">
          <EIcon name="alertc" />
          <div>
            <b>{{ $t('msg.modern.unlock.restore_failed_title') }}</b>
            <p>{{ failure.message }}</p>
            <div class="e-row e-notice-actions">
              <button type="button" class="e-btn-inline" @click="retry"><EIcon name="refresh" />{{ $t('msg.modern.unlock.try_again') }}</button>
              <button type="button" class="e-btn-inline" @click="failure = null">{{ $t('msg.back') }}</button>
            </div>
          </div>
        </div>
        <p v-else class="e-reassure"><EIcon name="clock" /><span>{{ $t('msg.modern.unlock.restore_wait') }}</span></p>
      </div>
    </div>

  </div>
</template>

<script>
  import Restore from '@/components/Restore.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import StageList from '@/components/modern/ui/StageList.vue';
  import PasswordField from '@/components/modern/form/PasswordField.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import OnboFrame from '@/components/modern/onboarding/OnboFrame.vue';
  import { railGroups } from '@/components/modern/onboarding/rails';
  import { captureToast, fieldLabels } from '@/components/modern/onboarding/helpers';

  export default reskin(Restore, {
    components: { EIcon, StageList, PasswordField, BrandTile, OnboFrame },
    mixins: [fieldLabels],
    data() {
      return {
        //the recovery is running
        busy: false,
        //it failed: {message}
        failure: null,
      };
    },
    computed: {
      working() {
        return !!(this.busy || this.failure);
      },
      //position of the first word that is not in the word list
      firstInvalid() {
        return this.slots.findIndex(w => this.isInvalid(w));
      },
      //what stops Continue, in a few words
      hint() {
        if (this.enoughSeeds) return '';
        if (this.filled == 0) return this.$t('msg.modern.unlock.restore_hint_paste');
        if (this.invalidCount) return this.$t('msg.modern.unlock.restore_hint_fix');
        return this.$t('msg.restore.word_count', [this.filled, this.length]);
      },
    },
    watch: {
      working(now) {
        if (now) this.$nextTick(() => this.focusEl(this.$refs.progressHeading));
      },
    },
    methods: {
      groups(current) {
        return railGroups((...a) => this.$t(...a), 'restore', current);
      },
      //the Classic initR(), plus: the progress screen while it runs and the error it reports
      async initR() {
        this.failure = null;
        this.busy = true;
        try {
          const message = await captureToast(this, () => Restore.methods.initR.call(this));
          if (message) this.failure = { message };
        } finally {
          this.busy = false;
        }
      },
      retry() {
        this.failure = null;
        this.initR();
      },
      focusEl(el) {
        if (el && el.focus) el.focus({ preventScroll: true });
      },
    },
  });
</script>
