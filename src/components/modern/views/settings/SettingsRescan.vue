<template>
  <SettingsFrame>
    <section class="e-set-group" aria-labelledby="stg-rs-h">
      <h2 id="stg-rs-h">{{ $t('msg.modern.settings.rescan') }}</h2>
      <div class="e-set-list">

        <!-- idle -->
        <div v-if="!checking" class="e-set-row e-stacked">
          <div>
            <b>{{ $t('msg.check.introTitle') }}</b>
            <p>{{ $t('msg.check.intro1') }}</p>
          </div>
          <form class="e-stg-scan" novalidate @submit.prevent="start">
            <label class="e-switch e-stg-sw-line" for="unconfirmedSwitch">
              <input id="unconfirmedSwitch" type="checkbox" v-model="delete_unconfirmed" aria-describedby="stg-del-unc-h" />
              <span class="e-track"></span>
              <span><b>{{ $t('msg.check.delete_unconfirmed') }}</b><span id="stg-del-unc-h" class="e-help">{{ $t('msg.modern.settings.rescan_unc_hint') }}</span></span>
            </label>
            <div class="e-field">
              <label class="e-label" for="stg-scan-pw">{{ $t('msg.password') }}</label>
              <div class="e-stg-inline e-top">
                <div class="e-grow" data-input-id="stg-scan-pw"><PasswordField ref="passwordField" placeholder="********" required="true" name="password" /></div>
                <button type="submit" class="e-btn"><EIcon name="scan" />{{ $t('msg.check.start') }}</button>
              </div>
            </div>
          </form>
        </div>

        <!-- running -->
        <div v-else class="e-set-row e-stacked">
          <div>
            <b>{{ $t('msg.modern.settings.rescan') }}</b>
            <p>{{ $t('msg.modern.settings.rescan_running') }}</p>
          </div>
          <div class="e-stg-progress">
            <div class="e-stg-progress-top">
              <span class="e-spinner" aria-hidden="true"></span>
              <b id="stg-scan-l" role="status">{{ $t('msg.check.checking') }}</b>
              <button type="button" class="e-btn e-sm e-right" @click="stop"><EIcon name="stop" />{{ $t('msg.check.stop') }}</button>
            </div>
            <div class="e-progress e-indet" role="progressbar" aria-labelledby="stg-scan-l"><i></i></div>
            <details class="e-tech e-stg-log" open>
              <summary><EIcon name="chevr" size="sm" />{{ $t('msg.modern.settings.scan_log') }}</summary>
              <div class="e-tech-body"><pre class="e-mono" role="log" tabindex="0" :aria-label="$t('msg.modern.settings.scan_log')"><span v-for="(line, i) in logLines" :key="i" class="e-stg-line">{{ line }}</span></pre></div>
            </details>
          </div>
        </div>

      </div>
    </section>
  </SettingsFrame>
</template>

<script>
  import Check from '@/components/Check.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import PasswordField from '@/components/modern/form/PasswordField.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';
  import { inputIds } from '@/components/modern/settings/inputIds';

  export default reskin(Check, {
    components: { EIcon, PasswordField, SettingsFrame },
    mixins: [inputIds],
    computed: {
      //newest line first, as in Classic
      logLines() { return this.checkOutputs.map(line => line.trim()).filter(Boolean); },
    },
  });
</script>
