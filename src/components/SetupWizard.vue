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
                          <label class="label">{{ $t("msg.setupwizard.your_name") }}<span class="required">*</span></label>
                          <TextField ref="textField" fieldname="name" />
                          <p class="help">{{ $t("msg.setupwizard.name_only_internal") }}</p>
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

                          <button v-if="fromRoute == 'navbar'" class="button is-primary" @click="backToDashbaord()"><mdicon name="arrow-left-bold-hexagon-outline" />{{ $t("msg.back") }}</button>
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
                        {{ $t("msg.setupwizard.name") }}: {{this.textField.defaultValue}}<br/>
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
                      <StartupProgress v-if="isSaving && store.state.loginStage" :stages="openStages" :current="store.state.loginStage" />


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

  import { ref, reactive, onUnmounted, computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import NodeserverField from "@/components/form/nodeserverField";
  import TextField from "@/components/form/textField";
  import StartupProgress from "@/components/layout/StartupProgress.vue";
  import { supportedLocale, initialNodeChoice, initialEpicboxDomain } from "@/shared/setupDefaults";
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
      StartupProgress,
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
      const { t } = useI18n();
      //first login: after saving, the login page opens the wallet (loginStage in the store)
      const openStages = computed(() => [
        {key: 'wallet', label: t('msg.login.stage_wallet')},
        {key: 'unlock', label: t('msg.login.stage_unlock')},
      ]);


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
        openStages,
        domain,
        epicboxDomain

      }
    },

    async mounted(){

      let user = await this.$userService.getUser(this.configService.configAccount);

      this.store.dispatch('toggleFullPage', true);
      this.store.commit('asideStateToggle', false);
      const config = this.configService.config;
      this.langs = this.configService.langs;
      //a language an old GUI saved that is no longer offered (ru, zh): English, not a blank list
      this.locale = supportedLocale(config['locale'], this.langs);
      this.localeSelected = this.locale;

      //an existing setup opens with its saved values, a first run with the defaults. A config left
      //by an older GUI counts as existing too: its node address and Epicbox domain are kept
      this.isExistingSetup = !!(user && user[0] && !config['firstTime']);
      const node = initialNodeChoice({
        user: user && user[0],
        address: config['firstTime'] ? '' : config['check_node_api_http_addr'],
      });
      this.nodeserverField.select = node.select;
      if(node.select == 'external'){
        this.nodeserverField.input = node.input;
      }
      this.epicboxDomain.input = config['firstTime']
        ? this.configService.epicboxDomain
        : initialEpicboxDomain({config, defaultDomain: this.configService.epicboxDomain});

      if(user && user[0]){
        this.textField.input = user[0].name ? user[0].name : '';
      }

    },
    methods: {
      validateStep(step){
        this.resetFormErrors();
        let isFormAllValid = [];
        let isValid = true;
        switch(step){

          case 'step2':
            isFormAllValid.push(this.textField.validInput('name'));
            isValid = !isFormAllValid.includes(false);
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
        //a second click while saving would save twice and log in twice
        if(this.isSaving){
          return;
        }
        this.isSaving = true;
        try{

          let user = await this.$userService.getUser(this.configService.configAccount);


          if(user.length){
            await this.$userService.updateUserByAccount(this.configService.configAccount, {
              account: this.configService.configAccount,
              name: this.textField.defaultValue,
              language: this.localeSelected,
              nodeInternal: this.nodeserverField.nodeInternal,
              epicbox_domain: this.epicboxDomain.defaultValue,
            });
            user = await this.$userService.getUser(this.configService.configAccount);

          }else{

            let inserted = await this.$userService.addUser({
              account: this.configService.configAccount,
              name: this.textField.defaultValue,
              ngrok: '', //column is NOT NULL in the user table
              language: this.localeSelected,
              nodeInternal: this.nodeserverField.nodeInternal,
              email: '',
              epicbox_domain: this.epicboxDomain.defaultValue,
            });
            if(inserted.length){
              user = inserted;
            }else{
              this.$toast.error(this.$t("msg.setupwizard.db_fatal"));
              this.isSaving = false;
              return;
            }


          }


          this.configService.updateConfig({
            version: this.configService.configVersion,
            check_node_api_http_addr: this.nodeserverField.defaultValue,
            locale: this.localeSelected,
            firstTime: false,
            //first run only: a re-run keeps the listener and background settings
            ...(this.isExistingSetup ? {} : {
              walletlisten_on_startup: true,
              node_background: false,
              epicbox_background: false,
            }),
            nodesynced: false,
            epicbox_domain: this.epicboxDomain.defaultValue,

          });

          this.configService.checkTomlFile();
          this.store.commit('user', user[0]);

          const loginWaits = this.emitter.all.get('setupwizard.saved');
          if(this.fromRoute != 'navbar' && loginWaits && loginWaits.length){
            //first login: the login page starts the node and the wallet api (isSaving stays on)
            this.emitter.emit('setupwizard.saved');
            return;
          }

          console.log('start node before wallet listener');
          await this.emitter.emit('app.nodeStart');

          this.isSaving = false;
          this.emitter.emit('app.accountLoggedIn');


        }catch(e){
          this.isSaving = false;
          this.$toast.error(this.$t("msg.setupwizard.errors_save", [e.message]));
          return
        }

      },

    }
  }
</script>
