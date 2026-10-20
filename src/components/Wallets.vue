<template>

  <section class="section is-main-section" >
    <div class="columns">
      <div class="column is-two-thirds">

        <!-- the title bar names the page (All wallets) -->
        <p class="help" style="margin-bottom: 0.75rem;">{{ $t('msg.wallets.other_wallets_hint') }}</p>
        <div v-for="w in wallets" :key="w.id" class="level" :data-wallet="w.id">
          <div class="level-left"><div>
            <b>{{ nameOf(w) }}</b> <span v-if="badge(w.network)" class="tag is-warning is-light">{{ badge(w.network) }}</span>
            <span v-if="w.id === walletId" class="tag is-success is-light">{{ $t('msg.wallets.open_now') }}</span>
            <p class="is-size-7"><code :title="folderOf(w)" translate="no">{{ short(folderOf(w)) }}</code></p>
          </div></div>
          <div class="level-right"><div class="buttons">
            <button type="button" class="button is-small is-outlined" @click="showInFolder(w)" :aria-label="$t('msg.wallets.show_in_folder_named', [nameOf(w)])">{{ $t('msg.wallets.show_in_folder') }}</button>
            <button v-if="w.id !== walletId" type="button" class="button is-small is-danger is-outlined" @click="askRemove(w)" :aria-label="$t('msg.removal.open_named', [nameOf(w)])">{{ $t('msg.removal.open') }}</button>
          </div></div>
        </div>

        <h2 id="addWalletHeading" class="title is-5" style="margin-top: 1.5rem;">{{ $t('msg.wallets.add_title') }}</h2>
        <p class="help" style="margin-bottom: 0.75rem;">{{ $t('msg.wallets.add_lead_open') }}</p>
        <AddWalletOptions from="settings" :network="network" :label="$t('msg.wallets.add_title')" />

      </div>
    </div>

    <RemoveWalletDialog v-if="removing" :wallet="removing.wallet" :name="removing.name" @close="removing = null" @done="removed" />
  </section>

</template>

<script>

import { walletList, walletName, networkBadge, shortFolder, walletFolderOf } from '@/components/wallets';
import AddWalletOptions from '@/components/form/AddWalletOptions.vue';
import RemoveWalletDialog from '@/components/layout/RemoveWalletDialog.vue';

  /*
   * Settings › All wallets: every wallet in the list (the open one marked), each with Show in
   * folder and, except the open one, Remove (components/removalPlan.js); then Add a wallet: Create,
   * Add an existing wallet, Restore (AddWalletOptions). Each adds a new wallet next to the others.
   * Settings › Wallet (Account.vue) is about the open wallet only.
   */
  export default {
    name: "wallets",
    components: { AddWalletOptions, RemoveWalletDialog },
    data() {
      return {
        wallets: [],
        //the wallet being removed (RemoveWalletDialog): {wallet, name}
        removing: null,
      };
    },
    computed: {
      walletId() {
        return this.configService.walletId || '';
      },
      //Create and Restore make the new wallet on the open wallet's network
      network() {
        const w = this.wallets.find(x => x.id === this.walletId) || this.configService.wallet;
        return (w && w.network) || this.configService.defaultAccountNetwork || 'mainnet';
      },
    },
    mounted() {
      this.refresh();
    },
    methods: {
      refresh() {
        this.wallets = walletList(this.configService);
      },
      nameOf(w) {
        return walletName(w, this.wallets);
      },
      badge: networkBadge,
      folderOf: walletFolderOf,
      short(dir) {
        return shortFolder(dir, this.configService, 52);
      },
      /* that wallet's own folder in the file manager (walletFolderOf), else this app's folder for it
         (<root>/wallets/<id>, its WALLET.txt names the data folder). open-folder (background.js)
         opens only a folder of the app or of a listed wallet */
      async showInFolder(w) {
        for (const dir of [walletFolderOf(w), w && w.configDir]) {
          try {
            if (dir && await window.openepichidden.open(dir)) return;
          } catch (e) { /* the next one */ }
        }
        this.$toast.error(this.$t('msg.wallets.missing', [walletFolderOf(w)]));
      },
      askRemove(w) {
        this.removing = { wallet: w, name: this.nameOf(w) };
      },
      removed() {
        this.removing = null;
        this.refresh();
      },
    },
  };
</script>
