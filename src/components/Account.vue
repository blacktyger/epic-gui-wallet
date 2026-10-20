<template>

  <section class="section is-main-section" >
    <div class="columns">
      <div class="column is-half">

        <div class="field">
          <label class="label" for="accountLabel">{{ $t("msg.wallets.label") }}</label>
          <div class="control">
            <input id="accountLabel" class="input" type="text" v-model="label" maxlength="32" autocomplete="off" :placeholder="defaultName" />
          </div>
          <p class="help">{{ $t('msg.wallets.label_hint') }}</p>
        </div>
        <div class="field">
          <div class="control">
            <button class="button is-primary" @click="saveLabel" >{{ $t("msg.save") }}</button>
          </div>
        </div>

        <div class="field">
          <label class="label">{{ $t('msg.wallets.wallet_folder') }}</label>
          <p class="help">{{ importedDir ? $t('msg.wallets.wallet_folder_imported') : $t('msg.wallets.wallet_folder_hint') }}</p>
          <p><code style="word-break: break-all;">{{ dataDir }}</code></p>
          <div class="buttons" style="margin-top: 0.25rem;">
            <button type="button" class="button is-small is-outlined" data-open="wallet" @click="openFolder(dataDir)">{{ $t('msg.wallets.open_this_folder') }}</button>
            <button type="button" class="button is-small is-outlined" @click="copyPath(dataDir)">{{ $t('msg.wallets.copy_path') }}</button>
          </div>
        </div>
        <div v-if="showConfigDir" class="field">
          <label class="label">{{ $t('msg.wallets.config_folder') }}</label>
          <p><code style="word-break: break-all;">{{ configDir }}</code></p>
          <div class="buttons" style="margin-top: 0.25rem;">
            <button type="button" class="button is-small is-outlined" @click="openFolder(configDir)">{{ $t('msg.wallets.open_folder') }}</button>
            <button type="button" class="button is-small is-outlined" @click="copyPath(configDir)">{{ $t('msg.wallets.copy_path') }}</button>
          </div>
        </div>
        <p v-if="importedDir && importedDir !== dataDir" class="help">{{ $t('msg.wallets.imported_from', [importedDir]) }}</p>

        <hr>
        <p class="help">{{ $t('msg.wallets.this_wallet_only') }}</p>
        <router-link class="button is-small is-outlined" :to="{ name: 'wallets' }">{{ $t('msg.wallets.all_wallets') }}</router-link>

      </div>
    </div>

  </section>

</template>

<script>

import { useStore } from '@/store';
import { walletList, walletName, labelShown, appLocale, walletFolderOf } from '@/components/wallets';

  /*
   * Settings › Wallet, about the open wallet only: its label, its folder (Open wallet folder opens
   * it in the file manager), this app's files for it, where it was imported from. The other wallets
   * and Add a wallet are in Settings › All wallets (Wallets.vue).
   */
  export default {
    name: "account",
    setup(){
      return { store: useStore() };
    },
    data() {
      return {
        label: '',
        wallets: [],
      };
    },
    computed: {
      walletId() {
        return this.configService.walletId || '';
      },
      wallet() {
        return this.wallets.find(w => w.id === this.walletId) || this.configService.wallet || null;
      },
      //what the wallet is called without a label: "Wallet 2"
      defaultName() {
        return this.wallet ? walletName({ ...this.wallet, label: '' }, this.wallets) : '';
      },
      //the wallet's own folder, where its seed is (<root>/wallets/<id>; for an imported or added wallet
      //the folder it was added from): what Open wallet folder opens
      dataDir() {
        return walletFolderOf(this.wallet) || this.configService.walletDataDir || '';
      },
      //6.1's own folder for it (toml, secrets, log); shown only when it is not the data folder
      configDir() {
        return (this.wallet && this.wallet.configDir) || this.configService.walletConfigDir || '';
      },
      showConfigDir() {
        return !!this.configDir && this.configDir !== this.dataDir;
      },
      network() {
        return (this.wallet && this.wallet.network) || this.configService.defaultAccountNetwork || '';
      },
      importedDir() {
        const w = this.wallet;
        return w && w.origin === 'imported' && w.importedFrom ? w.importedFrom.dir || w.dataDir : '';
      },
    },

    mounted(){
      this.refresh();
      this.label = this.wallet ? labelShown(this.wallet.label) : '';
    },

    methods: {
      refresh() {
        this.wallets = walletList(this.configService);
      },
      /* a folder of this wallet in the file manager; open-folder (background.js) opens only a folder
         of the app or of a listed wallet, and says false when it could not */
      async openFolder(dir) {
        if (!dir) return;
        let opened = false;
        try {
          opened = await window.openepichidden.open(dir);
        } catch (e) { /* said below */ }
        if (!opened) this.$toast.error(this.$t('msg.wallets.missing', [dir]));
      },
      async copyPath(dir) {
        if (!dir) return;
        try {
          await window.clipboard.writeText(dir);
          this.$toast.success(this.$t('msg.wallets.copied'));
        } catch (e) {
          this.$toast.error(e && e.message ? e.message : String(e));
        }
      },

      /* the label goes into the wallet list (configService.renameWallet: trimmed to 32, WALLET.txt
         rewritten) and the User row (sidebar) */
      async saveLabel(){
        if(!this.walletId){
          return;
        }
        try{
          if(!this.configService.renameWallet(this.walletId, String(this.label || ''))){
            throw new Error('not saved');
          }
          const label = this.configService.settings.wallet(this.walletId).label;
          const cfg = this.configService.config || {};
          await this.$userService.ensureUser(this.walletId, {
            name: label,
            language: appLocale(this.configService),
            nodeInternal: !!cfg.nodeInternal,
            epicbox_domain: cfg.epicbox_domain || '',
          });
          this.label = labelShown(label);
          this.refresh();
          this.$toast.success(this.$t("msg.account.settings_saved"));
        }catch(e){
          console.log('[account] label not saved: ' + (e && e.message ? e.message : e));
          this.$toast.error(this.$t("msg.account.error_save"));
        }
      },

    }
  }
</script>
