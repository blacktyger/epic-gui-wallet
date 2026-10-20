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
                    <h2 class="title" style="text-align: center;">{{ $t('msg.restore.title') }} {{ $t('msg.step_of', [1,2]) }}</h2>

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
                      <button type="button" class="button is-primary" @click="back">
                        <mdicon name="arrow-left-bold-hexagon-outline" />
                        {{ $t("msg.back") }}
                      </button>
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
                    <h2 class="title" style="text-align: center;">{{ $t('msg.restore.title') }} {{ $t('msg.step_of', [2,2]) }}</h2>
                    <p class="has-text-weight-semibold has-text-warning" style="color: #d19944!important;margin-bottom: 24px;">
                      {{ $t('msg.wallets.restore_password') }}
                    </p>
                    <p v-if="networkName" class="has-text-centered"><span class="tag is-warning is-light">{{ networkName }}</span></p>

                    <div v-if="adding" class="field">
                        <label class="label" for="restoreLabel">{{ $t('msg.wallets.label') }}</label>
                        <div class="control">
                          <input id="restoreLabel" class="input" type="text" v-model="label" maxlength="32" autocomplete="off" />
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
                        <button class="button is-primary" :disabled="restoring" @click="page='addSeeds'"><mdicon name="arrow-left-bold-hexagon-outline" />{{ $t('msg.restore.change_seed') }}</button>
                        <button class="button is-primary" :class="{ 'button__loader': restoring }" :aria-disabled="restoring" @click="initR" ><span class="button__text">{{ $t('msg.restore.recover') }}</span></button>
                    </div>
                    <StartupProgress v-if="restoring && restoreCurrent" :stages="restoreAllStages" :current="restoreCurrent" />

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
  import PasswordField from "@/components/form/passwordField";
  import StartupProgress from "@/components/layout/StartupProgress.vue";
  import useFormValidation from "@/modules/useFormValidation";
  import { walletOpen, walletList, networkBadge, isLoggedIn, clearStaleUser } from '@/components/wallets';
  import { splitPhrase } from '@/shared/phraseWords';
  import { nodeLoadWarning, savedNode } from '@/shared/nodeLoad';

  const NETWORKS = ['mainnet', 'floonet', 'usernet'];

  /*
   * Restore a wallet from its recovery phrase (pasted whole, or word by word), set a password,
   * then it opens; its first scan of the chain runs as before. No name and no folder:
   * walletService.recover makes it in the app's folder and adds it to the list. Route query as
   * in Create: network, add=1 (an optional label; the wallet open now is closed first).
   */
  export default {
    name: "restore",
    mixins: [walletOpen],
    components: {
      PasswordField,
      StartupProgress,
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
      const passwordField = ref('');
      const passwordField2 = ref('');
      const { resetFormErrors } = useFormValidation();
      const fromRoute = route.params.from ? route.params.from : 'login';


      return{
        router,
        validLengths,
        length,
        slots,
        phrase,
        page,
        passwordField,
        passwordField2,
        resetFormErrors,
        fromRoute
      }
    },
    data() {
      return {
        //Settings › All wallets › Add a wallet: an optional label, prefilled "Wallet 2", "Wallet 3"…
        label: this.$route.query.add === '1' ? this.$t('msg.wallets.wallet_n', [walletList(this.configService).length + 1]) : '',
        //recovering, then opening the wallet
        restoring: false,
        //'restore' while recovering, 'lock' while the wallet open now locks
        restoreStage: '',
        //a wallet was open when the restore started: it is locked before Unlock
        locking: false,
        //the wallet just restored (settings record)
        wallet: null,
      };
    },
    computed: {
      adding(){
        return this.$route.query.add === '1';
      },
      network(){
        const n = this.$route.query.network;
        return NETWORKS.includes(n) ? n : 'mainnet';
      },
      networkName(){
        return networkBadge(this.network);
      },
      //recovering, then (a wallet is open) locking it; Unlock follows
      restoreAllStages(){
        return [{key: 'restore', label: this.$t('msg.wallets.stage_restore')},
          ...(this.locking ? [{key: 'lock', label: this.$t('msg.wallets.stage_lock')}] : [])];
      },
      restoreCurrent(){
        return this.restoreStage;
      },
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
      back(){
        if(this.adding && isLoggedIn(this.$store)){
          this.$router.push({name: 'account'});
        }else{
          this.$router.push({name: this.fromRoute});
        }
      },

      /* split pasted or typed text into words: spaces, new lines, commas; numbering like "1. word" is dropped */
      splitWords(text){
        return splitPhrase(text);
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

        //running already (aria-disabled keeps the focus on the button, so guard here)
        if(this.restoring){
          return;
        }
        this.resetFormErrors();
        const valid = [this.passwordField.validInput(), this.passwordField2.validInput()];
        if(valid.includes(false)){
          return;
        }

        if(nodeLoadWarning('restore', savedNode(this.$store.state.user, this.configService && this.configService.config))){
          this.$toast.warning(this.$t("msg.settings.node_load_warning"), {duration: 10000});
        }
        this.restoring = true;
        this.restoreStage = 'restore';
        const password = this.passwordField.defaultValue;
        const started = performance.now();
        try{
          //makes the wallet's folders, runs the recovery and adds it to the list (nothing is listed on failure)
          const recovered = await this.$walletService.recover(this.seeds.join(' '), password, this.network, {label: this.adding ? this.label.trim() : ''});
          console.log('[restore] ' + (recovered && recovered.success ? 'wallet restored' : 'failed') + ' +' + Math.round(performance.now() - started) + ' ms');
          if(!recovered || !recovered.success || !recovered.wallet){
            const detail = recovered && recovered.msg ? String(recovered.msg.message || recovered.msg) : '';
            //epic-wallet's own words (preload execRecover) in the app's language; other errors after "could not be restored"
            this.$toast.error(/Recovery word phrase is invalid/i.test(detail) ? this.$t('msg.wallets.phrase_invalid') : this.$t('msg.wallets.restore_failed') + (detail ? ' ' + detail : ''), {duration:false});
            return;
          }
          await clearStaleUser(this.$userService, recovered.wallet.id);
          this.wallet = recovered.wallet;
          //the phrase is not needed any more: drop it from the form
          this.clearup();
          //Unlock, with the restored wallet chosen (a wallet open now is locked first, as Lock does)
          this.locking = isLoggedIn(this.$store);
          if(this.locking) this.restoreStage = 'lock';
          await this.unlockAdded(this.wallet.id);
        }catch(e){
          this.$toast.error(e && e.message ? e.message : String(e), {duration:false});
          if(this.wallet){
            this.toUnlock();
          }
        }finally{
          this.restoreStage = '';
          this.locking = false;
          this.restoring = false;
        }
      },

      //restored, but it did not open: the unlock page, with this wallet chosen
      toUnlock(){
        this.$router.push({name: 'login', query: {wallet: this.wallet.id}});
      },
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
