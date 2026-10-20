<template>


    <section class="section is-main-section">


      <div v-show="seeds.length > 0">
        <p class="has-text-weight-semibold has-text-warning">
          {{ $t('msg.create.backupNote') }}
        </p>
        <p>&nbsp;</p>
        <div class="tags" style="justify-content: center;">
          <span style="color:#000000" class="mnemonic-word tag is-light is-medium is-rounded is-link" v-for="seed in seeds" :key="seed">{{seed}}<span class="space"> </span></span>
        </div>
        <!-- the QR code: hidden until asked for, like the balance hide/show -->
        <div style="text-align: center;">
          <button type="button" class="button is-small is-light" @click="copyPhrase"><mdicon name="content-copy" size="16" />&nbsp;{{ $t('msg.modern.unlock.phrase_copy') }}</button>
          <button type="button" class="button is-small is-light" :aria-expanded="qrShown ? 'true' : 'false'" aria-controls="seed-qr" @click="toggleQr">
            <mdicon :name="qrShown ? 'eye-off' : 'eye'" size="16" />&nbsp;{{ qrShown ? $t('msg.modern.unlock.phrase_qr_hide') : $t('msg.modern.unlock.phrase_qr') }}
          </button>
          <div v-if="qrShown" id="seed-qr"><canvas id="qrcodeCanvas" ></canvas></div>
        </div>
      </div>


      <div v-show="seeds.length == 0">

        <div class="field">
          <label class="label">{{ $t("msg.password") }}</label>
          <div class="control has-icons-right">
            <PasswordField ref="passwordField" placeholder="********" required="true" name="password" />
          </div>
        </div>

        <div class="field" >
          <div class="control">
            <button class="button is-primary" @click="start">
              {{ $t("msg.check.start") }}
            </button>
          </div>

        </div>
      </div>

    </section>

</template>

<script>

import { ref } from 'vue';
import PasswordField from "@/components/form/passwordField";
import useFormValidation from "@/modules/useFormValidation";

export default {
  name: "seed",
  components: {
    PasswordField
  },
  data() {
    return {
      //the phrase's QR code: shown only on request, hidden again on leaving the screen
      qrShown: false,
    };
  },
  //leaving the screen: the words and the QR code leave the page
  beforeUnmount() {
    this.qrShown = false;
    this.seeds = [];
    this.qrText = '';
  },
  setup() {

    const passwordField = ref('');
    const { resetFormErrors, errors } = useFormValidation();
    const seeds = ref([]);
    const vueCanvas = ref(null);
    const qrText = ref('');

    return {
      passwordField,
      resetFormErrors,
      errors,
      seeds,
      qrText
    }

  },


  methods: {
    async copyPhrase(){
      try{
        await window.clipboard.copySecret(this.seeds.join(' '));
        this.$toast.success(this.$t('msg.modern.unlock.phrase_copied'));
      }catch(e){
        this.$toast.error(e && e.message ? e.message : String(e));
      }
    },
    toggleQr(){
      this.qrShown = !this.qrShown;
      if(this.qrShown) this.$nextTick(() => this.qrcode(this.qrText));
    },
    async qrcode(text){

      this.vueCanvas = document.getElementById("qrcodeCanvas");
      if(!this.vueCanvas || !text) return;
      window.nodeQr.toCanvas(this.vueCanvas, text, function (error) {
        if (error) console.error('HttpReceive.qrcode', error)
      })
    },
    async start(){

      this.resetFormErrors();

      let isFormAllValid = [];

      isFormAllValid.push(this.passwordField.validInput());

      if(!isFormAllValid.includes(false)){
        let res = await this.$walletService.getMnemonic(this.passwordField.defaultValue);
        if(res && res.result && res.result.Ok){
          this.qrText = res.result.Ok;
          let valueChunks = res.result.Ok.split(" ").map(item => item.trim());
          this.seeds = valueChunks;
        }else{
          //the wallet can't open its seed file with this password ("Lifecycle: Error opening wallet seed
          //file"): say so under the password field, not as the raw error (QA T25)
          //no answer at all (the wallet API down or timed out) is not a wrong password
          const message = res && res.error && res.error.message ? String(res.error.message) : '';
          if(/seed file|decrypt/i.test(message)){
            this.errors.password = this.$t('msg.modern.unlock.wrong_password');
          }else{
            this.$toast.error(message || this.$t('msg.app.wallet_api_unreachable'));
          }
        }
      }

    },

  }
}
</script>
