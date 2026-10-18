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
            <b id="stg-bg-l">{{ $t('msg.settings.node_background') }}</b>
            <p id="stg-bg-h">{{ $t('msg.settings.node_background_hint') }}</p>
            <p class="e-stg-why"><EIcon name="info" size="sm" /><span>{{ $t('msg.modern.settings.node_bg_only') }}</span></p>
          </div>
          <div class="e-ctl">
            <label class="e-switch">
              <input type="checkbox" v-model="node_background" :disabled="!nodeInternal" aria-labelledby="stg-bg-l" aria-describedby="stg-bg-h" @change="changeNodeBackgroundSetting" />
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
        <div class="e-set-row">
          <div>
            <b id="stg-boxbg-l">{{ $t('msg.settings.epicbox_background') }}</b>
            <p id="stg-boxbg-h">{{ $t('msg.settings.epicbox_background_hint') }}</p>
          </div>
          <div class="e-ctl">
            <label class="e-switch">
              <input type="checkbox" v-model="epicbox_background" :disabled="(nodeInternal && !node_background)" aria-labelledby="stg-boxbg-l" aria-describedby="stg-boxbg-h" />
              <span class="e-track"></span>
            </label>
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
      </div>
    </section>

    <!-- ============================================================ save -->
    <div class="e-stg-savebar" role="region" :aria-label="$t('msg.save')">
      <EIcon name="pencil" size="sm" />
      <span>{{ $t('msg.modern.settings.save_hint') }}</span>
      <button type="button" class="e-btn e-btn-primary e-sm e-right" :class="{ 'e-is-busy': nodeserverField.checking }" :disabled="nodeserverField.checking" :aria-busy="nodeserverField.checking ? 'true' : null" @click="save">
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
  export default reskin(Settings, { components: { EIcon, NodeserverField, SettingsFrame } });
</script>
