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
          <label class="label">{{ $t('msg.wallets.data_folder') }}</label>
          <p><code style="word-break: break-all;">{{ dataDir }}</code></p>
          <button type="button" class="button is-small is-outlined" @click="openFolder(dataDir)">{{ $t('msg.wallets.open_folder') }}</button>
        </div>
        <div class="field">
          <label class="label">{{ $t('msg.wallets.config_folder') }}</label>
          <p><code style="word-break: break-all;">{{ configDir }}</code></p>
          <button type="button" class="button is-small is-outlined" @click="openFolder(configDir)">{{ $t('msg.wallets.open_folder') }}</button>
        </div>
        <p v-if="importedDir" class="help">{{ $t('msg.wallets.imported_from', [importedDir]) }}</p>

        <hr>
        <h2 class="title is-5">{{ $t('msg.wallets.other_wallets') }}</h2>
        <p v-if="!others.length" class="help">{{ $t('msg.wallets.no_other_wallets') }}</p>
        <div v-for="w in others" :key="w.id" class="level">
          <div class="level-left"><div>
            <b>{{ nameOf(w) }}</b> <span v-if="badge(w.network)" class="tag is-warning is-light">{{ badge(w.network) }}</span>
            <p class="is-size-7"><code :title="w.dataDir">{{ short(w.dataDir) }}</code></p>
          </div></div>
          <div class="level-right"><button type="button" class="button is-small is-danger is-outlined" @click="askRemove(w)">{{ $t('msg.wallets.remove_from_list') }}</button></div>
        </div>

        <h2 class="title is-5" style="margin-top: 1.5rem;">{{ $t('msg.wallets.add_wallet') }}</h2>
        <div class="buttons">
          <button type="button" class="button is-small" @click="addCreate">{{ $t('msg.wallets.create') }}</button>
          <button type="button" class="button is-small" @click="addRestore">{{ $t('msg.wallets.restore') }}</button>
          <button type="button" class="button is-small" :class="{ 'is-loading': folderBusy }" @click="pickWalletFolder">{{ $t('msg.wallets.open_wallet_folder') }}</button>
          <button type="button" class="button is-small" @click="addImport">{{ $t('msg.wallets.import_older') }}</button>
        </div>
        <div v-if="folderAsk" class="field is-grouped">
          <p class="control">{{ $t('msg.wallets.folder_network') }}</p>
          <div class="control"><div class="select is-small"><select v-model="folderNetwork" :aria-label="$t('msg.wallets.network')">
            <option value="mainnet">Mainnet</option><option value="floonet">Floonet</option><option value="usernet">Usernet</option>
          </select></div></div>
          <div class="control"><button type="button" class="button is-small is-primary" @click="folderWithNetwork">{{ $t('msg.wallets.open') }}</button></div>
        </div>
        <p v-if="folderError" class="help is-danger" role="alert">{{ folderError }}</p>

      </div>
    </div>

    <div class="modal" :class="{ 'is-active': !!removeTarget }" role="dialog" aria-modal="true" aria-labelledby="accountRemoveTitle">
      <div class="modal-background" @click="removeTarget = null"></div>
      <div class="modal-card">
        <header class="modal-card-head"><p id="accountRemoveTitle" class="modal-card-title">{{ $t('msg.wallets.remove_title', [removeTarget ? removeTarget.name : '']) }}</p></header>
        <section class="modal-card-body">{{ $t('msg.wallets.remove_text') }}</section>
        <footer class="modal-card-foot">
          <button type="button" class="button" @click="removeTarget = null">{{ $t('msg.cancel') }}</button>
          <button type="button" class="button is-danger" @click="confirmRemove">{{ $t('msg.wallets.remove_from_list') }}</button>
        </footer>
      </div>
    </div>
  </section>

</template>

<script>

import { useStore } from '@/store';
import { walletList, walletName, networkBadge, shortPath, appLocale, walletFolder, walletOpen } from '@/components/wallets';

  /*
   * This wallet: its label, its folders, where it was imported from; the other wallets in the
   * list (Remove from list) and Add another wallet (Create, Restore, Open folder, Import).
   */
  export default {
    name: "account",
    mixins: [walletFolder, walletOpen],
    setup(){
      return { store: useStore() };
    },
    data() {
      return {
        label: '',
        wallets: [],
        //asking before Remove from list: {id, name}
        removeTarget: null,
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
      dataDir() {
        return this.configService.walletDataDir || (this.wallet && this.wallet.dataDir) || '';
      },
      configDir() {
        return this.configService.walletConfigDir || (this.wallet && this.wallet.configDir) || '';
      },
      network() {
        return (this.wallet && this.wallet.network) || this.configService.defaultAccountNetwork || '';
      },
      importedDir() {
        const w = this.wallet;
        return w && w.origin === 'imported' && w.importedFrom ? w.importedFrom.dir || w.dataDir : '';
      },
      others() {
        return this.wallets.filter(w => w.id !== this.walletId);
      },
    },

    mounted(){
      this.refresh();
      this.label = this.wallet ? this.wallet.label || '' : '';
    },

    methods: {
      refresh() {
        this.wallets = walletList(this.configService);
      },
      nameOf(w) {
        return walletName(w, this.wallets);
      },
      badge: networkBadge,
      short(dir) {
        return shortPath(dir, 52);
      },
      openFolder(dir) {
        if (dir) window.openepichidden.open(dir);
      },

      /* the label goes into the wallet list and the User row (sidebar, unlock) */
      async saveLabel(){
        if(!this.walletId){
          return;
        }
        const label = String(this.label || '').trim();
        try{
          this.configService.settings.updateWallet(this.walletId, {label});
          const cfg = this.configService.config || {};
          await this.$userService.ensureUser(this.walletId, {
            name: label,
            language: appLocale(this.configService),
            nodeInternal: !!cfg.nodeInternal,
            epicbox_domain: cfg.epicbox_domain || '',
          });
          this.label = label;
          this.refresh();
          this.$toast.success(this.$t("msg.account.settings_saved"));
        }catch(e){
          console.log('[account] label not saved: ' + (e && e.message ? e.message : e));
          this.$toast.error(this.$t("msg.account.error_save"));
        }
      },

      addCreate() {
        this.$router.push({ name: 'create', query: { add: '1', network: this.network === 'mainnet' ? undefined : this.network } });
      },
      addRestore() {
        this.$router.push({ name: 'restore', query: { add: '1', network: this.network === 'mainnet' ? undefined : this.network } });
      },
      addImport() {
        this.$router.push({ name: 'found', query: { from: 'settings' } });
      },
      //a wallet folder was added: it needs its password, so this wallet closes and Unlock opens with it
      async folderOpened(wallet) {
        await this.logoutCurrent();
        this.$router.push({ name: 'login', query: { wallet: wallet.id } });
      },

      askRemove(w) {
        this.removeTarget = { id: w.id, name: this.nameOf(w) };
      },
      /* the list entry only: no file of the wallet is touched */
      confirmRemove() {
        const target = this.removeTarget;
        this.removeTarget = null;
        if (!target || target.id === this.walletId) return;
        try {
          this.configService.settings.removeWallet(target.id);
          this.refresh();
          this.$toast.success(this.$t('msg.wallets.removed', [target.name]));
        } catch (e) {
          this.$toast.error(e && e.message ? e.message : String(e));
        }
      },

    }
  }
</script>
