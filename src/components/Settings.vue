<template>


  <section class="section is-main-section" >
    <div class="columns">
      <div class="column is-half">


          <NodeserverField ref="nodeserverField" class="is-fullwidth" />
          <div class="field">

            <div class="control">
                <input :disabled="!nodeInternal" @change="changeNodeBackgroundSetting" class="switch is-success" id="walletListenSwitch" type="checkbox" v-model="node_background">
                <label for="walletListenSwitch">{{ $t("msg.settings.node_background") }}</label>
                <p class="help">{{ $t("msg.settings.node_background_hint") }}</p>
            </div>
          </div>
          <div class="field">
            <label class="label">{{ $t("msg.lang.lang") }}</label>
            <div class="control">
              <div class="select is-fullwidth">
                <select v-model="localeSelected">
                  <option v-for="(lang, value) in langs" :value="value" :key="lang.id" >{{lang}}</option>
                </select>
              </div>
            </div>
          </div>
          <div class="field">
            <label class="label" for="settingsInterface">{{ $t("msg.modern.interface") }}</label>
            <div class="control">
              <div class="select is-fullwidth">
                <select id="settingsInterface" v-model="uiSelected" @change="saveInterface">
                  <option value="modern">{{ $t("msg.modern.interface_modern") }}</option>
                  <option value="classic">{{ $t("msg.modern.interface_classic") }}</option>
                </select>
              </div>
            </div>
            <p class="help">{{ $t("msg.modern.interface_hint") }}</p>
            <p class="help" v-if="uiRestartNeeded">{{ $t("msg.modern.interface_restart") }}
              <a @click="restartUi">{{ $t("msg.modern.restart_now") }}</a></p>
          </div>
          <div class="field">
            <label class="label" for="settingsScale">{{ $t("msg.modern.scale") }}</label>
            <div class="control">
              <div class="select is-fullwidth">
                <select id="settingsScale" :value="scaleSelected" @change="saveInterfaceScale(Number($event.target.value))">
                  <option v-for="s in scales" :key="s" :value="s">{{ s }}%</option>
                </select>
              </div>
            </div>
            <p class="help">{{ $t("msg.modern.scale_hint") }}</p>
          </div>
          <div class="field"></div>
          <div class="field">
            <label class="label">{{ $t("msg.settings.epicbox_domain") }}</label>
            <div class="control">

                <input
                  class="input"
                  type="epicbox"
                  required
                  v-model="epicboxDomain" />
              <p class="help">{{ $t("msg.settings.epicbox_domain_hint") }}</p>
            </div>
          </div>
          <EpicboxServers :domain="epicboxDomain || ''" :chain="configService.defaultAccountNetwork || 'mainnet'" @pick="(d) => { epicboxDomain = d; }" />


          <div class="field">
            <label class="label">{{ $t("msg.settings.wallet_listener") }}</label>
            <div class="control">
                <input class="switch is-success" id="nodeBackgroundSync" type="checkbox" v-model="walletlisten_on_startup">
                <label for="nodeBackgroundSync">{{ $t("msg.settings.auto_start") }}</label>
            </div>
          </div>



          <div class="field">
            <div class="control">
              <p>&nbsp;</p>
              <button class="button is-primary" :class="{'is-loading': nodeserverField.checking}" :disabled="nodeserverField.checking" @click="save" >{{ $t("msg.save") }}</button>
            </div>
          </div>


      </div>
    </div>
  </section>


</template>
<script>

import { ref, onUnmounted } from 'vue';
import { useStore } from '@/store';
import NodeserverField from "@/components/form/nodeserverField";
import EpicboxServers from "@/components/form/EpicboxServers.vue";
import useFormValidation from "@/modules/useFormValidation";
import { getUi, getScheme, getScale, saveUi, saveScheme, saveScale, SCALES } from '@/shared/theme';
import { supportedLocale } from "@/shared/setupDefaults";

  export default {
    name: "settings",
    components: {
      NodeserverField,
      EpicboxServers,
    },
    setup(){

      const { resetFormErrors } = useFormValidation();
      const nodeserverField = ref('');
      const store = useStore();
      const localeSelected = ref('en');
      const epicboxDomain = ref('');
      const langs = ref([]);
      const check_node_api_http_addr = ref('');
      const walletlisten_on_startup = ref(false);
      const node_background = ref(false);
      const nodeInternal = ref(false);



      return{
        store,
        nodeserverField,
        resetFormErrors,
        localeSelected,
        epicboxDomain,
        langs,
        check_node_api_http_addr,
        walletlisten_on_startup,
        node_background,
        nodeInternal
      }
    },
    data() {
      //the interface (Modern / Classic) and the Modern colour scheme, app-wide (shared/theme.js)
      return { uiSelected: getUi(), uiSaved: getUi(), schemeSelected: getScheme(), scaleSelected: getScale(), scales: SCALES };
    },
    computed: {
      //the saved interface differs from the one running: it applies after a restart
      uiRestartNeeded() {
        return this.uiSaved !== this.store.state.ui;
      },
    },
    async created() {

      this.emitter.on('settings.nodeserverFieldChanged', () => {
        this.changeNodeBackgroundSetting();
      });
    },
    beforeUnmount(){
      this.emitter.off('settings.nodeserverFieldChanged');
    },
    mounted(){
      this.nodeInternal = this.store.state.user.nodeInternal;
      this.nodeserverField.select = !this.store.state.user.nodeInternal ? 'external' : 'internal';

      this.langs = this.configService.langs;
      //a language an old GUI saved that is no longer offered (ru, zh) shows as English, not blank
      this.localeSelected = supportedLocale(this.configService.config['locale'], this.langs);
      this.epicboxDomain = this.configService.config['epicbox_domain'];
      this.walletlisten_on_startup = this.configService.config['walletlisten_on_startup'];
      this.node_background = this.configService.config['node_background'];



      //an internal user's address is the local node's: leave it empty so external gets the default
      if(!this.nodeInternal){
        this.nodeserverField.input = this.configService.config['check_node_api_http_addr'];
      }
    },

    methods: {
      saveInterface(){
        if(saveUi(this.uiSelected)){
          this.uiSaved = this.uiSelected;
        }else{
          this.$toast.error(this.$t("msg.settings.error_save"));
        }
      },
      //lock the wallet and open the window again with the saved interface
      restartUi(){
        this.emitter.emit('app.reloadUi');
      },
      //text and control size, applied at once (shared/theme.js)
      saveInterfaceScale(scale){
        this.scaleSelected = scale;
        if(!saveScale(scale)){
          this.$toast.error(this.$t("msg.settings.error_save"));
        }
      },
      saveColourScheme(scheme){
        this.schemeSelected = scheme;
        saveScheme(scheme);
        this.store.commit('scheme', scheme);
      },
      changeNodeBackgroundSetting(){
        console.log('changeNodeBackgroundSetting', this.nodeserverField.select);
        if(this.nodeserverField.select == 'external'){
          this.nodeInternal = false;
          this.node_background = false;
        }else{
          this.nodeInternal = true;
        }

      },



      async save(){

        this.resetFormErrors();
        let isFormAllValid = [];

        isFormAllValid.push(this.nodeserverField.validInput());
        if(!isFormAllValid.includes(false)){
          isFormAllValid.push(await this.nodeserverField.verifyNode());
        }

        if(!isFormAllValid.includes(false)){

          //the Epicbox config the wallet uses until now, to see what the save changes
          const savedEpicbox = this.$walletService.readEpicboxConfig();

          const nodeInternal = this.nodeserverField.select != 'external';
          const epicboxDomain = this.epicboxDomain.trim();
          let updated = false;
          try{
            //the wallet's settings (and the app's language) in settings.json; the toml is rendered again
            updated = this.configService.updateConfig({
              check_node_api_http_addr: this.nodeserverField.defaultValue.trim(),
              locale: this.localeSelected,
              walletlisten_on_startup: this.walletlisten_on_startup,
              node_background: this.node_background,
              epicbox_domain: epicboxDomain,
              nodeInternal: nodeInternal,
            }) !== false;
            //the User row the store reads (nodeInternal, Epicbox)
            const wallet = this.configService.wallet || {};
            await this.$userService.ensureUser(this.configService.walletId, {
              name: wallet.label || '',
              language: this.localeSelected,
              nodeInternal: nodeInternal,
              epicbox_domain: epicboxDomain,
            });
          }catch(e){
            console.log('[settings] not saved: ' + (e && e.message ? e.message : e));
            updated = false;
          }

          /*todo simple node restart user update wallet restart here*/
          if(updated){
            this.store.commit('nodeType', this.nodeserverField.select);
            this.$toast.success(this.$t("msg.settings.settings_saved"));
            this.emitter.emit('app.nodeStart');
            this.emitter.emit('app.selectLocale', this.localeSelected);
            //a new Epicbox server: our listener moves to it (App.vue, walletService.applyEpicboxChange)
            if(this.$walletService.token){
              this.emitter.emit('app.applyEpicbox', {saved: savedEpicbox});
            }

          }else{
            this.$toast.error(this.$t("msg.settings.error_save"));
          }



        }else{
          return;
        }

      },

    }
  }
</script>
