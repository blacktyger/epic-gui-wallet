<template>
  <div>
    <!-- 1. name and password. Stays mounted while the wallet is created (the Classic logic reads its fields) -->
    <OnboFrame
      v-show="page === 'create' && !working"
      :side="$t('msg.modern.unlock.side_new')"
      :groups="groups('create')"
      :title="$t('msg.modern.unlock.create_title')"
      :lead="$t('msg.modern.unlock.create_lead')"
      :active="page === 'create' && !working"
    >
      <div class="e-field">
        <label class="e-label" data-field>{{ $t('msg.modern.unlock.wallet_name') }}</label>
        <AccountField ref="accountField" required="true" placeholder="default" />
        <p class="e-help">{{ $t('msg.modern.unlock.wallet_name_help') }}</p>
      </div>
      <div class="e-field">
        <label class="e-label" data-field>{{ $t('msg.modern.unlock.password') }}</label>
        <PasswordField ref="passwordField" required="true" name="password" />
      </div>
      <div class="e-field">
        <label class="e-label" data-field>{{ $t('msg.modern.unlock.password_confirm') }}</label>
        <PasswordField ref="passwordField2" required="true" :repeat="passwordField ? passwordField.input : null" name="password2" />
      </div>
      <div class="e-onb-section">
        <details class="e-tech" :open="advancedSettings" @toggle="advancedSettings = $event.target.open">
          <summary><EIcon name="chevr" />{{ $t('msg.modern.unlock.advanced') }}</summary>
          <div class="e-tech-body">
            <div class="e-field" role="group" aria-labelledby="e-create-folder-l">
              <span id="e-create-folder-l" class="e-label">{{ $t('msg.modern.unlock.wallet_folder') }}</span>
              <WalletdirField ref="walletdirField" />
            </div>
            <div class="e-field">
              <label class="e-label" data-field>{{ $t('msg.modern.unlock.network') }}</label>
              <NetworkField ref="networkField" />
            </div>
          </div>
        </details>
      </div>
      <template #actions>
        <router-link class="e-btn e-btn-ghost" :to="{ name: fromRoute }"><EIcon name="chevl" />{{ $t('msg.back') }}</router-link>
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
          <p>{{ $t('msg.modern.unlock.creating_lead', { name: accountField ? accountField.defaultValue : '' }) }}</p>
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
              <button type="button" class="e-btn e-btn-sm e-btn-ghost" @click="editForm">{{ $t('msg.modern.unlock.choose_other') }}</button>
            </div>
          </div>
        </div>
        <p v-else class="e-reassure"><EIcon name="clock" /><span>{{ $t('msg.modern.unlock.creating_wait') }}</span></p>
      </div>
    </div>

    <!-- 3. the recovery phrase (mockup 13 and 14) -->
    <OnboFrame
      v-show="page === 'created'"
      :side="$t('msg.modern.unlock.side_new')"
      :groups="groups('phrase')"
      :title="$t('msg.modern.unlock.phrase_title')"
      :lead="$t('msg.modern.unlock.phrase_lead')"
      :active="page === 'created'"
    >
      <div class="e-notice e-warn">
        <EIcon name="shield" />
        <div><b>{{ $t('msg.modern.unlock.phrase_warn_title') }}</b><p>{{ $t('msg.create.backupWarning') }}</p></div>
      </div>
      <div class="e-onb-phrase">
        <div class="e-seed-wrap">
          <ol
            ref="seedList"
            class="e-seed"
            :class="{ 'e-is-veiled': !revealed }"
            :aria-hidden="revealed ? null : 'true'"
            :aria-label="revealed ? $t('msg.modern.unlock.phrase_label', { n: newseeds.length }) : null"
            :tabindex="revealed ? -1 : null"
          >
            <li v-for="(seed, index) in newseeds" :key="index" translate="no">{{ seed }}</li>
          </ol>
          <div v-if="!revealed" class="e-seed-veil e-onb-veil">
            <div class="e-onb-veil-card">
              <button type="button" class="e-btn e-btn-primary" @click="reveal"><EIcon name="eye" />{{ $t('msg.modern.unlock.phrase_reveal') }}</button>
              <p>{{ $t('msg.modern.unlock.phrase_reveal_hint') }}</p>
            </div>
          </div>
        </div>
        <!-- the Classic screen shows the phrase as a QR code too: kept, behind the reveal. The canvas
             stays in the page because the Classic code draws on it by id as soon as the phrase exists -->
        <details v-show="revealed" class="e-tech e-onb-qr">
          <summary><EIcon name="chevr" />{{ $t('msg.modern.unlock.phrase_qr') }}</summary>
          <div class="e-tech-body">
            <p class="e-help">{{ $t('msg.modern.unlock.phrase_qr_hint') }}</p>
            <div class="e-onb-qr-box"><canvas id="qrcodeCanvas" role="img" :aria-label="$t('msg.modern.unlock.phrase_qr')"></canvas></div>
          </div>
        </details>
      </div>
      <template #actions>
        <span class="e-grow"></span>
        <span class="e-hint">{{ revealed ? $t('msg.modern.unlock.phrase_written_q', { n: newseeds.length }) : $t('msg.modern.unlock.phrase_reveal_first') }}</span>
        <router-link v-if="revealed" class="e-btn e-btn-primary" to="/login"><EIcon name="check" />{{ $t('msg.modern.unlock.written_down') }}</router-link>
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
  import AccountField from '@/components/modern/form/AccountField.vue';
  import PasswordField from '@/components/modern/form/PasswordField.vue';
  import WalletdirField from '@/components/modern/form/WalletdirField.vue';
  import NetworkField from '@/components/modern/form/NetworkField.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import OnboFrame from '@/components/modern/onboarding/OnboFrame.vue';
  import { railGroups } from '@/components/modern/onboarding/rails';
  import { captureToast, fieldLabels } from '@/components/modern/onboarding/helpers';

  export default reskin(Create, {
    components: { EIcon, StageList, AccountField, PasswordField, WalletdirField, NetworkField, BrandTile, OnboFrame },
    mixins: [fieldLabels],
    data() {
      return {
        //the creation failed: {stage, message}
        failure: null,
        lastStage: '',
        revealed: false,
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
        this.advancedSettings = true;
      },
      reveal() {
        this.revealed = true;
        this.$nextTick(() => this.focusEl(this.$refs.seedList));
      },
      focusEl(el) {
        if (el && el.focus) el.focus({ preventScroll: true });
      },
    },
  });
</script>
