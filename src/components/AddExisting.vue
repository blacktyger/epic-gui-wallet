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

const NETWORKS = ['mainnet', 'floonet', 'usernet'];

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
  created() {
    //a folder whose network can't be told asks for it, starting with the network chosen on Welcome
    if (NETWORKS.includes(this.$route.query.network)) this.folderNetwork = this.$route.query.network;
  },
  computed: {
    from() {
      return this.$route.query.from === 'settings' ? 'settings' : 'new';
    },
    net() {
      return NETWORKS.includes(this.$route.query.network) && this.$route.query.network !== 'mainnet' ? { network: this.$route.query.network } : {};
    },
    foundRoute() {
      return { name: 'found', query: { from: this.from, ...this.net } };
    },
    backRoute() {
      const r = addBackRoute(this.from, this.$store);
      return r.name === 'new' ? { ...r, query: this.net } : r;
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
