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
          <div class="e-field">
            <label class="e-label" data-field>{{ $t('msg.modern.unlock.wallet') }}</label>
            <AccountField ref="accountField" placeholder="default" required="true" />
          </div>
          <div class="e-field">
            <label class="e-label" data-field>{{ $t('msg.password') }}</label>
            <PasswordField ref="passwordField" placeholder="********" required="true" name="password" />
            <p v-if="unlockError" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ unlockError }}</span></p>
          </div>
          <button
            type="submit"
            class="e-btn e-btn-primary e-btn-block e-btn-lg e-unlock-go"
            :aria-disabled="isLoading ? 'true' : null"
            @click.prevent="login"
          ><EIcon name="lockopen" />{{ $t('msg.modern.unlock.unlock') }}</button>
        </form>
        <div class="e-auth-alt">
          <router-link to="/create">{{ $t('msg.modern.unlock.welcome_create') }}</router-link>
          <router-link to="/restore">{{ $t('msg.modern.unlock.restore_link') }}</router-link>
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
  </div>
</template>

<script>
  import Login from '@/components/Login.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import StageList from '@/components/modern/ui/StageList.vue';
  import AccountField from '@/components/modern/form/AccountField.vue';
  import PasswordField from '@/components/modern/form/PasswordField.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import AuthFoot from '@/components/modern/onboarding/AuthFoot.vue';
  import { captureToast, fieldLabels } from '@/components/modern/onboarding/helpers';

  export default reskin(Login, {
    components: { EIcon, StageList, AccountField, PasswordField, BrandTile, AuthFoot },
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
        const a = this.accountField && this.accountField.defaultValue;
        return a || this.$t('msg.modern.unlock.this_wallet');
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
        const message = await captureToast(this, () => Login.methods.login.call(this));
        if (!message) return;
        if (!this.lastStage || this.lastStage == 'unlock') {
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
