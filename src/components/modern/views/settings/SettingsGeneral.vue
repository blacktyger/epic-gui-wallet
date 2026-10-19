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
        <!-- the built-in node uses chain data of an older app (Settings.vue resetChainData) -->
        <div v-if="chainDirInUse" class="e-set-row e-stacked">
          <div class="e-stg-paths">
            <b id="stg-chain-l">{{ $t('msg.chaindata.in_use_label') }}</b>
            <p>{{ $t('msg.chaindata.in_use_hint') }}</p>
            <p class="e-mono e-stg-path" translate="no">{{ chainDirInUse }}</p>
          </div>
          <div v-if="!chainResetAsk" class="e-ctl">
            <button ref="chainResetButton" type="button" class="e-btn e-sm" :disabled="saving" aria-describedby="stg-chain-l" @click="askChainReset"><EIcon name="download" />{{ $t('msg.chaindata.reset') }}</button>
          </div>
          <div v-else class="e-notice e-gold" role="group" aria-labelledby="stg-chain-ask">
            <EIcon name="info" />
            <div>
              <p id="stg-chain-ask">{{ $t('msg.chaindata.reset_confirm') }}</p>
              <div class="e-row e-notice-actions">
                <button type="button" class="e-btn e-btn-sm e-btn-ghost" :disabled="saving" @click="cancelChainReset">{{ $t('msg.cancel') }}</button>
                <button ref="chainResetGo" type="button" class="e-btn e-btn-sm e-btn-primary" :disabled="saving" @click="resetChainData">{{ $t('msg.chaindata.reset_go') }}</button>
              </div>
            </div>
          </div>
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
          <p v-if="listenerServerLine" class="e-help e-stg-relay-now" role="status"><EIcon :name="listenerServerLine.icon" size="sm" /><span>{{ listenerServerLine.text }}</span></p>
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
    <div v-if="dirty" v-toast-lift class="e-stg-savebar" role="region" :aria-label="$t('msg.modern.settings.unsaved')">
      <EIcon name="pencil" size="sm" />
      <span role="status">{{ $t('msg.modern.settings.unsaved') }}</span>
      <!-- always rendered, so the text change is announced -->
      <span class="e-small e-dim" role="status">{{ chainChecking ? $t('msg.chaindata.checking') : '' }}</span>
      <button type="button" class="e-btn e-btn-ghost e-sm e-right" :disabled="nodeserverField.checking || saving" @click="discard">{{ $t('msg.modern.settings.discard') }}</button>
      <button ref="saveButton" type="button" class="e-btn e-btn-primary e-sm" :class="{ 'e-is-busy': nodeserverField.checking || chainChecking }" :disabled="nodeserverField.checking || saving" :aria-busy="nodeserverField.checking || chainChecking ? 'true' : null" @click="saveChanges">
        <EIcon name="check" />{{ $t('msg.save') }}
      </button>
    </div>

    <!-- the built-in node switched on: older chain data found, asked once (Settings.vue offerChainData) -->
    <EDialog
      :open="!!chainOffer"
      icon="node"
      tone="gold"
      :title="$t('msg.chaindata.offer_title')"
      :description="$t('msg.chaindata.offer_lead')"
      @update:open="(v) => { if (!v) answerChainOffer('cancel'); }"
    >
      <template v-if="chainOffer">
        <dl class="e-facts e-chain-facts">
          <dt>{{ $t('msg.chaindata.offer_folder') }}</dt><dd><span class="e-mono e-chain-dir" translate="no">{{ chainOffer.chain.dir }}</span></dd>
          <dt>{{ $t('msg.chaindata.offer_size') }}</dt><dd>{{ chainOfferSize }}</dd>
          <template v-if="chainOfferDate"><dt>{{ $t('msg.chaindata.offer_modified') }}</dt><dd>{{ chainOfferDate }}</dd></template>
        </dl>
        <p v-if="chainOffer.others" class="e-chain-p e-dim">{{ $t('msg.chaindata.offer_others', [chainOffer.others]) }}</p>
        <p class="e-chain-p"><b>{{ $t('msg.chaindata.offer_question') }}</b></p>
        <p class="e-chain-p e-small e-dim">{{ $t('msg.chaindata.offer_older_app') }}</p>
      </template>
      <template #foot>
        <button type="button" class="e-btn e-btn-ghost" @click="answerChainOffer('declined')">{{ $t('msg.chaindata.offer_fresh') }}</button>
        <button ref="chainOfferUse" type="button" class="e-btn e-btn-primary" @click="answerChainOffer('used')"><EIcon name="check" />{{ $t('msg.chaindata.offer_use') }}</button>
      </template>
    </EDialog>
  </SettingsFrame>
</template>

<script>
  import Settings from '@/components/Settings.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import NodeserverField from '@/components/modern/form/NodeserverField.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';
  import { resetNotice } from '@/shared/theme';
  import { epicboxStatus } from '@/shared/epicboxStatus';
  import { toastLift } from '@/components/modern/ui/toastLift';
  export default reskin(Settings, {
    components: { EIcon, EDialog, NodeserverField, SettingsFrame },
    //toasts (Settings saved, the node check) appear above the bar, never over its Save button
    directives: { toastLift },
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
      /* the server our listener is really on, below the setting */
      listenerServerLine() {
        const st = epicboxStatus(this.store.state.epicbox, this.store.state.walletEpicboxService);
        const t = (k, a) => this.$t('msg.httpReceive.' + k, a);
        if (st.kind == 'checking') return { icon: 'sync', text: t('epicbox_checking_old', [st.checking]) };
        if (!st.server) return null;
        if (st.kind == 'listening') return { icon: 'okc', text: t('epicbox_listening_on', [st.server]) };
        if (st.kind == 'paused') return { icon: 'alert', text: t('epicbox_paused_on', [st.server]) };
        if (st.kind == 'connecting') return { icon: 'sync', text: t('epicbox_connecting_to', [st.server]) };
        if (st.kind == 'starting') return { icon: 'sync', text: t('epicbox_starting_on', [st.server]) };
        return null;
      },
    },
    mounted() {
      //Settings.vue fills the form in its own mounted, which runs first
      this.$nextTick(() => { this.saved = this.current; });
    },

    methods: {
      /* Settings.vue's save; the form counts as saved once the config holds what the form shows */
      async saveChanges() {
        //false: nothing was saved (the chain data prompt was closed, or a save already runs)
        if (await this.save() === false) return;
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
        resetNotice('tour');
        this.$router.push({ path: '/dashboard', query: { tour: '1' } });
      },
    },
  });
</script>

<style scoped>
  .e-chain-facts { font-size: var(--fs-sm); }
  .e-chain-dir { user-select: text; }
  .e-chain-p { margin-top: var(--sp-3); }
</style>
