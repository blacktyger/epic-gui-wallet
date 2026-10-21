<template>
  <SettingsFrame>
    <section class="e-set-group" aria-labelledby="stg-w-h">
      <h2 id="stg-w-h">{{ $t('msg.modern.settings.nav_wallet') }}</h2>
      <div class="e-set-list">
        <form class="e-set-row" novalidate @submit.prevent="saveLabel">
          <div>
            <label for="stg-label"><b>{{ $t('msg.wallets.label') }}</b></label>
            <p id="stg-label-h">{{ $t('msg.modern.settings.label_hint') }}</p>
          </div>
          <div class="e-ctl">
            <div class="e-stg-in">
              <input id="stg-label" class="e-input" type="text" v-model="label" maxlength="32" autocomplete="off" spellcheck="false" :placeholder="defaultName" aria-describedby="stg-label-h" />
              <button type="submit" class="e-icon-btn" :aria-label="$t('msg.modern.settings.label_save')" :title="$t('msg.modern.settings.label_save')"><EIcon name="check" /></button>
            </div>
          </div>
        </form>
        <div class="e-set-row">
          <div>
            <b id="stg-ph-l">{{ $t('msg.modern.settings.phrase_row') }}</b>
            <p>{{ $t('msg.modern.settings.phrase_row_hint') }}</p>
          </div>
          <div class="e-ctl"><router-link :to="{ name: 'mnemonic' }" class="e-btn" aria-describedby="stg-ph-l"><EIcon name="key" />{{ $t('msg.modern.settings.show_phrase') }}</router-link></div>
        </div>
        <div class="e-set-row">
          <div>
            <b id="stg-rs-l">{{ $t('msg.modern.settings.rescan_row') }}</b>
            <p>{{ $t('msg.modern.settings.rescan_row_hint') }}</p>
          </div>
          <div class="e-ctl"><router-link :to="{ name: 'recheckBalance' }" class="e-btn" aria-describedby="stg-rs-l"><EIcon name="scan" />{{ $t('msg.modern.settings.rescan_open') }}</router-link></div>
        </div>
      </div>

      <div class="e-set-list">
        <div class="e-set-row">
          <div>
            <b id="stg-data-l">{{ $t('msg.wallets.wallet_folder') }}</b>
            <div class="e-stg-v">
              <code translate="no" :title="dataDir">{{ dataDir }}</code>
              <button type="button" class="e-icon-btn" :aria-label="$t('msg.wallets.copy_path') + ': ' + $t('msg.wallets.wallet_folder')" :title="$t('msg.wallets.copy_path')" @click="copyPath(dataDir)"><EIcon name="copy" /></button>
            </div>
            <p v-if="importedDir && importedDir !== dataDir" class="e-stg-origin"><EIcon name="history" size="sm" /><span>{{ $t('msg.wallets.imported_from', [importedDir]) }}</span></p>
          </div>
          <div class="e-ctl"><button type="button" class="e-btn" data-open="wallet" aria-describedby="stg-data-l" @click="openFolder(dataDir)"><EIcon name="folder" />{{ $t('msg.modern.settings.open_folder') }}</button></div>
        </div>
        <div v-if="showConfigDir" class="e-set-row">
          <div>
            <b id="stg-cfg-l">{{ $t('msg.modern.settings.app_files') }}</b>
            <p>{{ $t('msg.modern.settings.app_files_hint') }}</p>
            <div class="e-stg-v">
              <code translate="no" :title="configDir">{{ configDir }}</code>
              <button type="button" class="e-icon-btn" :aria-label="$t('msg.wallets.copy_path') + ': ' + $t('msg.modern.settings.app_files')" :title="$t('msg.wallets.copy_path')" @click="copyPath(configDir)"><EIcon name="copy" /></button>
            </div>
          </div>
          <div class="e-ctl"><button type="button" class="e-btn" aria-describedby="stg-cfg-l" @click="openFolder(configDir)"><EIcon name="folder" />{{ $t('msg.modern.settings.open_folder') }}</button></div>
        </div>
        <!-- mainnet is the usual one and can't be changed: the row only for a test network -->
        <div v-if="network && network !== 'mainnet'" class="e-set-row">
          <div>
            <b>{{ $t('msg.modern.settings.network') }}</b>
            <p>{{ $t('msg.modern.settings.network_hint') }}</p>
          </div>
          <div class="e-ctl"><span class="e-stg-fact">{{ network }}</span></div>
        </div>
        <div class="e-set-row">
          <div>
            <b id="stg-setup-l">{{ $t('msg.modern.settings.setup_title') }}</b>
            <p>{{ $t('msg.modern.settings.setup_hint') }}</p>
          </div>
          <div class="e-ctl"><router-link :to="{ name: 'setupwizard', params: { from: 'navbar' } }" class="e-btn" aria-describedby="stg-setup-l">{{ $t('msg.modern.settings.setup_run') }}</router-link></div>
        </div>
      </div>
    </section>
  </SettingsFrame>
</template>

<script>
  import Account from '@/components/Account.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';

  export default reskin(Account, {
    components: { EIcon, SettingsFrame },
  });
</script>
