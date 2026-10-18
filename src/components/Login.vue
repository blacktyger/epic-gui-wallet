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
                      <button type="submit" class="button is-primary" :class="{ 'button__loader': isLoading }" :disabled="isLoading" @click.prevent="login">
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


import { ref } from 'vue';
import PasswordField from "@/components/form/passwordField";
import AccountField from "@/components/form/accountField";
import useFormValidation from "@/modules/useFormValidation";
import { useRouter } from '@/router';
import { useStore } from '@/store';
import { i18n } from '@/i18n';

export default {
  name: "login",
  components: {
    PasswordField,
    AccountField,
  },
  setup() {

    const store = useStore();
    const router = useRouter();
    const passwordField = ref('');
    const accountField = ref();
    const isLoading = ref(false);
    const { resetFormErrors } = useFormValidation();

    return {
      store,
      router,
      passwordField,
      accountField,
      isLoading,
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

      //drop a wait for the Setup Assistant from an earlier attempt
      this.emitter.off('setupwizard.saved');

      this.resetFormErrors();
      let isFormAllValid = [];

      isFormAllValid.push(this.passwordField.validInput());
      isFormAllValid.push(this.accountField.validInput(this.configService));

      //check now requires settings
      if(!isFormAllValid.includes(false)){

        this.isLoading = true;
        const started = performance.now();
        const lap = (step) => console.log('[login] ' + step + ' +' + Math.round(performance.now() - started) + ' ms');

        //first check config and setup
        let action = await this.configService.startCheck(this.accountField.defaultValue);
        lap('config checked');

        //App has started - first close running wallet and node server process
        let processKilled = await this.configService.killEpicProcess();
        lap('process scan');
        if(processKilled){
          //wait until the closed processes released their ports, not a fixed 5 s
          await this.configService.waitForKilledPorts();
          lap('old processes closed');
        }
        let user = await this.$userService.getUser(this.accountField.defaultValue);
        
        if(user.length && action != 'settings'){
          this.store.commit('user', user[0]);
        }else{
          //first login: open the wallet once the Setup Assistant has saved the settings
          const password = this.passwordField.defaultValue;
          this.emitter.off('setupwizard.saved');
          //the scan above still holds: the Setup Assistant starts no wallet process
          const knownNotRunning = processKilled !== false;
          this.emitter.on('setupwizard.saved', async () => {
            this.emitter.off('setupwizard.saved');
            await this.startWallet(password, knownNotRunning);
          });
          this.router.push('/setupwizard');
          return;
        }

        //the scan just ran: no owner_api is left, unless the user chose to keep the old processes
        await this.startWallet(this.passwordField.defaultValue, processKilled !== false, lap);

      }else{
        return;
      }

    },

    /* start the node and the wallet api, then log in.
       Only opening the wallet is waited for: the node check, the listeners and the first balance
       refresh run after the dashboard is shown, with their status there (App.vue). */
    async startWallet(password, knownNotRunning, lap = () => {}){

        //the node starts (or is checked) alongside, it is not waited for
        this.emitter.emit('app.nodeStart');

        let canLogin = await this.$walletService.start(password, this.configService.config['firstTime'], knownNotRunning, () => {
          lap('wallet service started');
        });
        lap('wallet opened');

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
