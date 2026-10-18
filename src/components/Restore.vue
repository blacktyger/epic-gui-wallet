<template>

  <section class="section hero is-fullheight">
      <section class="hero">
        <div class="hero-body">


          <div v-if="page==='addSeeds'" class="container">
            <div class="columns is-centered">
              <div class="column is-three-quarters">
                <div class="card has-card-header-background">
                  <header class="card-header" style="justify-content: center;">
                    <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;">
                  </header>
                  <div id="restoreMnemonicWords" class="card-content">
                    <h2 class="title" style="text-align: center;">{{ $t('msg.restore.title') }} {{ $t('msg.step_of', [1,3]) }}</h2>

                    <!-- paste the whole phrase (box or first word) or type word by word -->
                    <p class="has-text-weight-semibold has-text-warning" style="margin-bottom: 16px; text-align: center; color: #d19944!important;">
                      {{ $t('msg.restore.paste_info') }}
                    </p>
                    <div class="field">
                      <label class="label" for="restorePhrase">{{ $t('msg.restore.phrase') }}</label>
                      <div class="control">
                        <textarea id="restorePhrase" class="textarea" rows="3" v-model="phrase" @input="phraseInput"
                          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                          :placeholder="$t('msg.restore.phrase_placeholder')"></textarea>
                      </div>
                    </div>

                    <div class="field is-horizontal restore-length">
                      <div class="field-label is-normal">
                        <label class="label" for="restoreLength">{{ $t('msg.restore.phrase_length') }}</label>
                      </div>
                      <div class="field-body">
                        <div class="select is-small">
                          <select id="restoreLength" v-model.number="length" @change="lengthChanged">
                            <option v-for="n in validLengths" :key="n" :value="n">{{ $t('msg.restore.n_words', [n]) }}</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <datalist id="bip39-words">
                      <option v-for="w in mnemonicWords" :key="w" :value="w"></option>
                    </datalist>
                    <ol class="restore-words">
                      <li v-for="(word, index) in slots" :key="index">
                        <label class="restore-word-number" :for="'restoreWord' + index">{{ index + 1 }}</label>
                        <input :id="'restoreWord' + index" class="input is-small" :class="{'is-danger': isInvalid(word)}"
                          :aria-invalid="isInvalid(word)" :aria-label="$t('msg.restore.word_n', [index + 1])"
                          type="text" list="bip39-words" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                          :value="word" @input="wordInput(index, $event)" @paste="wordPaste(index, $event)" @keydown.space.prevent="focusWord(index + 1)" />
                      </li>
                    </ol>

                    <p class="restore-count" role="status" aria-live="polite">
                      <span :class="{'has-text-danger': filled > length}">{{ $t('msg.restore.word_count', [filled, length]) }}</span>
                      <span v-if="invalidCount" class="has-text-danger">&nbsp;· {{ $t('msg.restore.invalid_words', [invalidCount]) }}</span>
                      <span v-else-if="filled > 0 && !validLengths.includes(filled) && filled == slots.length" class="has-text-danger">&nbsp;· {{ $t('msg.restore.bad_length') }}</span>
                    </p>

                    <div class="buttons is-centered">
                      <router-link class="button is-primary" :to="{name: fromRoute}">
                        <mdicon name="arrow-left-bold-hexagon-outline" />
                        {{ $t("msg.back") }}
                      </router-link>
                      <button :disabled="filled == 0" class="button is-primary" @click="clearup"><mdicon name="delete" />{{ $t('msg.reset') }}</button>

                      <button :disabled="!enoughSeeds" class="button is-primary" @click="page='addPassword'">
                        <mdicon name="arrow-right-bold-hexagon-outline" />{{ $t('msg.restore.added') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="page === 'addPassword'" class="container">
            <div class="columns is-centered">
              <div class="column is-three-quarters">
                <div class="card has-card-header-background">
                  <header class="card-header" style="justify-content: center;">
                    <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;">
                  </header>
                  <div id="restoreMnemonicWords" class="card-content">
                    <h2 class="title" style="text-align: center;">{{ $t('msg.restore.title') }} {{ $t('msg.step_of', [2,3]) }}</h2>
                    <p class="has-text-weight-semibold has-text-warning" style="color: #d19944!important;margin-bottom: 24px;">
                      {{ $t('msg.restore.create_new') }}
                    </p>

                    <div class="field">
                        <label class="label">{{ $t('msg.account.account') }}</label>
                        <div class="control">
                          <AccountField ref="accountField" placeholder="default" />
                          <p class="help">{{ $t('msg.account.only_letter') }} <!----></p>
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
                        <button class="button is-primary" @click="page='addSeeds'"><mdicon name="arrow-left-bold-hexagon-outline" />{{ $t('msg.restore.change_seed') }}</button>
                        <button class="button is-primary" @click="initR" >{{ $t('msg.restore.recover') }}</button>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="page==='restored'" class="container">
            <div class="columns is-centered">
              <div class="column is-three-quarters">
                <div class="card has-card-header-background">
                  <header class="card-header" style="justify-content: center;">
                    <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;">
                  </header>
                  <div id="restoreMnemonicWords" class="card-content">
                    <h2 class="title" style="text-align: center;">{{ $t('msg.restore.title') }} {{ $t('msg.step_of', [3,3]) }}</h2>
                    <p class="has-text-weight-semibold has-text-warning" style="color: #d19944!important;margin-bottom: 24px;">
                      {{ $t('msg.restore.wallet_recovered') }}
                    </p>

                    <div class="buttons is-centered">
                      <router-link class="button is-outlined is-primary" to="/login">
                        {{ $t("msg.login_") }}
                      </router-link>
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


  import { ref, computed, onMounted } from 'vue';
  import { useRouter } from '@/router';
  import { useRoute } from 'vue-router';
  import AccountField from "@/components/form/accountField";
  import PasswordField from "@/components/form/passwordField";
  import WalletdirField from "@/components/form/walletdirField";
  import NetworkField from "@/components/form/networkField";
  import useFormValidation from "@/modules/useFormValidation";

  export default {
    name: "restore",
    components: {
      PasswordField,
      AccountField,
      WalletdirField,
      NetworkField,
    },
    setup(){
      const router = useRouter();
      const route = useRoute();
      //recovery phrase lengths epic-wallet accepts (BIP39)
      const validLengths = [12, 15, 18, 21, 24];
      const length = ref(24);
      //one entry per word field, '' when empty
      const slots = ref(Array(24).fill(''));
      //the phrase box; kept in step with the word fields
      const phrase = ref('');
      const page = ref('addSeeds');//ref('addSeeds');//
      const accountField = ref();
      const passwordField = ref('');
      const passwordField2 = ref('');
      const walletdirField = ref('');
      const networkField = ref('');
      const { resetFormErrors } = useFormValidation();
      const advancedSettings = ref(false);
      const newseeds = ref([]);
      const fromRoute = route.params.from ? route.params.from : 'login';


      return{
        router,
        validLengths,
        length,
        slots,
        phrase,
        page,
        accountField,
        passwordField,
        passwordField2,
        walletdirField,
        resetFormErrors,
        advancedSettings,
        networkField,
        fromRoute
      }
    },
    computed: {
      wordSet(){
        return new Set(this.mnemonicWords);
      },
      //the words entered, in order
      seeds(){
        return this.slots.filter(w => w != '');
      },
      filled(){
        return this.seeds.length;
      },
      invalidCount(){
        return this.seeds.filter(w => !this.wordSet.has(w)).length;
      },
      enoughSeeds(){
        return this.validLengths.includes(this.length) && this.filled == this.length && this.invalidCount == 0;
      },
    },

    methods: {
      toggleAdvancedSettings(){

        this.advancedSettings = !this.advancedSettings;
      },

      /* split pasted or typed text into words: any whitespace, newlines too; numbering like "1. word" is dropped */
      splitWords(text){
        return text.toLowerCase().split(/\s+/).map(w => w.replace(/^\d+[.):]?$/, '').replace(/[^a-z]/g, '')).filter(w => w != '');
      },
      isInvalid(word){
        return word != '' && !this.wordSet.has(word);
      },
      /* fields for the phrase length, or for more words when more were entered */
      setSlots(words){
        if(this.validLengths.includes(words.length)){
          this.length = words.length;
        }
        const count = Math.max(this.length, words.length);
        this.slots = Array.from({length: count}, (_, i) => words[i] || '');
      },
      phraseInput(){
        this.setSlots(this.splitWords(this.phrase));
      },
      lengthChanged(){
        this.setSlots(this.seeds);
        this.phrase = this.seeds.join(' ');
      },
      wordInput(index, event){
        const words = this.splitWords(event.target.value);
        if(words.length > 1){
          //several words typed or dropped into one field: fill from here on
          this.fillFrom(index, words);
          return;
        }
        const slots = [...this.slots];
        slots[index] = words[0] || '';
        //keep the field showing what was typed (lower case, letters only)
        event.target.value = slots[index];
        this.slots = slots;
        this.phrase = this.seeds.join(' ');
      },
      wordPaste(index, event){
        const text = (event.clipboardData || window.clipboardData).getData('text');
        const words = this.splitWords(text);
        if(words.length > 1){
          event.preventDefault();
          this.fillFrom(index, words);
        }
      },
      fillFrom(index, words){
        const before = this.slots.slice(0, index).filter(w => w != '');
        const all = [...before, ...words];
        this.setSlots(all);
        this.phrase = all.join(' ');
        this.$nextTick(() => this.focusWord(Math.min(all.length, this.slots.length - 1)));
      },
      focusWord(index){
        const el = document.getElementById('restoreWord' + index);
        if(el){
          el.focus();
        }
      },
      clearup(){
        this.phrase = '';
        this.slots = Array(this.length).fill('');
      },

      async initR(){

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

          userhomedir = window.nodePath.join(this.walletdirField.defaultValue, this.accountField.defaultValue);

          if(this.accountField.defaultValue == 'default'){
            userhomedir = window.nodePath.join(this.walletdirField.defaultValue);
          }

          let walletRecoverDir = window.nodePath.join(userhomedir, this.networkField.shortName);

          let recovered = await this.$walletService.recover(this.seeds.join(' '), this.passwordField.defaultValue, this.networkField.defaultValue, walletRecoverDir)
          if(recovered && !recovered.success){
            this.$toast.error(recovered.msg, {duration:false});
          }else{
            //save new account settings and run a check against recoverd wallet
            if(await this.configService.updateAppConfig('account_dirs', {
                account: this.accountField.defaultValue,
                userhomedir: userhomedir,
                network: this.networkField.defaultValue,
                isdefault: this.accountField.defaultValue == 'default' ? true : false
              })){
              let action = await this.configService.startCheck(this.accountField.defaultValue);
              if(action === 'settings'){
                //this.newseeds = recovered.msg.split(' ');
                //the phrase is not needed any more: drop it from the form
                this.clearup();
                this.page = 'restored'
              }else{
                this.$toast.error(this.$t('msg.restore.recover_fail', [action]), {duration:false});
              }

            }else{
              this.$toast.error(this.$t('msg.restore.fatal_app'), {duration:false});
            }
          }

        }else{
          return;
        }


      },
      toLogin(recovered){
        this.page = 'addSeeds';
        this.clearup();
        this.emitter.emit('toLogin', recovered);
      }
    }
  }
</script>

<style scoped>
  .restore-length {
    margin-top: 0.75rem;
  }
  .restore-words {
    list-style: none;
    margin: 0.75rem 0 0.5rem;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 0.5rem 0.75rem;
  }
  .restore-words li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  /* a word not in the list: red also while focused (the dark theme's focus border would hide is-danger) */
  .restore-words input[aria-invalid="true"],
  .restore-words input[aria-invalid="true"]:focus {
    border-color: #f14668 !important;
    color: #f14668;
    box-shadow: 0 0 0 0.125em rgba(241, 70, 104, 0.25);
  }
  .restore-word-number {
    width: 1.6rem;
    text-align: right;
    font-size: 0.8rem;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
    flex: none;
  }
  .restore-count {
    text-align: center;
    margin: 0.75rem 0 1rem;
    font-variant-numeric: tabular-nums;
  }
</style>
