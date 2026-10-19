<template>
  <SettingsFrame>
    <!-- ============================================================ node -->
    <section class="e-set-group" aria-labelledby="stg-node-h">
      <h2 id="stg-node-h">{{ $t('msg.modern.settings.node') }}</h2>
      <div class="e-set-list">
        <div class="e-set-row e-stacked">
          <p class="e-stg-lede">{{ $t('msg.modern.settings.node_hint') }}</p>
          <NodeserverField ref="nodeserverField" />
        </div>
        <div class="e-set-row">
          <div>
            <b id="stg-bg-l">{{ $t('msg.modern.settings.node_bg_label') }}</b>
            <p class="e-stg-why e-stg-why-top"><EIcon name="info" size="sm" /><span id="stg-bg-n">{{ $t('msg.modern.settings.node_bg_only') }}</span></p>
            <p id="stg-bg-h">{{ $t('msg.modern.settings.node_bg_text') }}</p>
          </div>
          <div class="e-ctl">
            <label class="e-switch">
              <input type="checkbox" v-model="node_background" :disabled="!nodeInternal" aria-labelledby="stg-bg-l" aria-describedby="stg-bg-n stg-bg-h" @change="changeNodeBackgroundSetting" />
              <span class="e-track"></span>
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================================ receiving -->
    <section class="e-set-group" aria-labelledby="stg-rcv-h">
      <h2 id="stg-rcv-h">{{ $t('msg.modern.settings.receiving') }}</h2>
      <div class="e-set-list">
        <div class="e-set-row">
          <div>
            <b id="stg-auto-l">{{ $t('msg.settings.wallet_listener') }}</b>
            <p>{{ $t('msg.settings.auto_start') }}</p>
          </div>
          <div class="e-ctl">
            <label class="e-switch">
              <input type="checkbox" v-model="walletlisten_on_startup" aria-labelledby="stg-auto-l" />
              <span class="e-track"></span>
            </label>
          </div>
        </div>
        <div class="e-set-row e-stacked">
          <div class="e-field">
            <label class="e-label" for="stg-relay">{{ $t('msg.settings.epicbox_domain') }}</label>
            <input id="stg-relay" class="e-input e-mono e-stg-w" type="text" required spellcheck="false" autocomplete="off" translate="no" aria-describedby="stg-relay-h" v-model="epicboxDomain" />
            <p id="stg-relay-h" class="e-help">{{ $t('msg.settings.epicbox_domain_hint') }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================================ appearance -->
    <section class="e-set-group" aria-labelledby="stg-ui-h">
      <h2 id="stg-ui-h">{{ $t('msg.modern.interface') }}</h2>
      <div class="e-set-list">
        <div class="e-set-row e-stacked">
          <div>
            <b id="stg-ui-l">{{ $t('msg.modern.settings.interface_label') }}</b>
            <p>{{ $t('msg.modern.interface_hint') }}</p>
          </div>
          <div class="e-choices e-two" role="radiogroup" aria-labelledby="stg-ui-l">
            <label class="e-choice">
              <input type="radio" name="stg-ui" value="modern" v-model="uiSelected" @change="saveInterface" />
              <span class="e-card"><EIcon name="palette" /><b>{{ $t('msg.modern.interface_modern') }}</b><p>{{ $t('msg.modern.settings.interface_modern_text') }}</p></span>
            </label>
            <label class="e-choice">
              <input type="radio" name="stg-ui" value="classic" v-model="uiSelected" @change="saveInterface" />
              <span class="e-card"><EIcon name="history" /><b>{{ $t('msg.modern.interface_classic') }}</b><p>{{ $t('msg.modern.settings.interface_classic_text') }}</p></span>
            </label>
          </div>
          <div v-if="uiRestartNeeded" class="e-notice e-gold" role="status">
            <EIcon name="info" />
            <div><b>{{ $t('msg.modern.settings.restart_title') }}</b><p>{{ $t('msg.modern.interface_restart') }}</p></div>
            <div class="e-actions"><button type="button" class="e-btn e-btn-primary e-sm" @click="restartUi">{{ $t('msg.modern.restart_now') }}</button></div>
          </div>
        </div>
      </div>
    </section>

    <section class="e-set-group" aria-labelledby="stg-ap-h">
      <h2 id="stg-ap-h">{{ $t('msg.modern.settings.appearance') }}</h2>
      <div class="e-set-list">
        <div class="e-set-row e-stacked">
          <div>
            <b id="stg-scale-l">{{ $t('msg.modern.scale') }}</b>
            <p>{{ $t('msg.modern.scale_hint') }}</p>
          </div>
          <div class="e-ctl">
            <div class="e-seg e-stg-scale" role="group" aria-labelledby="stg-scale-l">
              <button v-for="s in scales" :key="s" type="button" :aria-pressed="scaleSelected == s ? 'true' : 'false'" :aria-label="$t('msg.modern.scale_label', { n: s })" @click="saveInterfaceScale(s)">{{ s }}%</button>
            </div>
          </div>
        </div>
        <div class="e-set-row">
          <div>
            <b id="stg-theme-l">{{ $t('msg.modern.theme') }}</b>
            <p>{{ $t('msg.modern.settings.theme_hint') }}</p>
          </div>
          <div class="e-ctl">
            <div class="e-seg" role="group" aria-labelledby="stg-theme-l">
              <button type="button" :aria-pressed="schemeSelected == 'system' ? 'true' : 'false'" @click="saveColourScheme('system')"><EIcon name="monitor" size="sm" />{{ $t('msg.modern.theme_system') }}</button>
              <button type="button" :aria-pressed="schemeSelected == 'dark' ? 'true' : 'false'" @click="saveColourScheme('dark')">{{ $t('msg.modern.theme_dark') }}</button>
              <button type="button" :aria-pressed="schemeSelected == 'light' ? 'true' : 'false'" @click="saveColourScheme('light')">{{ $t('msg.modern.theme_light') }}</button>
            </div>
          </div>
        </div>
        <div class="e-set-row">
          <div>
            <label for="stg-lang"><b>{{ $t('msg.lang.lang') }}</b></label>
            <p>{{ $t('msg.modern.settings.language_hint') }}</p>
          </div>
          <div class="e-ctl">
            <select id="stg-lang" class="e-select e-stg-ctl-w" v-model="localeSelected">
              <option v-for="(lang, value) in langs" :value="value" :key="value">{{ lang }}</option>
            </select>
          </div>
        </div>
        <div class="e-set-row">
          <div>
            <b>{{ $t('msg.modern.tour_again') }}</b>
            <p>{{ $t('msg.modern.tour_again_hint') }}</p>
          </div>
          <div class="e-ctl"><button type="button" class="e-btn e-btn-sm" @click="showTourAgain"><EIcon name="help" />{{ $t('msg.modern.tour_again') }}</button></div>
        </div>
      </div>
    </section>

    <!-- ============================================================ save -->
    <!-- only while something differs from what is saved -->
    <div v-if="dirty" class="e-stg-savebar" role="region" :aria-label="$t('msg.modern.settings.unsaved')">
      <EIcon name="pencil" size="sm" />
      <span role="status">{{ $t('msg.modern.settings.unsaved') }}</span>
      <button type="button" class="e-btn e-btn-ghost e-sm e-right" :disabled="nodeserverField.checking" @click="discard">{{ $t('msg.modern.settings.discard') }}</button>
      <button type="button" class="e-btn e-btn-primary e-sm" :class="{ 'e-is-busy': nodeserverField.checking }" :disabled="nodeserverField.checking" :aria-busy="nodeserverField.checking ? 'true' : null" @click="saveChanges">
        <EIcon name="check" />{{ $t('msg.save') }}
      </button>
    </div>
  </SettingsFrame>
</template>

<script>
  import Settings from '@/components/Settings.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import NodeserverField from '@/components/modern/form/NodeserverField.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';
  import { resetNotice } from '@/shared/theme';
  export default reskin(Settings, {
    components: { EIcon, NodeserverField, SettingsFrame },
    data() {
      //the saved values, to tell whether the form has unsaved changes
      return { saved: null };
    },
    computed: {
      current() {
        const f = this.nodeserverField || {};
        return JSON.stringify([f.select, String(f.input || '').trim(), !!this.node_background, this.localeSelected,
          String(this.epicboxDomain || '').trim(), !!this.walletlisten_on_startup]);
      },
      dirty() {
        return this.saved !== null && this.saved !== this.current;
      },
    },
    mounted() {
      //Settings.vue fills the form in its own mounted, which runs first
      this.$nextTick(() => { this.saved = this.current; });
    },
    methods: {
      /* Settings.vue's save; the form counts as saved once the config holds what the form shows */
      async saveChanges() {
        await this.save();
        const c = this.configService.config || {};
        if (c.locale === this.localeSelected && (c.epicbox_domain || '') === String(this.epicboxDomain || '').trim()
          && !!c.walletlisten_on_startup === !!this.walletlisten_on_startup && !!c.node_background === !!this.node_background) {
          this.saved = this.current;
        }
      },
      /* back to the saved values */
      discard() {
        const [select, input, nodeBg, locale, domain, listen] = JSON.parse(this.saved);
        this.nodeserverField.select = select;
        this.nodeserverField.input = input;
        this.nodeInternal = select == 'internal';
        this.node_background = nodeBg;
        this.localeSelected = locale;
        this.epicboxDomain = domain;
        this.walletlisten_on_startup = listen;
        this.resetFormErrors();
      },
      //forget that the tour was seen and open it on Overview
      showTourAgain() {
        resetNotice('tour', this.configService);
        this.$router.push({ path: '/dashboard', query: { tour: '1' } });
      },
    },
  });
</script>
