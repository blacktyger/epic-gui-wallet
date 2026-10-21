<template>
  <SettingsFrame>
    <!-- ============================================================ appearance (#57: its own page) -->
    <section class="e-set-group" aria-labelledby="stg-ap-h">
      <h2 id="stg-ap-h" tabindex="-1">{{ $t('msg.modern.settings.appearance') }}</h2>
      <div class="e-set-list">
        <div class="e-set-row">
          <div>
            <b id="stg-theme-l">{{ $t('msg.modern.theme') }}</b>
            <p id="stg-theme-h">{{ $t('msg.modern.settings.theme_hint') }}</p>
          </div>
          <div class="e-ctl">
            <div class="e-seg" role="group" aria-labelledby="stg-theme-l" aria-describedby="stg-theme-h">
              <button type="button" :aria-pressed="schemeSelected == 'system' ? 'true' : 'false'" @click="saveColourScheme('system')">{{ $t('msg.modern.theme_system') }}</button>
              <button type="button" :aria-pressed="schemeSelected == 'dark' ? 'true' : 'false'" @click="saveColourScheme('dark')">{{ $t('msg.modern.theme_dark') }}</button>
              <button type="button" :aria-pressed="schemeSelected == 'light' ? 'true' : 'false'" @click="saveColourScheme('light')">{{ $t('msg.modern.theme_light') }}</button>
            </div>
          </div>
        </div>
        <div class="e-set-row">
          <div>
            <label for="stg-scale"><b>{{ $t('msg.modern.scale') }}</b></label>
            <p id="stg-scale-h">{{ $t('msg.modern.scale_hint') }}</p>
          </div>
          <div class="e-ctl">
            <select id="stg-scale" class="e-select" aria-describedby="stg-scale-h" :value="scaleSelected" @change="(e) => saveInterfaceScale(Number(e.target.value))">
              <option v-for="s in scales" :key="s" :value="s">{{ s }}%</option>
            </select>
          </div>
        </div>
        <div class="e-set-row">
          <div>
            <label for="stg-lang"><b>{{ $t('msg.lang.lang') }}</b></label>
            <p id="stg-lang-h">{{ $t('msg.modern.settings.language_hint') }}</p>
          </div>
          <div class="e-ctl">
            <select id="stg-lang" class="e-select" aria-describedby="stg-lang-h" :value="localeSelected" @change="(e) => saveLocale(e.target.value)">
              <option v-for="(lang, value) in langs" :value="value" :key="value">{{ lang }}</option>
            </select>
          </div>
        </div>
        <div class="e-set-row">
          <div>
            <label id="stg-ui-l" for="stg-ui"><b>{{ $t('msg.modern.interface') }}</b></label>
            <p id="stg-ui-h">{{ $t('msg.modern.settings.interface_row_hint') }}</p>
          </div>
          <div class="e-ctl">
            <select id="stg-ui" class="e-select" aria-labelledby="stg-ui-l" aria-describedby="stg-ui-h" :value="uiSelected" @change="(e) => saveInterface(e.target.value)">
              <option value="modern">{{ $t('msg.modern.interface_modern') }}</option>
              <option value="classic">{{ $t('msg.modern.interface_classic') }}</option>
            </select>
          </div>
          <div v-if="uiRestartNeeded" class="e-notice e-gold e-stg-span" role="status">
            <EIcon name="info" />
            <div><b>{{ $t('msg.modern.settings.restart_title') }}</b><p>{{ $t('msg.modern.interface_restart') }}</p></div>
            <div class="e-actions"><button type="button" class="e-btn-inline" @click="restartUi">{{ $t('msg.modern.restart_now') }}</button></div>
          </div>
        </div>
        <div class="e-set-row">
          <div>
            <b id="stg-tour-l">{{ $t('msg.modern.tour_again') }}</b>
            <p>{{ $t('msg.modern.tour_again_hint') }}</p>
          </div>
          <div class="e-ctl"><button type="button" class="e-btn" aria-describedby="stg-tour-l" @click="showTourAgain"><EIcon name="help" />{{ $t('msg.modern.settings.tour_show') }}</button></div>
        </div>
      </div>
    </section>
  </SettingsFrame>
</template>

<script>
  import { useStore } from '@/store';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';
  import { getUi, getScheme, getScale, saveUi, saveScheme, saveScale, resetNotice, SCALES } from '@/shared/theme';
  import { supportedLocale } from '@/shared/setupDefaults';

  /* Settings › Appearance: theme, interface scale, language, Modern or Classic. Everything applies at
     once (the interface after a restart); the same calls as Settings.vue. */
  export default {
    name: 'SettingsAppearance',
    components: { EIcon, SettingsFrame },
    setup() {
      return { store: useStore() };
    },
    data() {
      const langs = this.configService.langs || {};
      return {
        uiSelected: getUi(), uiSaved: getUi(), schemeSelected: getScheme(), scaleSelected: getScale(), scales: SCALES,
        langs, localeSelected: supportedLocale((this.configService.config || {}).locale, langs),
      };
    },
    computed: {
      //the saved interface differs from the one running: it applies after a restart
      uiRestartNeeded() {
        return this.uiSaved !== this.store.state.ui;
      },
    },
    methods: {
      saveColourScheme(scheme) {
        this.schemeSelected = scheme;
        saveScheme(scheme);
        this.store.commit('scheme', scheme);
      },
      saveInterfaceScale(scale) {
        this.scaleSelected = scale;
        if (!saveScale(scale)) this.$toast.error(this.$t('msg.settings.error_save'));
      },
      saveInterface(ui) {
        this.uiSelected = ui;
        if (saveUi(ui)) this.uiSaved = ui;
        else this.$toast.error(this.$t('msg.settings.error_save'));
      },
      restartUi() {
        this.emitter.emit('app.reloadUi');
      },
      /* the app's language, at once: settings.json, the wallet's User row, the running app */
      async saveLocale(locale) {
        this.localeSelected = locale;
        let ok = false;
        try {
          ok = this.configService.updateConfig({ locale }) !== false;
          if (ok) await this.$userService.ensureUser(this.configService.walletId, { language: locale });
        } catch (e) {
          ok = false;
        }
        if (!ok) {
          this.$toast.error(this.$t('msg.settings.error_save'));
          return;
        }
        this.emitter.emit('app.selectLocale', locale);
      },
      //forget that the tour was seen and open it on Overview
      showTourAgain() {
        resetNotice('tour');
        this.$router.push({ path: '/dashboard', query: { tour: '1' } });
      },
    },
  };
</script>
