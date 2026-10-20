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

                  <h1 class="title has-text-centered">{{ $t('msg.wallets.existing_title') }}</h1>
                  <p class="has-text-centered" style="margin-bottom: 1.25rem;">{{ $t('msg.wallets.existing_lead') }}</p>

                  <div class="box">
                    <h2 class="title is-6" style="margin-bottom: 0.25rem;">{{ $t('msg.wallets.existing_older') }}</h2>
                    <p id="existingOlderHelp" class="help" style="margin-bottom: 0.5rem;">{{ $t('msg.wallets.existing_older_hint') }}</p>
                    <router-link class="button is-small is-primary is-outlined" :to="foundRoute" aria-describedby="existingOlderHelp">{{ $t('msg.wallets.existing_older_go') }}</router-link>
                  </div>

                  <div class="box">
                    <h2 class="title is-6" style="margin-bottom: 0.25rem;">{{ $t('msg.wallets.existing_folder') }}</h2>
                    <p id="existingFolderHelp" class="help" style="margin-bottom: 0.5rem;">{{ $t('msg.wallets.existing_folder_hint') }}</p>
                    <button ref="folderButton" type="button" class="button is-small is-primary is-outlined" :class="{ 'is-loading': folderBusy }" aria-describedby="existingFolderHelp" @click="pickWalletFolder">{{ $t('msg.wallets.existing_folder_go') }}</button>
                    <div v-if="folderAsk" class="field is-grouped" style="margin-top: 0.5rem;">
                      <p class="control">{{ $t('msg.wallets.folder_network') }}</p>
                      <div class="control"><div class="select is-small"><select v-model="folderNetwork" :aria-label="$t('msg.wallets.network')">
                        <option value="mainnet">Mainnet</option><option value="floonet">Floonet</option><option value="usernet">Usernet</option>
                      </select></div></div>
                      <div class="control"><button type="button" class="button is-small is-primary" @click="folderWithNetwork">{{ $t('msg.wallets.open') }}</button></div>
                    </div>
                    <p v-if="folderError" class="help is-danger" role="alert">{{ folderError }}</p>
                    <WalletFolderPick v-if="folderPick" :pick="folderPick" :busy="folderBusy" @open="folderPicked" @again="pickWalletFolder" @cancel="folderPickCancel" />
                  </div>

                  <p class="has-text-centered">
                    <router-link :to="backRoute">{{ $t('msg.back') }}</router-link>
                  </p>

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

import { walletFolder, walletOpen, addBackRoute } from '@/components/wallets';

/*
 * Add a wallet › Add an existing wallet: a wallet already on this computer is added to the list
 * where it is (nothing is copied, moved or replaced): one an older Epic Wallet left (the found
 * screen), or the folder of any wallet (walletFolder: the picker works out which wallet folder(s)
 * a picked folder means). Then the wallet open now locks and Unlock opens with the new one chosen.
 * Route query from: 'new' (Welcome) | 'settings' (Settings › All wallets).
 */
export default {
  name: 'addExisting',
  mixins: [walletFolder, walletOpen],
  computed: {
    from() {
      return this.$route.query.from === 'settings' ? 'settings' : 'new';
    },
    foundRoute() {
      return { name: 'found', query: { from: this.from } };
    },
    backRoute() {
      return addBackRoute(this.from, this.$store);
    },
  },
  methods: {
    //the folder is in the list now: unlock it (the wallet open now locks first)
    async folderOpened(wallet) {
      await this.unlockAdded(wallet.id);
    },
  },
};
</script>
