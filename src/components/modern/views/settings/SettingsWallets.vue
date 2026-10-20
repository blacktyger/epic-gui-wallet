<template>
  <SettingsFrame>
    <section class="e-set-group" aria-labelledby="stg-ws-h">
      <h2 id="stg-ws-h">{{ $t('msg.wallets.all_wallets') }}</h2>
      <div class="e-set-list">
        <div class="e-set-row e-stacked">
          <p class="e-stg-sub">{{ $t('msg.wallets.other_wallets_hint') }}</p>
          <ul class="e-wlist">
            <li v-for="w in wallets" :key="w.id" :data-wallet="w.id">
              <div class="e-glyph-sq" aria-hidden="true"><EIcon name="wallet" /></div>
              <div class="e-wlist-info">
                <b><span class="e-truncate">{{ nameOf(w) }}</span><span v-if="badge(w.network)" class="e-tag e-warn">{{ badge(w.network) }}</span><span v-if="w.id === walletId" class="e-tag e-ok">{{ $t('msg.wallets.open_now') }}</span></b>
                <p class="e-mono" :title="folderOf(w)" translate="no">{{ short(folderOf(w)) }}</p>
              </div>
              <div class="e-wlist-acts">
                <button type="button" class="e-btn e-btn-sm e-btn-ghost" :aria-label="$t('msg.wallets.show_in_folder_named', [nameOf(w)])" @click="showInFolder(w)"><EIcon name="open" />{{ $t('msg.wallets.show_in_folder') }}</button>
                <button v-if="w.id !== walletId" type="button" class="e-btn e-btn-sm e-btn-ghost" :aria-label="$t('msg.removal.open_named', [nameOf(w)])" @click="askRemove(w)"><EIcon name="trash" />{{ $t('msg.removal.open') }}</button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section class="e-set-group" aria-labelledby="stg-add-h">
      <h2 id="stg-add-h">{{ $t('msg.wallets.add_title') }}</h2>
      <div class="e-set-list">
        <div class="e-set-row e-stacked">
          <p class="e-stg-sub">{{ $t('msg.wallets.add_lead_open') }}</p>
          <AddWalletOptions modern from="settings" :network="network" :label="$t('msg.wallets.add_title')" />
        </div>
      </div>
    </section>

    <ERemoveWallet v-if="removing" :wallet="removing.wallet" :name="removing.name" @close="removing = null" @done="removed" />
  </SettingsFrame>
</template>

<script>
  import Wallets from '@/components/Wallets.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import ERemoveWallet from '@/components/modern/settings/RemoveWalletDialog.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';

  export default reskin(Wallets, {
    components: { EIcon, ERemoveWallet, SettingsFrame },
  });
</script>
