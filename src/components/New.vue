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

                  <h1 class="title has-text-centered">{{ hasWallets ? $t('msg.wallets.add_title') : $t('msg.welcome') }}</h1>
                  <p class="has-text-centered" style="margin-bottom: 1rem;">{{ hasWallets ? $t('msg.wallets.add_lead') : $t('msg.wallets.welcome_lead') }}</p>
                  <AddWalletOptions from="new" :network="network" :label="$t('msg.wallets.add_title')" />
                  <p v-if="network !== 'mainnet'" class="help has-text-centered">{{ $t('msg.wallets.network_chosen') }} ({{ network }})</p>
                  <p v-if="hasWallets" class="has-text-centered" style="margin-top: 1rem;">
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
                        <label class="label is-small" for="welcomeNetwork">{{ $t('msg.wallets.network') }}</label>
                        <div class="select is-small"><select id="welcomeNetwork" v-model="network">
                          <option value="mainnet">Mainnet</option><option value="floonet">Floonet</option><option value="usernet">Usernet</option>
                        </select></div>
                        <p class="help">{{ $t('msg.wallets.network_hint') }}</p>
                      </div>

                      <div class="field">
                        <label class="label is-small">{{ $t('msg.wallets.root_title') }}</label>
                        <p class="help">{{ $t('msg.wallets.root_hint') }}</p>
                        <p class="is-size-7" style="margin: 0.25rem 0;"><code style="word-break: break-all;">{{ appFolder }}</code></p>
                        <details class="is-size-7" style="margin-bottom: 0.5rem;">
                          <summary style="cursor: pointer;">{{ $t('msg.wallets.root_more') }}</summary>
                          <p style="margin-top: 0.25rem;">{{ $t('msg.wallets.root_more_text') }}</p>
                        </details>
                        <template v-if="canMoveRoot">
                          <button type="button" class="button is-small is-outlined" data-root="choose" @click="pickRoot">{{ $t('msg.wallets.root_choose') }}</button>
                          <button v-if="rootSource === 'location'" type="button" class="button is-small is-text" data-root="default" @click="useDefaultRoot">{{ $t('msg.wallets.root_default') }}</button>
                          <div v-if="rootPicked" class="notification is-warning is-light" style="margin-top: 0.5rem;">
                            <p>{{ $t('msg.wallets.root_confirm', [rootPicked]) }}</p>
                            <div class="buttons" style="margin-top: 0.5rem;">
                              <button type="button" class="button is-small" @click="rootPicked = ''">{{ $t('msg.cancel') }}</button>
                              <button type="button" class="button is-small is-primary" data-root="restart" @click="confirmRoot">{{ $t('msg.wallets.restart_now') }}</button>
                            </div>
                          </div>
                          <p v-if="rootError" class="help is-danger" role="alert">{{ rootError }}</p>
                        </template>
                        <p v-else class="help">{{ $t('msg.wallets.root_locked') }}</p>
                      </div>
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

import AddWalletOptions from '@/components/form/AddWalletOptions.vue';

/*
 * Welcome (first start) and Unlock › Add a wallet: the three ways to add a wallet (AddWalletOptions:
 * Create, Add an existing wallet, Restore). Advanced: the network for new wallets and, while there
 * are no wallets yet, keeping the app's data in another folder (takes a restart).
 */
export default {
  name: "new",
  components: { AddWalletOptions },
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
  },
  methods: {
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
      let res = { ok: false, reason: 'failed' };
      try {
        res = this.configService.setRoot(this.rootPicked) || res;
      } catch (e) {
        console.log('[welcome] setRoot failed: ' + (e && e.message ? e.message : e));
      }
      if (!res.ok) {
        //why: an older app's folder, a wallet folder, a folder with files in it, or not writable
        const why = { legacy: 'root_legacy', wallet: 'root_wallet', notempty: 'root_notempty' }[res.reason] || 'root_failed';
        this.rootError = this.$t('msg.wallets.' + why);
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
