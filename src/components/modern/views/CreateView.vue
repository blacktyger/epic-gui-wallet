<template>
  <div>
    <!-- 1. the password (and a label when adding a wallet). Stays mounted while the wallet is
         created (the Classic logic reads its fields) -->
    <OnboFrame
      v-show="page === 'create' && !working"
      :side="$t('msg.modern.unlock.side_new')"
      :groups="groups('create')"
      :title="$t('msg.modern.unlock.create_title')"
      :lead="$t('msg.wallets.create_lead')"
      :active="page === 'create' && !working"
    >
      <p v-if="networkName" class="e-net-note e-create-net"><span class="e-tag e-warn">{{ networkName }}</span><span class="e-small e-dim">{{ $t('msg.wallets.network_wallet', [networkName]) }}</span></p>
      <div v-if="adding" class="e-field">
        <label class="e-label" for="createLabel">{{ $t('msg.wallets.label') }} <span class="e-faint e-small">{{ $t('msg.wallets.optional') }}</span></label>
        <input id="createLabel" class="e-input" type="text" v-model="label" maxlength="32" autocomplete="off" spellcheck="false" aria-describedby="createLabelHelp" />
        <p id="createLabelHelp" class="e-help">{{ $t('msg.wallets.label_hint') }}</p>
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
        <button type="button" class="e-btn e-btn-ghost" @click="back"><EIcon name="chevl" />{{ $t('msg.back') }}</button>
        <span class="e-grow"></span>
        <button type="button" class="e-btn e-btn-primary" :aria-disabled="isLoading ? 'true' : null" @click="create">{{ $t('msg.modern.unlock.create_action') }}<EIcon name="arrowr" /></button>
      </template>
    </OnboFrame>

    <!-- 2. the wallet is being created (mockup 12), or it failed (12b) -->
    <div v-if="page === 'create' && working" class="e-hero-screen">
      <div class="e-onb-progress">
        <BrandTile />
        <div class="e-auth-title">
          <h1 ref="progressHeading" tabindex="-1">{{ failure ? $t('msg.modern.unlock.create_failed_title') : $t('msg.modern.unlock.creating_title') }}</h1>
          <p v-if="networkName">{{ $t('msg.wallets.network_wallet', [networkName]) }}</p>
        </div>
        <div class="e-panel">
          <StageList :stages="createStages" :current="createStage" :failed="failure ? failure.stage : ''" :label="$t('msg.modern.unlock.progress')" />
        </div>
        <div v-if="failure" class="e-notice e-risk" role="alert">
          <EIcon name="alertc" />
          <div>
            <b>{{ $t('msg.modern.unlock.create_failed_title') }}</b>
            <p>{{ failure.message }}</p>
            <div class="e-row e-notice-actions">
              <button type="button" class="e-btn e-btn-sm" @click="retry"><EIcon name="refresh" />{{ $t('msg.modern.unlock.try_again') }}</button>
              <button type="button" class="e-btn e-btn-sm e-btn-ghost" @click="editForm">{{ $t('msg.back') }}</button>
            </div>
          </div>
        </div>
        <p v-else class="e-reassure"><EIcon name="clock" /><span>{{ $t('msg.modern.unlock.creating_wait') }}</span></p>
      </div>
    </div>

    <!-- 4. the phrase is written down: a wallet open now locks, then Unlock with the new one chosen -->
    <div v-if="page === 'created' && opening" class="e-hero-screen">
      <div class="e-onb-progress">
        <BrandTile />
        <div class="e-auth-title">
          <h1 ref="openingHeading" tabindex="-1">{{ $t('msg.wallets.stage_lock') }}</h1>
        </div>
        <div v-if="locking" class="e-panel">
          <StageList :stages="[{ key: 'lock', label: $t('msg.wallets.stage_lock') }]" current="lock" :label="$t('msg.modern.unlock.progress')" />
        </div>
      </div>
    </div>

    <!-- 3. the recovery phrase (mockup 13 and 14) -->
    <OnboFrame
      v-show="page === 'created' && !opening"
      :side="$t('msg.modern.unlock.side_new')"
      :groups="groups('phrase')"
      :title="$t('msg.modern.unlock.phrase_title')"
      :lead="$t('msg.modern.unlock.phrase_lead')"
      :active="page === 'created' && !opening"
    >
      <div class="e-notice e-warn">
        <EIcon name="shield" />
        <div><b>{{ $t('msg.modern.unlock.phrase_warn_title') }}</b><p>{{ $t('msg.create.backupWarning') }}</p></div>
      </div>
      <div class="e-onb-phrase">
        <div class="e-seed-wrap">
          <!-- the words are in the page only while revealed; before that an empty, veiled grid -->
          <ol
            v-if="revealed"
            ref="seedList"
            class="e-seed"
            :aria-label="$t('msg.modern.unlock.phrase_label', { n: newseeds.length })"
            tabindex="-1"
          >
            <li v-for="(seed, index) in newseeds" :key="index" translate="no">{{ seed }}</li>
          </ol>
          <ol v-else class="e-seed e-is-veiled" aria-hidden="true"><li v-for="n in newseeds.length" :key="n"></li></ol>
          <div v-if="!revealed" class="e-seed-veil e-onb-veil">
            <div class="e-onb-veil-card">
              <button type="button" class="e-btn e-btn-primary" @click="reveal"><EIcon name="eye" />{{ $t('msg.modern.unlock.phrase_reveal') }}</button>
              <p>{{ $t('msg.modern.unlock.phrase_reveal_hint') }}</p>
            </div>
          </div>
        </div>
        <!-- the phrase as a QR code too: behind the reveal, and hidden until asked for (toggleQr draws it) -->
        <div v-if="revealed" class="e-onb-qr">
          <button type="button" class="e-btn e-btn-ghost e-btn-sm" @click="hide"><EIcon name="eyeoff" />{{ $t('msg.modern.unlock.phrase_hide') }}</button>
          <button type="button" class="e-btn e-btn-ghost e-btn-sm" @click="copyPhrase"><EIcon name="copy" />{{ $t('msg.modern.unlock.phrase_copy') }}</button>
          <button type="button" class="e-btn e-btn-ghost e-btn-sm" :aria-expanded="qrShown ? 'true' : 'false'" aria-controls="e-onb-qr-box" @click="toggleQr"><EIcon :name="qrShown ? 'eyeoff' : 'eye'" />{{ qrShown ? $t('msg.modern.unlock.phrase_qr_hide') : $t('msg.modern.unlock.phrase_qr') }}</button>
          <div v-if="qrShown" id="e-onb-qr-box">
            <p class="e-help">{{ $t('msg.modern.unlock.phrase_qr_hint') }}</p>
            <div class="e-onb-qr-box"><canvas id="qrcodeCanvas" role="img" :aria-label="$t('msg.modern.unlock.phrase_qr')"></canvas></div>
          </div>
        </div>
      </div>
      <template #actions>
        <span class="e-grow"></span>
        <span class="e-hint">{{ revealed ? $t('msg.modern.unlock.phrase_written_q', { n: newseeds.length }) : $t('msg.modern.unlock.phrase_reveal_first') }}</span>
        <button v-if="revealed" type="button" class="e-btn e-btn-primary" @click="openNewWallet"><EIcon name="check" />{{ $t('msg.wallets.written_continue') }}</button>
        <button v-else type="button" class="e-btn e-btn-primary" disabled :title="$t('msg.modern.unlock.phrase_reveal_first')"><EIcon name="check" />{{ $t('msg.modern.unlock.written_down') }}</button>
      </template>
    </OnboFrame>
  </div>
</template>

<script>
  import Create from '@/components/Create.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import StageList from '@/components/modern/ui/StageList.vue';
  import PasswordField from '@/components/modern/form/PasswordField.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import OnboFrame from '@/components/modern/onboarding/OnboFrame.vue';
  import { railGroups } from '@/components/modern/onboarding/rails';
  import { captureToast, fieldLabels } from '@/components/modern/onboarding/helpers';

  export default reskin(Create, {
    components: { EIcon, StageList, PasswordField, BrandTile, OnboFrame },
    mixins: [fieldLabels],
    data() {
      return {
        //the creation failed: {stage, message}
        failure: null,
        lastStage: '',
      };
    },
    computed: {
      //the progress screen shows while creating and after a failure
      working() {
        return !!(this.isLoading || this.failure);
      },
    },
    watch: {
      createStage(stage) {
        if (stage) this.lastStage = stage;
      },
      working(now) {
        if (now) this.$nextTick(() => this.focusEl(this.$refs.progressHeading));
      },
      opening(now) {
        if (now) this.$nextTick(() => this.focusEl(this.$refs.openingHeading));
      },
    },
    methods: {
      groups(current) {
        return railGroups((...a) => this.$t(...a), 'create', current);
      },
      //the Classic create(), plus: the error it reports stays visible on the progress screen
      async create() {
        this.failure = null;
        this.lastStage = '';
        const message = await captureToast(this, () => Create.methods.create.call(this));
        if (message) {
          this.failure = { stage: this.lastStage || 'create', message };
        }
      },
      retry() {
        this.failure = null;
        this.create();
      },
      editForm() {
        this.failure = null;
      },
      reveal() {
        Create.methods.reveal.call(this);
        this.$nextTick(() => this.focusEl(this.$refs.seedList));
      },
      focusEl(el) {
        if (el && el.focus) el.focus({ preventScroll: true });
      },
    },
  });
</script>
