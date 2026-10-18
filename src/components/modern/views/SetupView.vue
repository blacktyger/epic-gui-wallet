<template>
  <!-- All four steps stay in the page (v-show): the Classic logic reads the fields of every step -->
  <OnboFrame
    :side="$t('msg.modern.unlock.side_setup')"
    :groups="groups"
    :title="frame.title"
    :lead="frame.lead"
    :step-key="step"
  >
    <template #side-foot>
      <button v-if="fromRoute == 'navbar' && step === 'step1'" type="button" class="e-btn e-btn-ghost e-btn-sm" @click="backToDashbaord()"><EIcon name="arrowl" />{{ $t('msg.modern.unlock.back_to_wallet') }}</button>
    </template>

    <!-- step 1: name and language -->
    <div v-show="step === 'step1'">
      <div class="e-onb-two">
        <div class="e-field">
          <label class="e-label" data-field>{{ $t('msg.modern.unlock.setup_name') }}</label>
          <TextField ref="textField" fieldname="name" />
        </div>
        <div class="e-field">
          <label class="e-label" for="setupLanguage">{{ $t('msg.modern.unlock.setup_language') }}</label>
          <select id="setupLanguage" class="e-select" v-model="localeSelected">
            <option v-for="(lang, locale) in langs" :value="locale" :key="locale">{{ lang }}</option>
          </select>
        </div>
      </div>
      <p class="e-help e-setup-help">{{ $t('msg.modern.unlock.setup_name_help') }}</p>
    </div>

    <!-- step 2: the node -->
    <div v-show="step === 'step2'">
      <NodeserverField ref="nodeserverField" />
      <p class="e-help e-onb-inline-help e-setup-help"><EIcon name="info" /><span>{{ $t('msg.modern.unlock.setup_node_help') }}</span></p>
    </div>

    <!-- step 3: Epicbox -->
    <div v-show="step === 'step3'">
      <div class="e-onb-explain">
        <p>{{ $t('msg.modern.unlock.setup_receive_p1') }}</p>
        <p>{{ $t('msg.modern.unlock.setup_receive_p2') }}</p>
      </div>
      <div class="e-field">
        <label class="e-label" data-field>{{ $t('msg.setupwizard.epicbox_domain') }}</label>
        <TextField ref="epicboxDomain" fieldname="domain" />
        <p class="e-help">{{ $t('msg.setupwizard.epicbox_domain_hint') }}</p>
      </div>
    </div>

    <!-- step 4: review -->
    <div v-show="step === 'step4'">
      <div class="e-panel e-onb-review">
        <section>
          <h2 class="e-onb-rv-h">{{ $t('msg.modern.unlock.step_prefs') }}</h2>
          <dl class="e-facts">
            <dt>{{ $t('msg.modern.unlock.review_name') }}</dt><dd>{{ textField.defaultValue }}</dd>
            <dt>{{ $t('msg.modern.unlock.review_language') }}</dt><dd>{{ langs[localeSelected] || localeSelected }}</dd>
          </dl>
          <button type="button" class="e-link-btn" :aria-label="$t('msg.modern.unlock.change_prefs')" @click="prevStep('step1')">{{ $t('msg.modern.unlock.change') }}</button>
        </section>
        <section>
          <h2 class="e-onb-rv-h">{{ $t('msg.modern.unlock.step_node') }}</h2>
          <dl class="e-facts">
            <dt>{{ $t('msg.modern.unlock.review_type') }}</dt>
            <dd>{{ nodeserverField.nodeInternal ? $t('msg.modern.unlock.review_node_builtin') : $t('msg.modern.unlock.review_node_remote') }}</dd>
            <template v-if="!nodeserverField.nodeInternal">
              <dt>{{ $t('msg.modern.unlock.review_address') }}</dt><dd><span class="e-mono" translate="no">{{ nodeserverField.defaultValue }}</span></dd>
            </template>
          </dl>
          <button type="button" class="e-link-btn" :aria-label="$t('msg.modern.unlock.change_node')" @click="prevStep('step2')">{{ $t('msg.modern.unlock.change') }}</button>
        </section>
        <section>
          <h2 class="e-onb-rv-h">{{ $t('msg.modern.unlock.step_receive') }}</h2>
          <dl class="e-facts">
            <dt>{{ $t('msg.modern.unlock.review_relay') }}</dt>
            <dd><span v-if="epicboxDomain.defaultValue" class="e-mono" translate="no">{{ epicboxDomain.defaultValue }}</span><template v-else>{{ $t('msg.modern.unlock.review_epicbox_off') }}</template></dd>
          </dl>
          <button type="button" class="e-link-btn" :aria-label="$t('msg.modern.unlock.change_receive')" @click="prevStep('step3')">{{ $t('msg.modern.unlock.change') }}</button>
        </section>
      </div>
      <p class="e-onb-later"><EIcon name="settings" /><span>{{ $t('msg.modern.unlock.setup_later') }}</span></p>

      <!-- after Open wallet: the login opens the wallet, its steps show here (loginStage) -->
      <div v-if="isSaving && store.state.loginStage" class="e-panel e-progress-card e-setup-opening">
        <h2 class="e-rs-h">{{ $t('msg.modern.unlock.setup_opening') }}</h2>
        <StageList :stages="openStages" :current="store.state.loginStage" :label="$t('msg.modern.unlock.setup_opening')" />
      </div>
    </div>

    <template #actions>
      <button v-if="step !== 'step1'" type="button" class="e-btn e-btn-ghost" @click="prevStep(previousStep)"><EIcon name="chevl" />{{ $t('msg.back') }}</button>
      <span class="e-grow"></span>
      <button v-if="step === 'step1'" type="button" class="e-btn e-btn-primary" @click="nextStep('step2')">{{ $t('msg.modern.unlock.continue') }}<EIcon name="arrowr" /></button>
      <button
        v-else-if="step === 'step2'"
        type="button"
        class="e-btn e-btn-primary"
        :aria-disabled="nodeserverField.checking ? 'true' : null"
        @click="nodeserverField.checking || nextStep('step3')"
      ><span v-if="nodeserverField.checking" class="e-spinner" aria-hidden="true"></span>{{ $t('msg.modern.unlock.continue') }}<EIcon name="arrowr" /></button>
      <button v-else-if="step === 'step3'" type="button" class="e-btn e-btn-primary" @click="nextStep('step4')">{{ $t('msg.modern.unlock.continue') }}<EIcon name="arrowr" /></button>
      <button v-else type="button" class="e-btn e-btn-primary" :aria-disabled="isSaving ? 'true' : null" @click="save">
        <span v-if="isSaving" class="e-spinner" aria-hidden="true"></span><EIcon v-else :name="isExistingSetup ? 'check' : 'lockopen'" />{{ isExistingSetup ? $t('msg.modern.unlock.setup_save') : $t('msg.modern.unlock.setup_open') }}
      </button>
    </template>
  </OnboFrame>
</template>

<script>
  import SetupWizard from '@/components/SetupWizard.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import StageList from '@/components/modern/ui/StageList.vue';
  import TextField from '@/components/modern/form/TextField.vue';
  import NodeserverField from '@/components/modern/form/NodeserverField.vue';
  import OnboFrame from '@/components/modern/onboarding/OnboFrame.vue';
  import { railGroups } from '@/components/modern/onboarding/rails';
  import { fieldLabels } from '@/components/modern/onboarding/helpers';

  const STEP_KEYS = { step1: 'prefs', step2: 'node', step3: 'receive', step4: 'review' };
  const PREVIOUS = { step2: 'step1', step3: 'step2', step4: 'step3' };

  export default reskin(SetupWizard, {
    components: { EIcon, StageList, TextField, NodeserverField, OnboFrame },
    mixins: [fieldLabels],
    computed: {
      groups() {
        return railGroups((...a) => this.$t(...a), 'setup', STEP_KEYS[this.step]);
      },
      previousStep() {
        return PREVIOUS[this.step] || 'step1';
      },
      //title and lead of the step shown
      frame() {
        const m = (k) => this.$t('msg.modern.unlock.' + k);
        const again = this.isExistingSetup ? m('setup_review_again') : '';
        switch (this.step) {
          case 'step2': return { title: m('setup_node_title'), lead: again || m('setup_node_lead') };
          case 'step3': return { title: m('setup_receive_title'), lead: again };
          case 'step4': return { title: m('setup_review_title'), lead: again || m('setup_review_lead') };
          default: return { title: m('setup_prefs_title'), lead: again || m('setup_prefs_lead') };
        }
      },
    },
  });
</script>
