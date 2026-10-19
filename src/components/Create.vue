<template>

  <section class="section hero is-fullheight">
      <section class="hero">
        <div class="hero-body">

          <div v-show="page==='created'" class="container" >
            <div class="columns is-centered">
              <div class="column is-three-quarters">
                <div class="card has-card-header-background">
                  <header class="card-header" style="justify-content: center;">
                    <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;" alt="Epic Cash">
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
                      <button type="button" class="button is-primary" :class="{ 'button__loader': opening }" :aria-disabled="opening" @click="openNewWallet">
                        <span class="button__text">{{ $t("msg.wallets.open_my_wallet") }}</span>
                      </button>
                    </div>
                    <StartupProgress v-if="opening && $store.state.loginStage" :stages="stages" :current="$store.state.loginStage" />
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
                    <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;" alt="Epic Cash">
                  </header>
                  <div id="restoreMnemonicWords" class="card-content">
                    <h2 class="title" style="text-align: center;">{{ $t('msg.create.toNewMsg') }}</h2>
                    <p v-if="networkName" class="has-text-centered"><span class="tag is-warning is-light">{{ networkName }}</span></p>

                    <div v-if="adding" class="field">
                        <label class="label" for="createLabel">{{ $t('msg.wallets.label') }}</label>
                        <div class="control">
                          <input id="createLabel" class="input" type="text" v-model="label" maxlength="32" autocomplete="off" />
                          <p class="help">{{ $t('msg.wallets.label_hint') }}</p>
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

                    <div class="buttons is-centered">
                      <button type="button" class="button is-primary" @click="back">
                        <mdicon name="arrow-left-bold-hexagon-outline" />
                        {{ $t("msg.back") }}
                      </button>
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
import { useI18n } from 'vue-i18n';
import { useRouter } from '@/router';
import { useRoute } from 'vue-router';
import PasswordField from "@/components/form/passwordField";
import StartupProgress from "@/components/layout/StartupProgress.vue";
import useFormValidation from "@/modules/useFormValidation";
import { walletOpen, walletList, networkBadge, isLoggedIn } from '@/components/wallets';

const NETWORKS = ['mainnet', 'floonet', 'usernet'];

/*
 * A new wallet: a password (twice), then its recovery phrase, then it opens with that password.
 * No name and no folder: walletService.new makes it in the app's folder and adds it to the list.
 * Route query: network (from Welcome › Advanced), add=1 (Settings › Add another wallet: an
 * optional label, and the wallet that is open is closed before the new one opens).
 */
export default {
  name: "create",
  mixins: [walletOpen],

  components: {
    PasswordField,
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
    const page = ref('create');
    const passwordField = ref('');
    const passwordField2 = ref('');
    const { resetFormErrors } = useFormValidation();
    const newseeds = ref([]);
    const isLoading = ref(false);
    const qrText = ref('');
    const fromRoute = route.params.from ? route.params.from : 'login';
    const { t } = useI18n();
    const createStage = ref('');
    const createStages = computed(() => [
      {key: 'create', label: t('msg.create.stage_create')},
      {key: 'save', label: t('msg.create.stage_save')},
    ]);

    return{
      router,
      page,
      passwordField,
      passwordField2,
      resetFormErrors,
      fromRoute,
      isLoading,
      qrText,
      newseeds,
      createStage,
      createStages
    }
  },
  data() {
    return {
      //Settings › Add another wallet: an optional label, prefilled "Wallet 2", "Wallet 3"…
      label: this.$route.query.add === '1' ? this.$t('msg.wallets.wallet_n', [walletList(this.configService).length + 1]) : '',
      //the wallet just made (settings record)
      wallet: null,
      //opening it after the phrase
      opening: false,
    };
  },
  computed: {
    adding() {
      return this.$route.query.add === '1';
    },
    network() {
      const n = this.$route.query.network;
      return NETWORKS.includes(n) ? n : 'mainnet';
    },
    networkName() {
      return networkBadge(this.network);
    },
  },

  methods: {
    async qrcode(text){
      const canvas = document.getElementById("qrcodeCanvas");
      window.nodeQr.toCanvas(canvas, text, function (error) {
        if (error) console.error('Create.qrcode', error)
      })
    },

    back(){
      if(this.adding && isLoggedIn(this.$store)){
        this.$router.push({name: 'account'});
      }else{
        this.$router.push({name: this.fromRoute});
      }
    },

    async create(){

      //running already (aria-disabled keeps the focus on the button, so guard here)
      if(this.isLoading){
        return;
      }

      this.resetFormErrors();
      const valid = [this.passwordField.validInput(), this.passwordField2.validInput()];
      if(valid.includes(false)){
        return;
      }

      this.isLoading = true;
      const started = performance.now();
      this.createStage = 'create';
      try{
        //makes the wallet's folders, runs init and adds it to the list (nothing is listed on failure)
        const created = await this.$walletService.new(this.passwordField.defaultValue, this.network, {label: this.adding ? this.label.trim() : ''});
        console.log('[create] ' + (created && created.success ? 'wallet created' : 'failed') + ' +' + Math.round(performance.now() - started) + ' ms');
        if(!created || !created.success || !created.wallet){
          this.$toast.error(created && created.msg ? String(created.msg.message || created.msg) : this.$t('msg.wallets.create_failed'), {duration:false});
        }else{
          this.createStage = 'save';
          this.wallet = created.wallet;
          this.newseeds = String(created.msg).split(' ');
          this.qrText = String(created.msg);
          this.page = 'created';
        }
      }catch(e){
        this.$toast.error(e && e.message ? e.message : String(e), {duration:false});
      }finally{
        this.createStage = '';
        this.isLoading = false;
      }
    },

    /* the phrase is written down: open the new wallet with the password just chosen */
    async openNewWallet(){
      if(this.opening || !this.wallet){
        return;
      }
      this.opening = true;
      try{
        //Add another wallet: the wallet open now is closed first, as Lock does
        await this.logoutCurrent();
        const result = await this.openWallet(this.wallet.id, this.passwordField.defaultValue);
        if(result !== 'opened'){
          this.toUnlock();
        }
      }catch(e){
        this.$toast.error(e && e.message ? e.message : String(e));
        this.toUnlock();
      }finally{
        this.$store.commit('loginStage', '');
        this.opening = false;
      }
    },

    //it did not open: the unlock page, with this wallet chosen
    toUnlock(){
      this.$router.push({name: 'login', query: {wallet: this.wallet.id}});
    },
  }
}
</script>
