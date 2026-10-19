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
            <input id="stg-label" class="e-input e-grow e-stg-w" type="text" v-model="label" maxlength="60" autocomplete="off" spellcheck="false" :placeholder="defaultName" aria-describedby="stg-label-h" />
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
            <b id="stg-data-l">{{ $t('msg.wallets.data_folder') }}</b>
            <p>{{ $t('msg.wallets.data_folder_hint') }}</p>
            <p class="e-mono e-stg-path" translate="no">{{ dataDir }}</p>
            <p v-if="importedDir" class="e-stg-origin"><EIcon name="history" size="sm" /><span>{{ $t('msg.wallets.imported_from', [importedDir]) }}</span></p>
          </div>
          <div class="e-ctl"><button type="button" class="e-btn e-sm" aria-describedby="stg-data-l" @click="openFolder(dataDir)"><EIcon name="open" />{{ $t('msg.modern.settings.open_folder') }}</button></div>
        </div>
        <div class="e-set-row">
          <div class="e-stg-paths">
            <b id="stg-cfg-l">{{ $t('msg.wallets.config_folder') }}</b>
            <p>{{ $t('msg.wallets.config_folder_hint') }}</p>
            <p class="e-mono e-stg-path" translate="no">{{ configDir }}</p>
          </div>
          <div class="e-ctl"><button type="button" class="e-btn e-sm" aria-describedby="stg-cfg-l" @click="openFolder(configDir)"><EIcon name="open" />{{ $t('msg.modern.settings.open_folder') }}</button></div>
        </div>
        <div class="e-set-row">
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

    <section class="e-set-group" aria-labelledby="stg-ws-h">
      <h2 id="stg-ws-h">{{ $t('msg.wallets.wallets') }}</h2>
      <div class="e-set-list">
        <div v-if="others.length" class="e-set-row e-stacked">
          <div>
            <b>{{ $t('msg.wallets.other_wallets') }}</b>
            <p>{{ $t('msg.wallets.other_wallets_hint') }}</p>
          </div>
          <ul class="e-wlist">
            <li v-for="w in others" :key="w.id">
              <div class="e-glyph-sq" aria-hidden="true"><EIcon name="wallet" /></div>
              <div class="e-wlist-info">
                <b><span class="e-truncate">{{ nameOf(w) }}</span><span v-if="badge(w.network)" class="e-tag e-warn">{{ badge(w.network) }}</span></b>
                <p class="e-mono" :title="w.dataDir" translate="no">{{ w.dataDir }}</p>
              </div>
              <button type="button" class="e-btn e-btn-sm e-btn-ghost" :aria-label="$t('msg.wallets.remove_named', [nameOf(w)])" @click="askRemove(w)"><EIcon name="trash" />{{ $t('msg.wallets.remove_from_list') }}</button>
            </li>
          </ul>
        </div>
        <div class="e-set-row e-stacked">
          <div>
            <b id="stg-add-l">{{ $t('msg.wallets.add_wallet') }}</b>
            <p>{{ $t('msg.wallets.add_wallet_hint') }}</p>
          </div>
          <div class="e-add-wallet" role="group" aria-labelledby="stg-add-l">
            <button type="button" class="e-btn" @click="addCreate"><EIcon name="plus" />{{ $t('msg.wallets.create') }}</button>
            <button type="button" class="e-btn" @click="addRestore"><EIcon name="backup" />{{ $t('msg.wallets.restore') }}</button>
            <button type="button" class="e-btn" :aria-busy="folderBusy ? 'true' : null" @click="pickWalletFolder">
              <span v-if="folderBusy" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="folderopen" />{{ $t('msg.wallets.open_wallet_folder') }}
            </button>
            <button type="button" class="e-btn" @click="addImport"><EIcon name="download" />{{ $t('msg.wallets.import_older') }}</button>
          </div>
          <div v-if="folderAsk" class="e-notice e-gold" role="group" aria-labelledby="stg-fnet-l">
            <EIcon name="info" />
            <div>
              <p id="stg-fnet-l">{{ $t('msg.wallets.folder_network') }}</p>
              <div class="e-row e-notice-actions">
                <select class="e-select e-stg-ctl-w" v-model="folderNetwork" :aria-label="$t('msg.wallets.network')">
                  <option value="mainnet">Mainnet</option>
                  <option value="floonet">Floonet</option>
                  <option value="usernet">Usernet</option>
                </select>
                <button type="button" class="e-btn e-btn-sm e-btn-primary" @click="folderWithNetwork">{{ $t('msg.wallets.open') }}</button>
              </div>
            </div>
          </div>
          <p v-if="folderError" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ folderError }}</span></p>
        </div>
      </div>
    </section>

    <EDialog
      :open="!!removeTarget"
      role="alertdialog"
      icon="trash"
      tone="risk"
      :title="$t('msg.wallets.remove_title', [removeTarget ? removeTarget.name : ''])"
      :description="$t('msg.wallets.remove_text')"
      @update:open="(v) => { if (!v) removeTarget = null; }"
    >
      <template #foot>
        <button type="button" class="e-btn e-btn-ghost" @click="removeTarget = null">{{ $t('msg.cancel') }}</button>
        <button type="button" class="e-btn e-btn-danger" @click="confirmRemove"><EIcon name="trash" />{{ $t('msg.wallets.remove_from_list') }}</button>
      </template>
    </EDialog>
  </SettingsFrame>
</template>

<script>
  import Account from '@/components/Account.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';

  export default reskin(Account, {
    components: { EIcon, EDialog, SettingsFrame },
  });
</script>
