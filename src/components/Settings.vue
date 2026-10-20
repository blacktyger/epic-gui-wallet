<template>


  <section class="section is-main-section" >
    <div class="columns">
      <div class="column is-half">


          <NodeserverField ref="nodeserverField" class="is-fullwidth" />
          <!-- the built-in node uses chain data of an older app (Use this data, or the found screen) -->
          <div v-if="chainDirInUse" class="field chain-in-use">
            <p class="label" id="chainInUseLabel">{{ $t('msg.chaindata.in_use_label') }}</p>
            <p class="is-family-monospace chain-offer-dir" translate="no">{{ chainDirInUse }}</p>
            <p class="help">{{ $t('msg.chaindata.in_use_hint') }}</p>
            <button v-if="!chainResetAsk" ref="chainResetButton" type="button" class="button is-small" :disabled="saving" aria-describedby="chainInUseLabel" @click="askChainReset">{{ $t('msg.chaindata.reset') }}</button>
            <div v-else class="chain-reset-ask" role="group" aria-labelledby="chainResetText">
              <p id="chainResetText" class="help">{{ $t('msg.chaindata.reset_confirm') }}</p>
              <div class="buttons">
                <button type="button" class="button is-small" :disabled="saving" @click="cancelChainReset">{{ $t('msg.cancel') }}</button>
                <button ref="chainResetGo" type="button" class="button is-small is-warning" :disabled="saving" @click="resetChainData">{{ $t('msg.chaindata.reset_go') }}</button>
              </div>
            </div>
          </div>
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
              <button ref="saveButton" class="button is-primary" :class="{'is-loading': nodeserverField.checking || chainChecking}" :disabled="nodeserverField.checking || saving" @click="save" >{{ $t("msg.save") }}</button>
              <!-- always rendered, so the text change is announced -->
              <p class="help" role="status">{{ chainChecking ? $t('msg.chaindata.checking') : '' }}</p>
            </div>
          </div>


      </div>
    </div>
    <!-- the built-in node switched on: older chain data found, asked once (shared/chainOffer.js) -->
    <!-- a native modal <dialog> (as RemoveWalletDialog): the page behind is inert, focus stays inside;
         Esc and the backdrop close it without an answer, as in Modern (EDialog) -->
    <dialog ref="chainOfferDlg" class="chain-offer-dlg" aria-labelledby="chainOfferTitle" aria-describedby="chainOfferLead" @cancel.prevent="answerChainOffer('cancel')" @click="onChainOfferBackdrop">
      <div v-if="chainOffer" class="modal-card chain-offer">
        <header class="modal-card-head"><p id="chainOfferTitle" class="modal-card-title">{{ $t('msg.chaindata.offer_title') }}</p></header>
        <section class="modal-card-body content">
          <p id="chainOfferLead">{{ $t('msg.chaindata.offer_lead') }}</p>
          <dl class="chain-offer-facts">
            <dt>{{ $t('msg.chaindata.offer_folder') }}</dt><dd class="is-family-monospace chain-offer-dir" translate="no">{{ chainOffer.chain.dir }}</dd>
            <dt>{{ $t('msg.chaindata.offer_size') }}</dt><dd>{{ chainOfferSize }}</dd>
            <template v-if="chainOfferDate"><dt>{{ $t('msg.chaindata.offer_modified') }}</dt><dd>{{ chainOfferDate }}</dd></template>
          </dl>
          <p v-if="chainOffer.others">{{ $t('msg.chaindata.offer_others', [chainOffer.others]) }}</p>
          <!-- another node is running on it (shared/folderLock.js): not usable now, asked again later -->
          <p v-if="chainOffer.inUse" class="notification is-warning is-light" role="status"><strong>{{ $t('msg.chaindata.offer_in_use') }}</strong></p>
          <p v-else><strong>{{ $t('msg.chaindata.offer_question') }}</strong></p>
          <p class="is-size-7 has-text-grey">{{ $t('msg.chaindata.offer_older_app') }}</p>
        </section>
        <footer class="modal-card-foot chain-offer-foot">
          <button type="button" class="button" @click="answerChainOffer('declined')">{{ $t('msg.chaindata.offer_fresh') }}</button>
          <button v-if="chainOffer.inUse" ref="chainOfferClose" type="button" class="button" @click="answerChainOffer('cancel')">{{ $t('msg.close') }}</button>
          <button ref="chainOfferUse" type="button" class="button is-primary" :disabled="chainOffer.inUse" @click="answerChainOffer('used')">{{ $t('msg.chaindata.offer_use') }}</button>
        </footer>
      </div>
    </dialog>
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
import { shouldCheck, pickOffer, offerRecord } from "@/shared/chainOffer";
import { formatBytes, formatDate } from "@/components/wallets";

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
      //chainOffer: the chain data offered ({chain, others}, shared/chainOffer.js pickOffer) while asked
      return { uiSelected: getUi(), uiSaved: getUi(), schemeSelected: getScheme(), scaleSelected: getScale(), scales: SCALES,
        chainChecking: false, chainOffer: null, chainOfferResolve: null,
        //saving: a save runs (scan and prompt included); Save and Download again do nothing meanwhile
        //chainDirInUse: the older chain folder the built-in node uses (settings nodeChainDir), or ''
        saving: false, chainDirInUse: '', chainResetAsk: false };
    },
    computed: {
      chainOfferSize() {
        return this.chainOffer ? formatBytes(this.chainOffer.chain.bytes) : '';
      },
      chainOfferDate() {
        return this.chainOffer ? formatDate(this.chainOffer.chain.modified, this.$i18n.locale) : '';
      },
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
    watch: {
      //the Classic prompt; Modern's template has its own (EDialog)
      chainOffer(v){
        const d = this.$refs.chainOfferDlg;
        if (!d) return;
        if (v && !d.open && d.showModal) d.showModal();
        if (!v && d.open) d.close();
      },
    },
    beforeUnmount(){
      this.emitter.off('settings.nodeserverFieldChanged');
      //Settings left during the scan or the prompt: the save stops, nothing is saved
      this.leaving = true;
      this.answerChainOffer('cancel');
      const d = this.$refs.chainOfferDlg;
      if (d && d.open) d.close();
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
      this.readChainDirInUse();



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



      /*
       * The built-in node is about to be used: once per network, while it has no chain data of its
       * own, offer older chain data found on this machine (Use this data / Download fresh). The answer
       * is kept in settings.json; 'used' sets the node's chain folder before its toml is written.
       * false: the prompt was closed without an answer, so nothing is saved.
       */
      async offerChainData(){
        const cs = this.configService;
        const network = cs.defaultAccountNetwork;
        let own = true;
        try {
          own = cs.fs.existsSync(cs.path.join(cs.nodeDir(network), 'chain_data', 'lmdb'));
        } catch (e) { /* unknown: don't ask */ }
        let ask = false;
        try { ask = shouldCheck(cs.settings, network, own); } catch (e) { ask = false; }
        if (!ask) return true;

        this.chainChecking = true;
        let chains = null;
        try {
          chains = await this.$importer.scanChains();
        } finally {
          if (!this.leaving) this.chainChecking = false;
        }
        if (this.leaving) return false;
        //the scan failed: nothing is kept, so it runs again at the next save
        if (!chains) return true;
        const offer = pickOffer(chains, network);
        if (!offer) {
          cs.settings.setChainOffer(network, offerRecord('none'));
          return true;
        }
        //the folder offered is in use by another node: 'used' can't be the answer (the button is off)
        const answer = await new Promise((resolve) => {
          this.chainOfferResolve = resolve;
          this.chainOffer = offer;
          this.$nextTick(() => {
            const b = offer.inUse ? this.$refs.chainOfferClose : this.$refs.chainOfferUse;
            if (b) b.focus();
          });
        });
        this.chainOfferResolve = null;
        if (this.leaving) return false;
        this.chainOffer = null;
        if (this.$refs.saveButton) this.$refs.saveButton.focus();
        if (answer === 'cancel') {
          this.$toast.show(this.$t('msg.chaindata.offer_cancelled'));
          return false;
        }
        //not saved: nothing changed (settingsStore.setChainOffer), so the node keeps its own folder
        if (!cs.settings.setChainOffer(network, offerRecord(answer, offer.chain.dir)) && answer === 'used') {
          this.$toast.error(this.$t('msg.chaindata.offer_not_saved'));
        }
        this.readChainDirInUse();
        return true;
      },
      answerChainOffer(answer){
        if (answer === 'used' && this.chainOffer && this.chainOffer.inUse) return;
        if (this.chainOfferResolve) this.chainOfferResolve(answer);
      },
      onChainOfferBackdrop(e){
        //a click on the backdrop lands on the <dialog> element itself
        if (e.target === this.$refs.chainOfferDlg) this.answerChainOffer('cancel');
      },

      readChainDirInUse(){
        try {
          this.chainDirInUse = this.configService.settings.nodeChainDir(this.configService.defaultAccountNetwork) || '';
        } catch (e) {
          this.chainDirInUse = '';
        }
      },
      askChainReset(){
        this.chainResetAsk = true;
        this.$nextTick(() => { if (this.$refs.chainResetGo) this.$refs.chainResetGo.focus(); });
      },
      cancelChainReset(){
        this.chainResetAsk = false;
        this.$nextTick(() => { if (this.$refs.chainResetButton) this.$refs.chainResetButton.focus(); });
      },
      /*
       * Download the blockchain again: the built-in node goes back to its own folder
       * (<root>/node/<net>/chain_data), the offer is not made again (settingsStore.forgetChainDir),
       * and a built-in node in use restarts with it (App.vue app.restartNode: stop, then start).
       * The older folder is never deleted: it belongs to the older app (or the user's own node).
       */
      resetChainData(){
        if (this.saving) return;
        const cs = this.configService;
        const dir = this.chainDirInUse;
        if (!cs.settings.forgetChainDir(cs.defaultAccountNetwork)) {
          this.$toast.error(this.$t('msg.chaindata.reset_failed'));
          return;
        }
        this.chainResetAsk = false;
        this.readChainDirInUse();
        //the toml with the node's own db_root (nodeStart writes it again too)
        cs.startCheckNode();
        this.$toast.success(this.$t('msg.chaindata.reset_done', [dir]));
        if (this.store.state.user.nodeInternal) this.emitter.emit('app.restartNode');
        this.$nextTick(() => { if (this.$refs.saveButton) this.$refs.saveButton.focus(); });
      },

      /* false: nothing was saved (the chain data prompt was closed, Settings left, or a save runs) */
      async save(){
        if (this.saving) return false;
        this.saving = true;
        try {
          return await this.saveForm();
        } finally {
          this.saving = false;
        }
      },
      async saveForm(){

        this.resetFormErrors();
        let isFormAllValid = [];

        isFormAllValid.push(this.nodeserverField.validInput());
        if(!isFormAllValid.includes(false)){
          isFormAllValid.push(await this.nodeserverField.verifyNode());
        }

        if(!isFormAllValid.includes(false)){

          //the Epicbox config the wallet uses until now, to see what the save changes
          const savedEpicbox = this.$walletService.readEpicboxConfig();

          //the form as it is now, read once: a change during the scan or the prompt isn't mixed in
          const nodeType = this.nodeserverField.select;
          const nodeInternal = nodeType != 'external';
          const form = {
            check_node_api_http_addr: String(this.nodeserverField.defaultValue || '').trim(),
            locale: this.localeSelected,
            walletlisten_on_startup: this.walletlisten_on_startup,
            node_background: this.node_background,
            epicbox_domain: String(this.epicboxDomain || '').trim(),
            nodeInternal: nodeInternal,
          };
          //before the node's toml is written: it may get an older chain folder (db_root)
          if(nodeInternal && !(await this.offerChainData())){
            return false;
          }
          const epicboxDomain = form.epicbox_domain;
          let updated = false;
          try{
            //the wallet's settings (and the app's language) in settings.json; the toml is rendered again
            updated = this.configService.updateConfig(form) !== false;
            //the User row the store reads (nodeInternal, Epicbox)
            const wallet = this.configService.wallet || {};
            await this.$userService.ensureUser(this.configService.walletId, {
              name: wallet.label || '',
              language: form.locale,
              nodeInternal: nodeInternal,
              epicbox_domain: epicboxDomain,
            });
          }catch(e){
            console.log('[settings] not saved: ' + (e && e.message ? e.message : e));
            updated = false;
          }

          /*todo simple node restart user update wallet restart here*/
          if(updated){
            this.store.commit('nodeType', nodeType);
            this.$toast.success(this.$t("msg.settings.settings_saved"));
            this.emitter.emit('app.nodeStart');
            this.emitter.emit('app.selectLocale', form.locale);
            //a new Epicbox server: our listener moves to it (App.vue, walletService.applyEpicboxChange)
            if(this.$walletService.token){
              this.emitter.emit('app.applyEpicbox', {saved: savedEpicbox});
            }

          }else{
            this.$toast.error(this.$t("msg.settings.error_save"));
          }
          return updated;

        }else{
          return false;
        }

      },

    }
  }
</script>

<style scoped>
  .chain-offer-dlg { padding: 0; border: 0; background: transparent; width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: visible; }
  .chain-offer-dlg::backdrop { background: rgba(10, 10, 10, 0.86); }
  .chain-offer { width: 100%; max-height: calc(100vh - 32px); margin: 0; }
  .chain-in-use .chain-offer-dir { margin-bottom: 0.25rem; }
  .chain-reset-ask .buttons { margin-top: 0.5rem; }
  .chain-offer-facts { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; margin: 0.75rem 0; }
  .chain-offer-facts dt { font-weight: 600; }
  .chain-offer-facts dd { margin: 0; min-width: 0; }
  .chain-offer-dir { overflow-wrap: anywhere; user-select: text; font-size: 0.85rem; }
  .chain-offer-foot { justify-content: flex-end; flex-wrap: wrap; gap: 0.5rem; }
  .chain-offer-foot .button { margin: 0; }
</style>
