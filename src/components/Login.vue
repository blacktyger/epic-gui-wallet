<template >
  <section class="section hero is-fullheight is-dark-mode-active" >
    <div class="hero-body" >
      <div class="container">
        <div class="columns is-centered">
          <div class="column is-two-fifths">
            <div class="card has-card-header-background" style="min-width:380px;">
              <header class="card-header" style="justify-content: center;">
                <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;" alt="Epic Cash">
              </header>

              <div class="card-content">

                <form @submit.prevent novalidate>
                  <div v-if="wallets.length > 1" class="field">
                    <label class="label" for="loginWallet">{{ $t("msg.wallets.wallet") }}</label>
                    <div class="control">
                      <div class="select is-fullwidth">
                        <select id="loginWallet" v-model="selectedId" :disabled="isLoading" @change="missing = null">
                          <option v-for="w in wallets" :key="w.id" :value="w.id">{{ nameOf(w) }}{{ badge(w.network) ? ' (' + badge(w.network) + ')' : '' }} · {{ folderOf(w) }}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div class="field">
                    <label class="label">{{ $t("msg.password") }}</label>
                    <div class="control has-icons-right">
                      <PasswordField ref="passwordField" placeholder="********" required="true" name="password" />
                    </div>
                  </div>

                  <article v-if="missing" class="message is-danger" role="alert">
                    <div class="message-body">
                      <p>{{ $t('msg.wallets.missing', [missing.dir]) }}</p>
                      <div class="buttons" style="margin-top: 0.5rem;">
                        <button type="button" class="button is-small" @click="askRemove">{{ $t('msg.wallets.remove_from_list') }}</button>
                        <button type="button" class="button is-small is-primary" @click="retry">{{ $t('msg.wallets.try_again') }}</button>
                      </div>
                    </div>
                  </article>

                  <div class="field is-grouped" style="justify-content: center;display: flex;flex-wrap: wrap;flex-direction: row;">
                    <div class="control" style="margin-top:12px;">
                      <button type="submit" class="button is-primary" :class="{ 'button__loader': isLoading }" :aria-disabled="isLoading" @click.prevent="login">
                        <span class="button__text">{{ $t("msg.login_") }}</span>
                      </button>
                    </div>
                    <div class="control" style="margin-top:12px;">
                      <router-link class="button is-outlined" to="/new">
                        {{ $t("msg.wallets.create_or_add") }}
                      </router-link>
                    </div>
                  </div>
                </form>
                <StartupProgress v-if="isLoading && store.state.loginStage" :stages="stages" :current="store.state.loginStage" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="hero-foot has-text-centered">
      <div class="logo"></div>
    </div>

    <div class="modal" :class="{ 'is-active': !!removeTarget }" role="dialog" aria-modal="true" aria-labelledby="loginRemoveTitle">
      <div class="modal-background" @click="removeTarget = null"></div>
      <div class="modal-card">
        <header class="modal-card-head"><p id="loginRemoveTitle" class="modal-card-title">{{ $t('msg.wallets.remove_title', [removeTarget ? removeTarget.name : '']) }}</p></header>
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


import { ref } from 'vue';
import PasswordField from "@/components/form/passwordField";
import StartupProgress from "@/components/layout/StartupProgress.vue";
import useFormValidation from "@/modules/useFormValidation";
import { useRouter } from '@/router';
import { useStore } from '@/store';
import { walletOpen, walletList, walletName, folderTail, networkBadge } from '@/components/wallets';

/*
 * Unlock: the password of a wallet in the list. With several wallets a picker (the default one
 * chosen, or route query wallet). A wallet whose folder is gone can be removed from the list
 * (its files, if they come back, are not touched).
 */
export default {
  name: "login",
  mixins: [walletOpen],
  components: {
    PasswordField,
    StartupProgress,
  },
  setup() {

    const store = useStore();
    const router = useRouter();
    const passwordField = ref('');
    const isLoading = ref(false);
    const { resetFormErrors } = useFormValidation();

    return {
      store,
      router,
      passwordField,
      isLoading,
      resetFormErrors,
    }
  },
  data() {
    return {
      wallets: [],
      selectedId: '',
      //startCheck said the folder is gone: {id, name, dir}
      missing: null,
      //asking before Remove from list: {id, name}
      removeTarget: null,
    };
  },
  computed: {
    selected() {
      return this.wallets.find(w => w.id === this.selectedId) || null;
    },
    selectedName() {
      return this.selected ? this.nameOf(this.selected) : '';
    },
  },
  created() {
    this.loadWallets(this.$route.query.wallet);
  },
  mounted() {
    if (!this.wallets.length) {
      this.$router.push('/new');
    }
  },
  methods: {
    loadWallets(prefer) {
      this.wallets = walletList(this.configService);
      const ids = this.wallets.map(w => w.id);
      let id = ids.includes(prefer) ? prefer : '';
      if (!id) {
        const def = this.configService.settings ? this.configService.settings.defaultWalletId() : '';
        id = ids.includes(def) ? def : (ids[0] || '');
      }
      this.selectedId = id;
    },
    nameOf(w) {
      return walletName(w, this.wallets);
    },
    //the picker's second line: the data folder's last segments (the full path in a tooltip)
    folderOf(w) {
      return folderTail(w.dataDir);
    },
    badge: networkBadge,

    async login(){

      //running already (aria-disabled keeps the focus on the button, so guard here)
      if(this.isLoading || !this.selected){
        return;
      }

      this.resetFormErrors();
      this.missing = null;
      if(!this.passwordField.validInput()){
        return;
      }

      const wallet = this.selected;
      this.isLoading = true;
      try{
        const result = await this.openWallet(wallet.id, this.passwordField.defaultValue);
        if(result === 'missing'){
          this.missing = { id: wallet.id, name: this.nameOf(wallet), dir: wallet.dataDir };
        }
      }catch(e){
        //e.g. the process scan failed: never leave the form locked
        console.log('[login] failed: ' + (e && e.message ? e.message : e));
        this.$toast.error(e && e.message ? e.message : String(e));
      }finally{
        this.store.commit('loginStage', '');
        this.isLoading = false;
      }
    },

    retry(){
      this.missing = null;
      this.login();
    },
    askRemove(){
      if(this.missing){
        this.removeTarget = { id: this.missing.id, name: this.missing.name };
      }
    },
    /* the list entry only: no file of the wallet is touched */
    confirmRemove(){
      const target = this.removeTarget;
      this.removeTarget = null;
      if(!target){
        return;
      }
      try{
        this.configService.settings.removeWallet(target.id);
      }catch(e){
        this.$toast.error(e && e.message ? e.message : String(e));
        return;
      }
      this.missing = null;
      this.loadWallets();
      if(!this.wallets.length){
        this.$router.push('/new');
      }
    },

  }
}
</script>
