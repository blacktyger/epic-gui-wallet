<template>
  <SettingsFrame>
    <section class="e-set-group" aria-labelledby="stg-ph-h">
      <h2 id="stg-ph-h">{{ $t('msg.modern.settings.phrase') }}</h2>
      <div class="e-set-list">
        <div class="e-set-row e-stacked">
          <p class="e-stg-lede">{{ $t('msg.modern.settings.phrase_desc') }}</p>

          <!-- the words; behind the password gate they are an empty, veiled grid -->
          <div class="e-seed-wrap">
            <ol v-if="seeds.length > 0" class="e-seed" :aria-label="$t('msg.modern.settings.words_label', { n: seeds.length })">
              <li v-for="(seed, i) in seeds" :key="i" translate="no">{{ seed }}</li>
            </ol>
            <template v-else>
              <ol class="e-seed e-is-veiled" aria-hidden="true"><li v-for="n in 24" :key="n"></li></ol>
              <div class="e-seed-veil">
                <form class="e-stg-gate" novalidate @submit.prevent="start">
                  <EIcon name="lock" size="lg" />
                  <b>{{ $t('msg.modern.settings.gate_title') }}</b>
                  <div class="e-field" data-input-id="stg-ph-pw">
                    <label class="e-label" for="stg-ph-pw">{{ $t('msg.password') }}</label>
                    <PasswordField ref="passwordField" required="true" name="password" />
                  </div>
                  <button type="submit" class="e-btn e-btn-primary e-btn-block"><EIcon name="eye" />{{ $t('msg.modern.settings.show_words') }}</button>
                </form>
              </div>
            </template>
          </div>

          <!-- Seed.vue draws the QR code into this canvas, so it stays in the page -->
          <div v-show="seeds.length > 0" class="e-stg-qr">
            <canvas id="qrcodeCanvas" role="img" :aria-label="$t('msg.modern.settings.qr_label')"></canvas>
          </div>

          <div v-if="seeds.length > 0" class="e-notice e-warn" role="status">
            <EIcon name="shield" />
            <div><b>{{ $t('msg.create.backupNote') }}</b><p>{{ $t('msg.modern.settings.phrase_warn') }}</p></div>
          </div>
        </div>
      </div>
    </section>
  </SettingsFrame>
</template>

<script>
  import Seed from '@/components/Seed.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import PasswordField from '@/components/modern/form/PasswordField.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';
  import { inputIds } from '@/components/modern/settings/inputIds';

  export default reskin(Seed, {
    components: { EIcon, PasswordField, SettingsFrame },
    mixins: [inputIds],
  });
</script>
