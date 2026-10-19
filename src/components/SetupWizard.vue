<template>


  <section class="section hero is-fullheight">
      <section class="hero">
        <div class="hero-body">
          <div class="container">
            <div class="columns is-centered">
              <div class="column is-three-quarters">
                <div class="card has-card-header-background">

                  <header class="card-header" style="justify-content: center;">
                    <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;">
                  </header>
                  <div class="card-content">
                    <h2 class="title" style="color: #d19944; text-transform: uppercase; text-align: center;">{{ $t("msg.setupwizard.setup_assistant") }}</h2>

                    <div id="stepContainerWrap">

                      <div id="stepContainer">
                        <div class="stepContainerLine"></div>

                        <div class="stepContainerLineFill" v-bind:class="{'lineFillStep2': step==='step2' || step==='step3'   }"></div>
                        <div class="stepContainerLineFill" v-bind:class="{'lineFillStep2Back': step==='step1' && moveback }"></div>

                        <div class="stepContainerLineFill" v-bind:class="{'lineFillStep3': step==='step3' || step==='step4'  }"></div>
                        <div class="stepContainerLineFill" v-bind:class="{'lineFillStep3Back': step==='step2' && moveback  }"></div>



                        <div class="circle" >
                          <svg class="circleFill" v-bind:class="{'filled': step==='step2' || step==='step3' || step==='step4' }" viewBox="0 0 30 10" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="15" cy="5" r="13" stroke="#d19944" stroke-width="2.2" fill="none"></circle>
                          </svg>
                          <svg class="circleTrack" viewBox="0 0 30 10" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="15" cy="5" r="13" stroke="#ffffff" stroke-width="2" fill="none"></circle>
                          </svg>
                          <h3>1</h3>
                        </div>

                        <div class="circle">
                          <svg class="circleFill" v-bind:class="{'filled': step==='step3' || step==='step4'  }" viewBox="0 0 30 10" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="15" cy="5" r="13" stroke="#d19944" stroke-width="2.2" fill="none"></circle>
                          </svg>
                          <svg class="circleTrack" viewBox="0 0 30 10" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="15" cy="5" r="13" stroke="#ffffff" stroke-width="2" fill="none"></circle>
                          </svg>
                          <h3>2</h3>
                        </div>

                        <div class="circle">
                          <svg class="circleFill" v-bind:class="{'filled': step==='step4' }" viewBox="0 0 30 10" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="15" cy="5" r="13" stroke="#d19944" stroke-width="2.2" fill="none"></circle>
                          </svg>
                          <svg class="circleTrack" viewBox="0 0 30 10" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="15" cy="5" r="13" stroke="#ffffff" stroke-width="2" fill="none"></circle>
                          </svg>
                          <h3>3</h3>
                        </div>


                      </div>
                    </div><!-- end stepContainerWrap -->

                    <div v-show="step==='step1'" >
                      <h2 class="title is-4" style="color: #d19944!important;margin-bottom: 24px;">{{ $t("msg.setupwizard.account_information") }}</h2>

                        <div class="field">
                          <label class="label">{{ $t("msg.wallets.label") }}</label>
                          <TextField ref="textField" fieldname="name" />
                          <p class="help">{{ $t("msg.wallets.label_hint") }}</p>
                        </div>

                        <div class="field">
                          <label class="label">{{ $t("msg.lang.lang") }}</label>
                          <div class="control">
                            <div class="select is-fullwidth">
                              <select v-model="localeSelected">
                                <option v-for="(lang, locale) in langs" :value="locale" :key="lang.id">{{lang}}</option>
                              </select>
                            </div>
                          </div>
                        </div>
                        <p>&nbsp;</p>
                        <p>&nbsp;</p>
                        <div class="buttons is-centered">

                          <button class="button is-primary" @click="backToDashbaord()"><mdicon name="arrow-left-bold-hexagon-outline" />{{ $t("msg.back") }}</button>
                          <button class="button is-primary" @click="nextStep('step2')" >{{ $t("msg.setupwizard.next_step") }}&nbsp;<mdicon size=22 name="arrow-right-circle-outline" /></button>

                        </div>

                    </div><!-- end step 1 -->


                    <div v-show="step==='step2'">

                      <h2 class="title is-4" style="color: #d19944!important;margin-bottom: 24px;">
                        {{ $t("msg.setupwizard.network_node") }}
                      </h2>
                      <article class="message is-info">
                        <div class="message-body">
                          <span v-html="$t('msg.setupwizard.network_node_txt')" ></span>

                        </div>
                      </article>
                      <NodeserverField ref="nodeserverField" />
                      <p>&nbsp;</p>
                      <p>&nbsp;</p>
                      <div class="buttons is-centered">
                          <button class="button is-primary" @click="prevStep('step1')" ><mdicon name="arrow-left-circle-outline" />&nbsp;{{ $t("msg.setupwizard.previous_step") }}</button>
                          <button class="button is-primary" :class="{'is-loading': nodeserverField.checking}" :disabled="nodeserverField.checking" @click="nextStep('step3')" >{{ $t("msg.setupwizard.next_step") }}&nbsp;<mdicon name="arrow-right-circle-outline" /></button>
                      </div>

                    </div><!-- end step 2 -->


                    <div v-show="step==='step3'">

                      <h2 class="title is-4" style="color: #d19944!important;margin-bottom: 24px;">{{ $t("msg.setupwizard.receive_transactions") }}</h2>
                      <article class="message is-info">
                        <div class="message-body">
                          <span v-html="$t('msg.setupwizard.noninteractive_transactions')" ></span>
                        </div>
                      </article>
                      <div class="field">
                        <label class="label">{{ $t("msg.setupwizard.epicbox_domain") }}</label>

                        <TextField ref="epicboxDomain" fieldname="domain" />
                        <p class="help">{{ $t("msg.setupwizard.epicbox_domain_hint") }}</p>
                      </div>
                      <EpicboxServers v-if="epicboxDomain" :domain="epicboxDomain.input || ''" :chain="configService.defaultAccountNetwork || 'mainnet'" @pick="(d) => { epicboxDomain.input = d; }" />

                      <p>&nbsp;</p>
                      <p>&nbsp;</p>
                      <div class="buttons is-centered">
                        <button class="button is-primary" @click="prevStep('step2')" ><mdicon name="arrow-left-circle-outline" />&nbsp;{{ $t("msg.setupwizard.previous_step") }}</button>
                        <button class="button is-primary" @click="nextStep('step4')" >&nbsp;{{ $t("msg.setupwizard.next_step") }}<mdicon name="arrow-right-circle-outline" /></button>
                      </div>

                    </div><!-- end step 3 -->

                    <div v-show="step==='step4'">

                      <h2 class="title is-4" style="color: #d19944!important;margin-bottom: 24px;">{{ $t("msg.setupwizard.values_correct") }}</h2>
                      <p>
                        {{ $t("msg.wallets.label") }}: {{ labelValue }}<br/>
                        {{ $t("msg.setupwizard.language") }}: {{localeSelected}}<br/>
                        {{ $t("msg.setupwizard.network_node") }}: {{this.nodeserverField.nodeInternal ? 'internal' : this.nodeserverField.defaultValue}}<br/>

                        {{ $t("msg.setupwizard.epicbox_domain") }}: {{this.epicboxDomain.defaultValue ? this.epicboxDomain.defaultValue :  $t("msg.setupwizard.epicbox_off")}}<br/>


                      </p>
                      <p>&nbsp;</p>
                      <p>&nbsp;</p>
                      <div class="buttons is-centered">
                        <button class="button is-primary" @click="prevStep('step3')" ><mdicon name="arrow-left-circle-outline" />&nbsp;{{ $t("msg.setupwizard.previous_step") }}</button>
                        <button class="button is-primary" :class="{'is-loading': isSaving}" :disabled="isSaving" @click="save" >{{ $t("msg.setupwizard.save_and_finish") }}</button>
                      </div>


                    </div><!-- end step 3 -->


                  </div><!-- card content -->
                </div>
              </div>
            </div>
          </div><!-- end container -->
        </div><!-- end hero-body -->
      </section>
    </section>
</template>
<script>

  import { ref } from 'vue';
  import NodeserverField from "@/components/form/nodeserverField";
  import TextField from "@/components/form/textField";
  import EpicboxServers from "@/components/form/EpicboxServers.vue";
  import useFormValidation from "@/modules/useFormValidation";
  import { useRouter } from '@/router';
  import { useRoute } from 'vue-router';
  import { useStore } from '@/store';
  //import "vue3-video-play/dist/style.css";
  //import { videoPlay } from "vue3-video-play";

  export default {
    name: "setup-wizard",
    components: {
      NodeserverField,
      TextField,
      EpicboxServers,
      //videoPlay,
    },
    setup(){
      const store = useStore();
      const router = useRouter();
      const route = useRoute();
      const check_node_api_http_addr = ref('');
      const network = ref('');

      const locale = ref('en');
      const localeSelected = ref('en');
      const langs = ref([]);
      const errorapi = ref(false);
      const step = ref('step1');
      const moveback = ref(false);
      const name = ref('');
      const domain = ref('');
      const epicboxDomain = ref('');

      const { resetFormErrors } = useFormValidation();
      const nodeserverField = ref('');
      const textField = ref('');
      const fromRoute = route.params.from ? route.params.from : 'login';
      const isSaving = ref(false);
      const isExistingSetup = ref(false);


      return{
        store,
        router,
        check_node_api_http_addr,
        network,
        locale,
        localeSelected,
        langs,
        errorapi,
        step,
        nodeserverField,
        resetFormErrors,
        name,
        textField,
        moveback,
        fromRoute,
        isSaving,
        isExistingSetup,
        domain,
        epicboxDomain

      }
    },

    computed: {
      //the wallet's label (optional), as typed
      labelValue(){
        return this.textField && typeof this.textField.input == 'string' ? this.textField.input.trim() : '';
      },
    },

    /* the settings editor of the wallet that is open (Classic menu, Settings › Wallet): a new
       wallet starts with the defaults, so this is never part of the first login */
    async mounted(){

      this.store.dispatch('toggleFullPage', true);
      this.store.commit('asideStateToggle', false);
      const config = this.configService.config || {};
      const wallet = this.configService.wallet || {};
      this.locale = config['locale'] || this.$i18n.locale;
      this.localeSelected = this.locale;
      this.langs = this.configService.langs;

      this.isExistingSetup = true;
      this.epicboxDomain.input = config['epicbox_domain'] ? config['epicbox_domain'] : '';
      const nodeInternal = !!(this.store.state.user && this.store.state.user.nodeInternal);
      this.nodeserverField.select = nodeInternal ? 'internal' : 'external';
      if(!nodeInternal){
        this.nodeserverField.input = config['check_node_api_http_addr'] ? config['check_node_api_http_addr'] : '';
      }
      this.textField.input = wallet.label || '';

    },
    methods: {
      validateStep(step){
        this.resetFormErrors();
        let isFormAllValid = [];
        let isValid = true;
        switch(step){

          case 'step2':
            //the label is optional
          break;
          case 'step3':
            isFormAllValid.push(this.nodeserverField.validInput());
            isValid = !isFormAllValid.includes(false);
          break;
          case 'step4':
            //set value for input field but do not error if its blank
            isFormAllValid.push(this.epicboxDomain.validInput());
            //isValid = !isFormAllValid.includes(false);
          break;


        }
        return isValid;

      },
      async nextStep(step){

        if(this.validateStep(step)){
          if(step == 'step3' && !(await this.nodeserverField.verifyNode())){
            return;
          }
          this.moveback = false;
          this.step = step;
        }
      },
      prevStep(step){
        this.moveback = true;
        this.step = step;

      },
      backToDashbaord(){
        this.emitter.emit('app.accountLoggedIn');
      },
      async save(){
        //a second click while saving would save twice
        if(this.isSaving){
          return;
        }
        this.isSaving = true;
        try{
          const walletId = this.configService.walletId;
          const label = this.labelValue;
          const nodeInternal = !!this.nodeserverField.nodeInternal;
          const epicboxDomain = this.epicboxDomain.defaultValue || '';

          //a re-run while unlocked may change the Epicbox server: see the config before the save
          const savedEpicbox = this.$walletService.token ? this.$walletService.readEpicboxConfig() : null;

          //settings.json: the wallet's settings (the toml is rendered again), the app's language, the label
          const saved = this.configService.updateConfig({
            check_node_api_http_addr: this.nodeserverField.defaultValue,
            locale: this.localeSelected,
            nodesynced: false,
            nodeInternal: nodeInternal,
            epicbox_domain: epicboxDomain,
          });
          //settings.json not written (or the toml): stay here and say so, so it can be tried again
          if(!this.configService.renameWallet(walletId, label) || !saved){
            throw new Error(this.$t('msg.settings.error_save'));
          }
          //the User row the store reads (commits store.user)
          await this.$userService.ensureUser(walletId, {
            name: label,
            language: this.localeSelected,
            nodeInternal: nodeInternal,
            epicbox_domain: epicboxDomain,
          });
          this.emitter.emit('app.selectLocale', this.localeSelected);

          await this.emitter.emit('app.nodeStart');
          //our Epicbox listener moves to a new server (App.vue, walletService.applyEpicboxChange)
          if(savedEpicbox){
            this.emitter.emit('app.applyEpicbox', {saved: savedEpicbox});
          }

          this.isSaving = false;
          this.emitter.emit('app.accountLoggedIn');

        }catch(e){
          this.isSaving = false;
          this.$toast.error(this.$t("msg.setupwizard.errors_save", [e && e.message ? e.message : String(e)]));
        }
      },

    }
  }
</script>
