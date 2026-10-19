<template>
  <div class="e-hero-screen">
    <div class="e-auth-card">
      <BrandTile grid />

      <!-- the form stays mounted while unlocking (the login logic reads its fields), only hidden -->
      <div v-show="!isLoading && !failure" ref="formWrap">
        <div class="e-auth-title">
          <h1>{{ $t('msg.modern.unlock.unlock_title') }}</h1>
          <p>{{ $t('msg.modern.unlock.unlock_lead') }}</p>
        </div>
        <form class="e-panel" novalidate @submit.prevent>
          <!-- several wallets: which one -->
          <fieldset v-if="wallets.length > 1" class="e-wpick">
            <legend class="e-label">{{ $t('msg.wallets.wallet') }}</legend>
            <div class="e-wpick-list">
              <label v-for="w in wallets" :key="w.id" :title="w.dataDir">
                <input type="radio" name="unlock-wallet" :value="w.id" v-model="selectedId" :aria-describedby="'unlock-wf-' + w.id" @change="missing = null" />
                <span class="e-dot" aria-hidden="true"></span>
                <span class="e-wpick-text">
                  <span class="e-wpick-name">{{ nameOf(w) }}</span>
                  <small :id="'unlock-wf-' + w.id" class="e-mono e-wpick-dir" translate="no">{{ folderOf(w) }}</small>
                </span>
                <span v-if="badge(w.network)" class="e-tag e-warn">{{ badge(w.network) }}</span>
              </label>
            </div>
          </fieldset>
          <p v-else-if="selected && (selected.label || badge(selected.network))" class="e-unlock-single">
            <EIcon name="wallet" size="sm" /><span>{{ selectedName }}</span>
            <span v-if="badge(selected.network)" class="e-tag e-warn">{{ badge(selected.network) }}</span>
          </p>
          <div class="e-field">
            <label class="e-label" data-field>{{ $t('msg.password') }}</label>
            <PasswordField ref="passwordField" placeholder="********" required="true" name="password" />
            <p v-if="unlockError" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ unlockError }}</span></p>
          </div>

          <!-- startCheck: the wallet's folder is gone -->
          <div v-if="missing" class="e-notice e-risk e-missing" role="alert">
            <EIcon name="alertc" />
            <div>
              <b>{{ $t('msg.wallets.missing_title') }}</b>
              <p>{{ $t('msg.wallets.missing_lead') }} <span class="e-mono" translate="no">{{ missing.dir }}</span></p>
              <div class="e-row">
                <button type="button" class="e-btn e-btn-sm e-btn-danger" @click="askRemove"><EIcon name="trash" />{{ $t('msg.wallets.remove_from_list') }}</button>
                <button type="button" class="e-btn e-btn-sm" @click="retry"><EIcon name="refresh" />{{ $t('msg.wallets.try_again') }}</button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            class="e-btn e-btn-primary e-btn-block e-btn-lg e-unlock-go"
            :aria-disabled="isLoading ? 'true' : null"
            @click.prevent="login"
          ><EIcon name="lockopen" />{{ $t('msg.modern.unlock.unlock') }}</button>
        </form>
        <div class="e-auth-alt">
          <router-link to="/new">{{ $t('msg.wallets.create_or_add') }}</router-link>
        </div>
      </div>

      <!-- mockup 31: each step shows as it finishes (store.state.loginStage) -->
      <div v-if="isLoading">
        <div class="e-auth-title">
          <h1 ref="progressHeading" tabindex="-1">{{ $t('msg.modern.unlock.unlocking_title', { name: accountName }) }}</h1>
          <p>{{ $t('msg.modern.unlock.unlocking_lead') }}</p>
        </div>
        <div class="e-panel e-progress-card">
          <StageList :stages="stages" :current="store.state.loginStage" :label="$t('msg.modern.unlock.unlock_steps')" />
          <div class="e-next-up">
            <EIcon name="info" size="sm" />
            <span>{{ $t('msg.modern.unlock.unlock_next_up') }}</span>
          </div>
        </div>
      </div>

      <!-- mockup 31, failed: the step that failed and the message the toast showed -->
      <div v-else-if="failure">
        <div class="e-auth-title">
          <h1 ref="failHeading" tabindex="-1">{{ $t('msg.modern.unlock.unlock_failed_title') }}</h1>
          <p>{{ $t('msg.modern.unlock.unlock_failed_lead') }}</p>
        </div>
        <div class="e-panel e-progress-card">
          <StageList :stages="stages" current="" :failed="failure.stage" :label="$t('msg.modern.unlock.unlock_steps')" />
          <div class="e-notice e-risk" role="alert">
            <EIcon name="alertc" />
            <div><b>{{ $t('msg.modern.unlock.unlock_failed_heading') }}</b><p>{{ failure.message }}</p></div>
          </div>
        </div>
        <div class="e-row e-unlock-fail-actions">
          <button type="button" class="e-btn" @click="backToForm">{{ $t('msg.back') }}</button>
          <button type="button" class="e-btn e-btn-primary" @click="retry"><EIcon name="refresh" />{{ $t('msg.modern.unlock.try_again') }}</button>
        </div>
      </div>
    </div>
    <AuthFoot />

    <EDialog
      :open="!!removeTarget"
      role="alertdialog"
      icon="trash"
      tone="risk"
      :title="$t('msg.wallets.remove_title', [removeTarget ? removeTarget.name : ''])"
      :description="$t('msg.wallets.remove_text')"
      @update:open="(v) => { if (!v) removeTarget = null; }"
    >
      <template #foot>
        <button type="button" class="e-btn e-btn-ghost" @click="removeTarget = null">{{ $t('msg.cancel') }}</button>
        <button type="button" class="e-btn e-btn-danger" @click="confirmRemove"><EIcon name="trash" />{{ $t('msg.wallets.remove_from_list') }}</button>
      </template>
    </EDialog>
  </div>
</template>

<script>
  import Login from '@/components/Login.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import StageList from '@/components/modern/ui/StageList.vue';
  import PasswordField from '@/components/modern/form/PasswordField.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import AuthFoot from '@/components/modern/onboarding/AuthFoot.vue';
  import { captureToast, fieldLabels } from '@/components/modern/onboarding/helpers';
  import { unlockFailure } from '@/shared/unlockResult';

  export default reskin(Login, {
    components: { EIcon, EDialog, StageList, PasswordField, BrandTile, AuthFoot },
    mixins: [fieldLabels],
    data() {
      return {
        //the message of a failed unlock at the password step, shown beside the field
        unlockError: '',
        //{stage, message}: a failure before that (files, processes, wallet service)
        failure: null,
        lastStage: '',
      };
    },
    computed: {
      accountName() {
        return this.selectedName || this.$t('msg.modern.unlock.this_wallet');
      },
    },
    watch: {
      'store.state.loginStage'(stage) {
        if (stage) this.lastStage = stage;
      },
      isLoading(now) {
        this.$nextTick(() => {
          if (now) this.focusEl(this.$refs.progressHeading);
          else if (this.failure) this.focusEl(this.$refs.failHeading);
          else if (this.unlockError) this.focusEl(this.passwordInput());
        });
      },
    },
    methods: {
      //the Classic login(), plus: the error it reports stays visible on this screen
      async login() {
        this.unlockError = '';
        this.failure = null;
        this.lastStage = '';
        //the unlock screen shows every failure itself: no toast on top
        const message = await captureToast(this, () => Login.methods.login.call(this), { swallow: true });
        if (!message) return;
        const kind = unlockFailure({ startFailure: this.$walletService.lastStartFailure, lastStage: this.lastStage, opened: this.walletOpened });
        //a wrong password (the wallet said so while starting, or open_wallet refused it): straight back
        //to the password field, selected so it can be typed over. A first unlock too: nothing was saved
        if (kind === 'password') {
          this.unlockError = this.$t('msg.modern.unlock.wrong_password');
          this.$nextTick(() => {
            const input = this.passwordInput();
            if (input) { input.focus({ preventScroll: true }); input.select(); }
          });
          return;
        }
        if (kind === 'field') {
          this.unlockError = message;
        } else {
          this.failure = { stage: this.lastStage, message };
        }
      },
      backToForm() {
        this.failure = null;
        this.$nextTick(() => this.focusEl(this.passwordInput()));
      },
      retry() {
        this.failure = null;
        this.missing = null;
        this.login();
      },
      passwordInput() {
        return this.$refs.formWrap ? this.$refs.formWrap.querySelector('input[name=password]') : null;
      },
      focusEl(el) {
        if (el && el.focus) el.focus({ preventScroll: true });
      },
    },
  });
</script>
