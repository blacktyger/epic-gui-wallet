<template>
  <SettingsFrame>
    <section class="e-set-group" aria-labelledby="stg-w-h">
      <h2 id="stg-w-h">{{ $t('msg.modern.settings.wallet') }}</h2>
      <div class="e-set-list">
        <form class="e-set-row e-stacked" novalidate @submit.prevent="saveLabel">
          <div>
            <label for="stg-label"><b>{{ $t('msg.wallets.label') }}</b></label>
            <p id="stg-label-h">{{ $t('msg.wallets.label_hint') }}</p>
          </div>
          <div class="e-stg-inline e-top">
            <input id="stg-label" class="e-input e-grow e-stg-w" type="text" v-model="label" maxlength="32" autocomplete="off" spellcheck="false" :placeholder="defaultName" aria-describedby="stg-label-h" />
            <button type="submit" class="e-btn e-btn-primary"><EIcon name="check" />{{ $t('msg.save') }}</button>
          </div>
        </form>
        <div class="e-set-row">
          <div>
            <b>{{ $t('msg.modern.settings.phrase_row') }}</b>
            <p>{{ $t('msg.modern.settings.phrase_row_hint') }}</p>
          </div>
          <div class="e-ctl"><router-link :to="{ name: 'mnemonic' }" class="e-btn e-sm"><EIcon name="key" />{{ $t('msg.modern.settings.show_phrase') }}</router-link></div>
        </div>
        <div class="e-set-row">
          <div>
            <b>{{ $t('msg.modern.settings.rescan_row') }}</b>
            <p>{{ $t('msg.modern.settings.rescan_row_hint') }}</p>
          </div>
          <div class="e-ctl"><router-link :to="{ name: 'recheckBalance' }" class="e-btn e-sm"><EIcon name="scan" />{{ $t('msg.modern.settings.rescan_open') }}</router-link></div>
        </div>
        <div class="e-set-row">
          <div class="e-stg-paths">
            <b id="stg-data-l">{{ $t('msg.wallets.wallet_folder') }}</b>
            <p>{{ importedDir ? $t('msg.wallets.wallet_folder_imported') : $t('msg.wallets.wallet_folder_hint') }}</p>
            <p class="e-mono e-stg-path" translate="no">{{ dataDir }}</p>
            <p v-if="importedDir && importedDir !== dataDir" class="e-stg-origin"><EIcon name="history" size="sm" /><span>{{ $t('msg.wallets.imported_from', [importedDir]) }}</span></p>
          </div>
          <div class="e-ctl e-stg-folder-btns">
            <button type="button" class="e-btn e-sm" data-open="wallet" @click="openFolder(dataDir)"><EIcon name="open" />{{ $t('msg.wallets.open_this_folder') }}</button>
            <button type="button" class="e-btn e-sm e-btn-ghost" aria-describedby="stg-data-l" @click="copyPath(dataDir)"><EIcon name="copy" />{{ $t('msg.wallets.copy_path') }}</button>
          </div>
        </div>
        <div v-if="showConfigDir" class="e-set-row">
          <div class="e-stg-paths">
            <b id="stg-cfg-l">{{ $t('msg.wallets.config_folder') }}</b>
            <p>{{ $t('msg.wallets.config_folder_hint') }}</p>
            <p class="e-mono e-stg-path" translate="no">{{ configDir }}</p>
          </div>
          <div class="e-ctl e-stg-folder-btns">
            <button type="button" class="e-btn e-sm" aria-describedby="stg-cfg-l" @click="openFolder(configDir)"><EIcon name="open" />{{ $t('msg.modern.settings.open_folder') }}</button>
            <button type="button" class="e-btn e-sm e-btn-ghost" aria-describedby="stg-cfg-l" @click="copyPath(configDir)"><EIcon name="copy" />{{ $t('msg.wallets.copy_path') }}</button>
          </div>
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
            <b>{{ $t('msg.modern.settings.setup_title') }}</b>
            <p>{{ $t('msg.modern.settings.setup_hint') }}</p>
          </div>
          <div class="e-ctl"><router-link :to="{ name: 'setupwizard', params: { from: 'navbar' } }" class="e-small e-stg-link">{{ $t('msg.modern.settings.setup_run') }}</router-link></div>
        </div>
      </div>
    </section>

    <p class="e-stg-more"><span>{{ $t('msg.wallets.this_wallet_only') }}</span> <router-link :to="{ name: 'wallets' }">{{ $t('msg.wallets.all_wallets') }}</router-link></p>
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
