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
                      <button type="submit" class="button is-primary" :class="{ 'button__loader': isLoading }" @click.prevent="login">
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
        let istrue = false;
        //first check config and setup
        let action = await this.configService.startCheck(this.accountField.defaultValue);

        //App has started - first close running wallet and node server process
        let processKilled = await this.configService.killEpicProcess();
        let user = await this.$userService.getUser(this.accountField.defaultValue);
        
        if(user.length && action != 'settings'){
          this.store.commit('user', user[0]);
        }else{
          //first login: open the wallet once the Setup Assistant has saved the settings
          const password = this.passwordField.defaultValue;
          this.emitter.off('setupwizard.saved');
          this.emitter.on('setupwizard.saved', async () => {
            this.emitter.off('setupwizard.saved');
            await this.startWallet(password, false);
          });
          this.router.push('/setupwizard');
          return;
        }
       
        await this.startWallet(this.passwordField.defaultValue, processKilled);

      }else{
        return;
      }

    },

    /* start the node and the wallet api, then log in */
    async startWallet(password, processKilled){

       if(processKilled) {
         await new Promise(resolve => setTimeout(resolve, 5000));
       }
       await this.emitter.emit('app.nodeStart');
       
        let canLogin = await this.$walletService.start(password, this.configService.config['firstTime']);
        
        if(canLogin.success){

          //load user account settings first
          
          window.debug ? console.log('LOGIN USER:', this.store.state.user) : null;
          if(this.configService.config['walletlisten_on_startup']){
            const isListen = await this.$walletService.startListen(password, true, 'http');
            //start epicbox, will be executed when node has synced status
            if(this.configService.config['epicbox_domain'] != undefined && this.configService.config['epicbox_domain'] != '' ){
              
              await this.emitter.emit('app.startEpicbox', password);
             
            }

            //the wallet listener started
            /*if(isListen && isListen.success){
              this.$toast.success(this.$t("msg.login.listener_started"));
            }else{
              this.$toast.error(this.$t("msg.login.error_listener_started"));
              this.store.commit('walletListenerService', false);
            }*/

            if(isListen && isListen.tor){
              this.$toast.success(i18n.global.t("msg.login.tor_started"));
              this.store.commit('torService', true);
            }else{
              this.$toast.error(i18n.global.t("msg.login.error_tor_started"));
              this.store.commit('torService', false);
            }

          }




          this.isLoading = false;
          this.emitter.emit('app.accountLoggedIn');

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
