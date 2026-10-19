<template >
  <section class="section hero is-fullheight is-dark-mode-active" >
    <div class="hero-body" >
      <div class="container">
        <div class="columns is-centered">
          <div class="column is-two-fifths">
            <div class="card has-card-header-background" style="min-width:380px;">
              <header class="card-header" style="justify-content: center;">
                <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;">
              </header>

              <div class="card-content">

                <form @submit.prevent novalidate>
                  <div class="field">
                    <label class="label">{{ $t("msg.account.account") }}</label>
                    <div class="control">
                      <AccountField ref="accountField" placeholder="default" required="true" />
                    </div>
                  </div>
                  <div class="field">
                    <label class="label">{{ $t("msg.password") }}</label>
                    <div class="control has-icons-right">
                      <PasswordField ref="passwordField" placeholder="********" required="true" name="password" />
                    </div>
                  </div>

                  <div class="field is-grouped" style="justify-content: center;display: flex;flex-wrap: wrap;flex-direction: row;">
                    <div class="control" style="margin-top:12px;">
                      <button type="submit" class="button is-primary" :class="{ 'button__loader': isLoading }" :aria-disabled="isLoading" @click.prevent="login">
                        <span class="button__text">{{ $t("msg.login_") }}</span>
                      </button>
                    </div>
                    <div class="control" style="margin-top:12px;">
                      <router-link class="button is-outlined" to="/create">
                        {{ $t("msg.new.create") }}
                      </router-link>
                    </div>
                    <div class="control" style="margin-top:12px;">
                      <router-link class="button is-outlined" to="/restore">
                        {{ $t("msg.restore.recover") }}
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

  </section>
</template>

<script>


import { ref, computed } from 'vue';
import { withoutUserinfo } from '@/shared/nodeVersion';
import PasswordField from "@/components/form/passwordField";
import AccountField from "@/components/form/accountField";
import StartupProgress from "@/components/layout/StartupProgress.vue";
import useFormValidation from "@/modules/useFormValidation";
import { useRouter } from '@/router';
import { useStore } from '@/store';
import { i18n } from '@/i18n';

export default {
  name: "login",
  components: {
    PasswordField,
    AccountField,
    StartupProgress,
  },
  setup() {

    const store = useStore();
    const router = useRouter();
    const passwordField = ref('');
    const accountField = ref();
    const isLoading = ref(false);
    //old wallet processes were found and are being closed: show that step too
    const closingProcesses = ref(false);
    const { resetFormErrors } = useFormValidation();
    const t = i18n.global.t;

    //what has to happen before the dashboard; the node, listeners and balance refresh follow in the background
    const stages = computed(() => [
      {key: 'check', label: t('msg.login.stage_check')},
      {key: 'processes', label: t('msg.login.stage_processes')},
      ...(closingProcesses.value ? [{key: 'closing', label: t('msg.login.stage_closing')}] : []),
      {key: 'wallet', label: t('msg.login.stage_wallet')},
      {key: 'unlock', label: t('msg.login.stage_unlock')},
    ]);

    return {
      store,
      router,
      passwordField,
      accountField,
      isLoading,
      closingProcesses,
      stages,
      resetFormErrors,
    }
  },
  methods: {

    waitForNodeStarted(emitter) {
      return new Promise(resolve => {
        emitter.on('nodeStarted', (pid) => {
          resolve(pid);
        });
      });
    },
    waitForNodesynced (variable) {
        function waitFor(result) {
          if (result != null) {
            return result;
          }
          return new Promise((resolve) => setTimeout(resolve, 100))
            .then(() => Promise.resolve(window[variable]))
            .then((res) => waitFor(res));
        }
        return waitFor();
    },
    async login(){

      //running already (aria-disabled keeps the focus on the button, so guard here)
      if(this.isLoading){
        return;
      }

      //drop a wait for the Setup Assistant from an earlier attempt
      this.emitter.off('setupwizard.saved');

      this.resetFormErrors();
      let isFormAllValid = [];

      isFormAllValid.push(this.passwordField.validInput());
      isFormAllValid.push(this.accountField.validInput(this.configService));

      //check now requires settings
      if(!isFormAllValid.includes(false)){

        this.isLoading = true;
        this.closingProcesses = false;
        try{
          await this.openWallet();
        }catch(e){
          //e.g. the process scan failed: never leave the form locked
          console.log('[login] failed: ' + (e && e.message ? e.message : e));
          this.$toast.error(e && e.message ? e.message : String(e));
          this.isLoading = false;
        }finally{
          this.store.commit('loginStage', '');
        }

      }else{
        return;
      }

    },

    /* check the settings, close leftover processes, then open the wallet (or the Setup Assistant on a first login) */
    async openWallet(){
        const started = performance.now();
        const lap = (step) => console.log('[login] ' + step + ' +' + Math.round(performance.now() - started) + ' ms');

        //first check config and setup
        this.store.commit('loginStage', 'check');
        let action = await this.configService.startCheck(this.accountField.defaultValue);
        lap('config checked');
        //the saved node address was cleaned up just now (once per account): the notice says old -> new
        const change = this.configService.nodeAddressChange;
        if(change){
          console.log('[node] saved address changed: ' + withoutUserinfo(change.from) + ' -> ' + withoutUserinfo(change.to) + ' (' + change.reason + ')');
        }
        this.store.commit('nodeAddressChange', change ? {...change, network: this.configService.defaultAccountNetwork} : null);
        //the account's folder is gone (moved or deleted by hand): say so, start nothing.
        //Going on would start epic-wallet in ~/.epic and hang at "Starting the wallet service"
        if(action === 'init'){
          const dir = this.configService.missingWalletDir;
          throw new Error(dir ? this.$t('msg.login.folder_missing', [this.accountField.defaultValue, dir])
            : this.$t('msg.login.folder_unknown', [this.accountField.defaultValue]));
        }

        //App has started - first close running wallet and node server process
        this.store.commit('loginStage', 'processes');
        let processKilled = await this.configService.killEpicProcess();
        lap('process scan');
        //no owner_api is left, so walletService.start can skip its own scan: nothing was found, or
        //everything found was killed and its ports are free; otherwise (kept or not killed) it scans again
        let knownNotRunning = processKilled === null;
        if(processKilled){
          //wait until the closed processes released their ports, not a fixed 5 s
          this.closingProcesses = true;
          this.store.commit('loginStage', 'closing');
          const portsFree = await this.configService.waitForKilledPorts();
          knownNotRunning = this.configService.allKilled && portsFree;
          lap('old processes closed');
        }
        let user = await this.$userService.getUser(this.accountField.defaultValue);
        //a floonet/usernet wallet that pointed at a mainnet node was moved to the local node address:
        //use the built-in node too, or nothing answers there
        if(change && change.reason == 'mainnet_node_on_testnet' && user.length && !user[0].nodeInternal){
          await this.$userService.updateUserByAccount(this.accountField.defaultValue, {nodeInternal: true});
          user = await this.$userService.getUser(this.accountField.defaultValue);
        }

        if(user.length && action != 'settings'){
          this.store.commit('user', user[0]);
        }else{
          //first login: open the wallet once the Setup Assistant has saved the settings
          const password = this.passwordField.defaultValue;
          this.store.commit('loginStage', '');
          this.emitter.off('setupwizard.saved');
          //the scan above still holds: the Setup Assistant starts no wallet process
          this.emitter.on('setupwizard.saved', async () => {
            this.emitter.off('setupwizard.saved');
            try{
              await this.startWallet(password, knownNotRunning);
            }catch(e){
              this.store.commit('loginStage', '');
              this.$toast.error(e && e.message ? e.message : String(e));
              this.router.push('/login');
            }
          });
          this.router.push('/setupwizard');
          return;
        }

        await this.startWallet(this.passwordField.defaultValue, knownNotRunning, lap);
    },

    /* start the node and the wallet api, then log in.
       Only opening the wallet is waited for: the node check, the listeners and the first balance
       refresh run after the dashboard is shown, with their status there (App.vue). */
    async startWallet(password, knownNotRunning, lap = () => {}){

        //the node starts (or is checked) alongside, it is not waited for
        this.emitter.emit('app.nodeStart');

        this.store.commit('loginStage', 'wallet');
        let canLogin = await this.$walletService.start(password, this.configService.config['firstTime'], knownNotRunning, (stage) => {
          this.store.commit('loginStage', stage);
          lap('wallet service started');
        });
        lap('wallet opened');
        this.store.commit('loginStage', '');

        if(canLogin.success){

          //a plain copy: a reactive object can't be passed to the logger
          window.debug ? console.log('LOGIN USER:', JSON.stringify(this.store.state.user)) : null;

          this.isLoading = false;
          this.emitter.emit('app.accountLoggedIn');
          //HTTP listener, then Epicbox once the node has synced
          this.emitter.emit('app.startListeners', password);

        }else{
          //console.log(canLogin);
          this.isLoading = true;
          this.$walletService.stopWallet();
          this.$toast.error(canLogin.msg.message ? canLogin.msg.message : canLogin.msg);
          //back to the login form after the Setup Assistant
          if(this.router.currentRoute.value.path != '/login'){
            this.router.push('/login');
          }

        }

        this.isLoading = false;
    },

  }
}
</script>
