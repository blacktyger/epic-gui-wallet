<template>

  <section class="section hero is-fullheight">
      <section class="hero">
        <div class="hero-body">

          <div v-show="page==='created'" class="container" >
            <div class="columns is-centered">
              <div class="column is-three-quarters">
                <div class="card has-card-header-background">
                  <header class="card-header" style="justify-content: center;">
                    <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;">
                  </header>
                  <div id="restoreMnemonicWords" class="card-content">
                    <h2 class="title" style="text-align: center;">{{ $t('msg.create.seedPhrase') }}</h2>
                    <p class="has-text-weight-semibold has-text-warning" style="color: #d19944!important;margin-bottom: 12px;">
                      {{ $t('msg.create.backupNote') }}
                    </p>
                    <article class="message is-warning">
                      <div class="message-body">{{ $t('msg.create.backupWarning') }}</div>
                    </article>
                    <!-- numbered, so the words are written down in order (a phrase can repeat a word) -->
                    <ol class="tags" style="justify-content: center; list-style: none; margin-left: 0;">
                      <li style="color:#000000" class="mnemonic-word tag is-light is-medium is-rounded is-link" v-for="(seed, index) in newseeds" :key="index"><small style="opacity:0.6;">{{ index + 1 }}.&nbsp;</small>{{seed}}<span class="space"> </span></li>
                    </ol>

                    <div style="text-align: center;">
                      <canvas id="qrcodeCanvas" ></canvas>
                    </div>
                    <p>&nbsp;</p>
                    <div class="buttons is-centered">
                      <router-link class="button is-primary" to="/login">
                        {{ $t("msg.create.writtenDown") }}
                      </router-link>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div v-show="page==='create'" class="container" >
            <div class="columns is-centered">
              <div class="column is-three-quarters">
                <div class="card has-card-header-background">
                  <header class="card-header" style="justify-content: center;">
                    <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;">
                  </header>
                  <div id="restoreMnemonicWords" class="card-content">
                    <h2 class="title" style="text-align: center;">{{ $t('msg.create.toNewMsg') }}</h2>


                    <div class="field">
                        <label class="label">{{ $t('msg.account.account') }}<span class="required">*</span></label>
                        <div class="control">
                          <AccountField ref="accountField" required="true" placeholder="default" />
                          <p class="help">{{ $t('msg.only_letter') }} <!----></p>
                        </div>
                    </div>

                    <div class="field">
                        <label class="label">{{ $t('msg.restore.newPassword') }}<span class="required">*</span></label>
                        <div class="control has-icons-right">
                          <PasswordField ref="passwordField" required="true" name="password"  />
                        </div>
                    </div>

                    <div class="field">
                        <label class="label">{{ $t('msg.passwordAgain') }}<span class="required">*</span></label>
                        <div class="control has-icons-right">
                          <PasswordField ref="passwordField2" required="true" :repeat="passwordField ? passwordField.input : null" name="password2"  />
                        </div>
                    </div>

                    <div class="field">
                      <div class="control">
                          <a class="icon-text" style="font-size:0.8rem;" @click="toggleAdvancedSettings" >
                            <mdicon size="18" v-if="!advancedSettings" name="menu-right" />
                            <mdicon size="18" v-else name="menu-down" />
                            {{ $t('msg.custom_settings') }}
                          </a>
                        </div>
                    </div>

                    <div class="card" v-bind:class="{'is-hidden':!advancedSettings}" >

                      <div class="card-content">
                         <div class="content">
                           <div class="field">
                              <label class="label">{{ $t('msg.restore.walletLocation') }}</label>
                              <WalletdirField ref="walletdirField" />
                          </div>
                          <div class="field">
                              <label class="label">{{ $t("msg.settings.network") }}</label>
                              <div class="control">
                                <NetworkField ref="networkField" />
                              </div>
                          </div>
                        </div>
                      </div>

                    </div>
                    <div class="buttons is-centered">
                      <router-link class="button is-primary" :to="{name: fromRoute}">
                        <mdicon name="arrow-left-bold-hexagon-outline" />
                        {{ $t("msg.back") }}
                      </router-link>
                      <button class="button is-primary" :class="{ 'button__loader': isLoading }" :aria-disabled="isLoading" @click="create" >
                        <span class="button__text">{{ $t('msg.create.newWallet') }}</span>
                      </button>
                    </div>
                    <StartupProgress v-if="isLoading && createStage" :stages="createStages" :current="createStage" />

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

import { ref, computed } from 'vue';
import { forgetLeftoverAccountData } from "@/shared/accountData";
import { useI18n } from 'vue-i18n';
import { useRouter } from '@/router';
import { useRoute } from 'vue-router';
import AccountField from "@/components/form/accountField";
import PasswordField from "@/components/form/passwordField";
import WalletdirField from "@/components/form/walletdirField";
import NetworkField from "@/components/form/networkField";
import StartupProgress from "@/components/layout/StartupProgress.vue";
import useFormValidation from "@/modules/useFormValidation";

export default {
  name: "create",

  components: {
    PasswordField,
    AccountField,
    WalletdirField,
    NetworkField,
    StartupProgress,
  },
  watch: {
    qrText: function (val) {
      this.qrcode(val);
    }
  },
  setup(){
    const router = useRouter();
    const route = useRoute();
    const page = ref('create');//ref('addSeeds');//
    const accountField = ref();
    const passwordField = ref('');
    const passwordField2 = ref('');
    const walletdirField = ref('');
    const networkField = ref('');
    const { resetFormErrors } = useFormValidation();
    const advancedSettings = ref(false);
    const newseeds = ref([]);
    const isLoading = ref(false);
    const qrText = ref('');
    const fromRoute = route.params.from ? route.params.from : 'login';
    const vueCanvas = ref(null);
    const { t } = useI18n();
    const createStage = ref('');
    const createStages = computed(() => [
      {key: 'create', label: t('msg.create.stage_create')},
      {key: 'save', label: t('msg.create.stage_save')},
    ]);



    return{
      router,
      page,
      accountField,
      passwordField,
      passwordField2,
      walletdirField,
      resetFormErrors,
      advancedSettings,
      networkField,
      fromRoute,
      isLoading,
      qrText,
      newseeds,
      createStage,
      createStages


    }
  },

  methods: {
    async forgetLeftoverAccountData(account){
      return forgetLeftoverAccountData({appConfig: this.configService.appConfig, userService: this.$userService, account});
    },
    async qrcode(text){

      this.vueCanvas = document.getElementById("qrcodeCanvas");
      window.nodeQr.toCanvas(this.vueCanvas, text, function (error) {
        if (error) console.error('HttpReceive.qrcode', error)
      })
    },
    toggleAdvancedSettings(){

      this.advancedSettings = !this.advancedSettings;
    },

    async create(){

      //running already (aria-disabled keeps the focus on the button, so guard here)
      if(this.isLoading){
        return;
      }

      this.resetFormErrors();

      let isFormAllValid = [];
      let userhomedir = '';
      //check if not exist => false
      isFormAllValid.push(this.passwordField.validInput());
      isFormAllValid.push(this.passwordField2.validInput());
      //only recover for non existing acount yet
      isFormAllValid.push(this.accountField.validInput(this.configService, true));
      isFormAllValid.push(this.walletdirField.validInput(this.configService));
      isFormAllValid.push(this.networkField.validInput());

      //we create a complete new wallet
      if(!isFormAllValid.includes(false)){

        this.isLoading = true;

        userhomedir = window.nodePath.join(this.walletdirField.defaultValue, this.accountField.defaultValue);

        if(this.accountField.defaultValue == 'default'){
          userhomedir = window.nodePath.join(this.walletdirField.defaultValue);
        }

        let walletRecoverDir = window.nodePath.join(userhomedir, this.networkField.shortName);
        const started = performance.now();
        this.createStage = 'create';
        try{
          let created = await this.$walletService.new(this.passwordField.defaultValue, this.networkField.defaultValue, walletRecoverDir);
          console.log('[create] wallet created +' + Math.round(performance.now() - started) + ' ms');
          if(created && !created.success){
            this.$toast.error(created.msg, {duration:false});
          }else{
            this.createStage = 'save';
            //a wallet of this name that was removed from the list left its settings and contacts
            //behind: the new wallet starts clean instead of taking them over
            await this.forgetLeftoverAccountData(this.accountField.defaultValue);
            //save new account settings and run a check against recoverd wallet
            if(await this.configService.updateAppConfig('account_dirs', {
                account: this.accountField.defaultValue,
                userhomedir: userhomedir,
                network: this.networkField.defaultValue,
                isdefault: this.accountField.defaultValue == 'default' ? true : false
              })){
              let action = await this.configService.startCheck(this.accountField.defaultValue);
              if(action === 'settings'){
                console.log('[create] account saved +' + Math.round(performance.now() - started) + ' ms');
                this.newseeds = created.msg.split(' ');
                this.qrText = created.msg;
                this.page = 'created'

              }else{
                this.$toast.error(this.$t('msg.create.fatal_create', [action]), {duration:false});
              }

            }else{
              this.$toast.error(this.$t('msg.create.fatal_update'), {duration:false});
            }
          }
        }catch(e){
          this.$toast.error(e && e.message ? e.message : String(e), {duration:false});
        }finally{
          this.createStage = '';
          this.isLoading = false;
        }

      }else{
        return;
      }

    },

  }
}
</script>
