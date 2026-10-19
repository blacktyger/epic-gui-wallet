<template>

  <section class="section hero is-fullheight">
    <section class="hero">
      <div class="hero-body">
        <div class="container">
          <div class="columns is-centered">
            <div class="column is-three-quarters">
              <div class="card has-card-header-background">
                <header class="card-header" style="justify-content: center;">
                  <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;" alt="Epic Cash">
                </header>
                <div class="card-content">

                  <h1 class="title has-text-centered">{{ $t('msg.welcome') }}</h1>
                  <div class="buttons is-justify-content-center">
                    <router-link class="button is-outlined is-primary" :to="createRoute">
                      {{ $t("msg.wallets.create") }}
                    </router-link>
                    <router-link class="button is-outlined is-primary" :to="restoreRoute">
                      {{ $t("msg.wallets.restore") }}
                    </router-link>
                  </div>
                  <p v-if="hasWallets" class="has-text-centered">
                    <router-link to="/login">{{ $t('msg.wallets.back_to_unlock') }}</router-link>
                  </p>

                  <div class="field" style="margin-top: 1.5rem;">
                    <a class="icon-text" style="font-size:0.8rem;" role="button" :aria-expanded="advancedOpen ? 'true' : 'false'" @click="advancedOpen = !advancedOpen">
                      <mdicon size="18" :name="advancedOpen ? 'menu-down' : 'menu-right'" />
                      {{ $t('msg.wallets.advanced') }}
                    </a>
                  </div>

                  <div v-if="advancedOpen" class="card">
                    <div class="card-content">
                      <div class="field">
                        <button type="button" class="button is-small is-outlined" :class="{ 'is-loading': folderBusy }" @click="pickWalletFolder">{{ $t('msg.wallets.open_wallet_folder') }}</button>
                        <p class="help">{{ $t('msg.wallets.open_wallet_folder_hint') }}</p>
                        <div v-if="folderAsk" class="field is-grouped" style="margin-top: 0.5rem;">
                          <p class="control">{{ $t('msg.wallets.folder_network') }}</p>
                          <div class="control"><div class="select is-small"><select v-model="folderNetwork" :aria-label="$t('msg.wallets.network')">
                            <option value="mainnet">Mainnet</option><option value="floonet">Floonet</option><option value="usernet">Usernet</option>
                          </select></div></div>
                          <div class="control"><button type="button" class="button is-small is-primary" @click="folderWithNetwork">{{ $t('msg.wallets.open') }}</button></div>
                        </div>
                        <p v-if="folderError" class="help is-danger" role="alert">{{ folderError }}</p>
                      </div>

                      <div class="field">
                        <router-link class="button is-small is-outlined" :to="{ name: 'found', query: { from: 'new' } }">{{ $t('msg.wallets.import_older') }}</router-link>
                      </div>

                      <div class="field">
                        <label class="label is-small" for="welcomeNetwork">{{ $t('msg.wallets.network') }}</label>
                        <div class="select is-small"><select id="welcomeNetwork" v-model="network">
                          <option value="mainnet">Mainnet</option><option value="floonet">Floonet</option><option value="usernet">Usernet</option>
                        </select></div>
                        <p class="help">{{ $t('msg.wallets.network_hint') }}</p>
                      </div>

                      <div v-if="canMoveRoot" class="field">
                        <button type="button" class="button is-small is-outlined" @click="pickRoot">{{ $t('msg.wallets.root_choose') }}</button>
                        <button v-if="rootSource === 'location'" type="button" class="button is-small is-text" @click="useDefaultRoot">{{ $t('msg.wallets.root_default') }}</button>
                        <div v-if="rootPicked" class="notification is-warning is-light" style="margin-top: 0.5rem;">
                          <p>{{ $t('msg.wallets.root_confirm', [rootPicked]) }}</p>
                          <div class="buttons" style="margin-top: 0.5rem;">
                            <button type="button" class="button is-small" @click="rootPicked = ''">{{ $t('msg.cancel') }}</button>
                            <button type="button" class="button is-small is-primary" @click="confirmRoot">{{ $t('msg.wallets.restart_now') }}</button>
                          </div>
                        </div>
                        <p v-if="rootError" class="help is-danger" role="alert">{{ rootError }}</p>
                      </div>
                      <p class="help">{{ $t('msg.wallets.app_folder', [appFolder]) }}</p>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </section>

</template>


<script>

import { walletFolder } from '@/components/wallets';

/*
 * Welcome: create a wallet or restore one from its recovery phrase. Advanced: open a wallet
 * folder, import from an older Epic Wallet, the network for Create / Restore and, while there
 * are no wallets yet, keeping the app's data in another folder (takes a restart).
 */
export default {
  name: "new",
  mixins: [walletFolder],
  data() {
    const settings = this.configService.settings;
    return {
      network: 'mainnet',
      advancedOpen: false,
      hasWallets: !!(settings && settings.wallets().length),
      //another app data folder: only while the list is empty and the folder is not set by EPIC_GUI_HOME
      canMoveRoot: typeof this.configService.canMoveRoot === 'function' ? this.configService.canMoveRoot() : false,
      //a folder picked for the app data, waiting for the restart to be confirmed
      rootPicked: '',
      rootError: '',
    };
  },
  computed: {
    appFolder() {
      return (this.configService.paths && this.configService.paths.root) || '';
    },
    //where the root comes from: 'default' | 'location' (Advanced) | 'env'
    rootSource() {
      return (this.configService.paths && this.configService.paths.source) || 'default';
    },
    networkQuery() {
      return this.network && this.network !== 'mainnet' ? { network: this.network } : {};
    },
    createRoute() {
      return { name: 'create', params: { from: 'new' }, query: this.networkQuery };
    },
    restoreRoute() {
      return { name: 'restore', params: { from: 'new' }, query: this.networkQuery };
    },
  },
  methods: {
    //the folder is in the list now: unlock it
    async folderOpened(wallet) {
      this.$router.push({ name: 'login', query: { wallet: wallet.id } });
    },
    async pickRoot() {
      this.rootError = '';
      const picked = await window.api.showOpenDialog();
      if (picked && !picked.canceled && picked.filePaths && picked.filePaths[0]) {
        this.rootPicked = picked.filePaths[0];
      }
    },
    //userData is fixed when the app starts, so the new folder applies after a restart
    confirmRoot() {
      this.rootError = '';
      let ok = false;
      try {
        ok = this.configService.setRoot(this.rootPicked);
      } catch (e) {
        console.log('[welcome] setRoot failed: ' + (e && e.message ? e.message : e));
      }
      if (!ok) {
        this.rootError = this.$t('msg.wallets.root_failed');
        return;
      }
      window.api.relaunch();
    },
    useDefaultRoot() {
      this.rootError = '';
      let ok = false;
      try {
        ok = this.configService.clearRoot();
      } catch (e) {
        console.log('[welcome] clearRoot failed: ' + (e && e.message ? e.message : e));
      }
      if (ok === false) {
        this.rootError = this.$t('msg.wallets.root_failed');
        return;
      }
      window.api.relaunch();
    },
  }
}
</script>
