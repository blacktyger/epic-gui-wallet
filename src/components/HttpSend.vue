<template>


    <section class="section is-main-section">
      <div class="columns">
        <div class="column is-half">

          <div>

            <div class="field has-addons">
              <div class="control is-expanded">
                <AddressField @keyup="keyEvent" ref="addressField" />
              </div>
              <div class="control">
                  <button ref="pickerBtn" type="button" class="button has-icon" :title="$t('msg.contacts.picker_open')" :aria-label="$t('msg.contacts.picker_open')" aria-haspopup="dialog" @click="openPicker">
                    <span class="icon"><mdicon name="account-box-multiple-outline" /></span>
                  </button>
              </div>
            </div>
            <ContactPickerModal :open="pickerOpen" :contacts="pickerContacts" :avatars="pickerAvatars" :loading="pickerLoading" @pick="pickContact" @close="closePicker" />

            <div v-if="foundAddress.length" class="control is-expanded addresssearch" style="margin-top:-1.2rem">
              <div class="dropdown" v-bind:class="{'is-active': foundAddress.length}">
                <div class="dropdown-trigger"></div>
                <div className="dropdown-menu" id="dropdown-menu" role="menu">
                  <div v-for="address in foundAddress" :key="address.id" class="dropdown-content">

                    <a v-if="address.externalOne" @click="fillAddressField(address, 'externalOne')" class="dropdown-item" data-address-id="{{address.id}}">
                      {{ address.name }} - EPICBOX <span class="paste-address">{{ address.externalOne }}</span>
                    </a>

                    <a v-if="address.externalTwo" @click="fillAddressField(address, 'externalTwo')" class="dropdown-item" data-address-id="{{address.id}}">
                      {{ address.name }} - HTTP <span class="paste-address">{{ address.externalTwo }}</span>
                    </a>

                  </div>
                </div>
              </div>
            </div>

            <div class="field">
              <div class="control">
                <textarea maxlength="256" class="textarea" v-model="message" :placeholder="$t('msg.httpSend.message_placeholder')" ></textarea>
              </div>
            </div>

            <div class="field">
              <div class="control">
                <AmountField ref="amountField" />
                <input class="switch is-success" id="dandelion" type="checkbox" checked="true" ref="dandelion">
                <label for="dandelion">{{ $t("msg.dandelion") }}</label>
                <p class="help">{{ $t("msg.dandelion_hint") }}</p>
              </div>
            </div>

            <div class="field is-grouped">
              <div class="control">
                <button class="button is-primary" :class="{ 'button__loader': isLoadingSend }" :disabled="!nodeSynced || (epicboxSelected && !epicboxConnected) || isLoadingSend || sent" @click="send">
                  <span class="button__text">{{ $t("msg.send") }}</span>
                </button>
                <p v-if="sent" class="help is-success" role="status">{{ $t("msg.httpSend.success") }}</p>

              </div>
              <div class="control">
                <button class="button is-primary" :class="{ 'button__loader': isLoadingSendFile }" :disabled="!nodeSynced" @click="sendFile">
                  <span class="button__text">{{ $t("msg.createofflinetx") }}</span>
                </button>
              </div>
            </div>
            <p v-if="nodeSynced && epicboxSelected && !epicboxConnected" class="help is-danger" role="status">{{ $t("msg.epicbox_not_connected") }}. {{ $t("msg.epicbox_not_connected_hint") }}</p>
            <p v-if="!nodeSynced" class="help is-danger" role="status">{{ $t("msg.node_not_synced") }}. {{ $t("msg.node_not_synced_hint") }}</p>

          </div>


        </div>

      </div>
    </section>


</template>
<script>

const fs = window.nodeFs;
import { ref } from 'vue';
import { useStore } from '@/store';
import { MIN_CONFIRMATIONS } from '@/shared/confirmations';
import { MAX_OUTPUTS } from '@/shared/sendMath';
import AmountField from "@/components/form/amountField";
import AddressField from "@/components/form/addressField";
import useFormValidation from "@/modules/useFormValidation";
import { clearSendForm, inputAfterSend, sendMethod, isOnionAddress } from "@/shared/sendForm";
import { parseOnion } from "@/shared/onion";
import { onionVerdict, torSendError, torErrorText } from "@/shared/torUi";
import { sendableAddresses, sendQuery } from "@/shared/contacts.js";
import { contactAvatars } from "@/shared/contactAvatars.js";
import ContactPickerModal from "@/components/ContactPickerModal.vue";

export default {
  name: "http-send",
  components: {
    AmountField,
    AddressField,
    ContactPickerModal,
  },

  data(){
    return {
      //the contact picker (the person button by the recipient field): open, and what it lists
      pickerOpen: false,
      pickerContacts: [],
      pickerAvatars: {},
      pickerLoading: false,
      //a send over Tor is under way: connect | sign | post
      torStep: '',
      //"Turn on Tor" was pressed and the setting is being saved
      torTurning: false,
    };
  },

  /* Contacts › Send opens this screen with ?contact=<id>&use=<field>: that contact's address is filled in */
  async mounted(){
    const q = sendQuery(this.$route && this.$route.query);
    if(!q) return;
    let row = null;
    try{
      const rows = await this.$addressBookService.getAddressById(q.id);
      row = rows && rows[0];
    }catch(e){
      console.error('contact not read', e);
    }
    //only a contact of this wallet
    if(!row || row.user_id != this.store.state.user.id){
      this.$toast.error(this.$t('msg.contacts.send_missing'));
      return;
    }
    //something typed or picked meanwhile wins
    if(this.addressField && String(this.addressField.input || '').trim()) return;
    if(!this.pickContact(row, q.field)){
      this.$toast.error(this.$t('msg.contacts.err_address'));
      return;
    }
    this.loadAvatars();
  },


  watch: {
      //after a send the form is clear and Send disabled until something new is typed
      'amountField.input': function (newVal) { inputAfterSend(this, newVal); },
      message: function (newVal) { inputAfterSend(this, newVal); },
      //Tor came on, went off or failed while a Tor address is in the field
      onionState: function () { this.showOnionMessage(); },
      'addressField.input': function (newVal) {
        inputAfterSend(this, newVal);
        //a Tor address: said at once, not only on Send
        this.showOnionMessage();
        if(newVal == ''){
          this.addressSelected = false;
          this.foundAddress = [];
          this.method = 'http';
          this.address = {};

        }else if(this.addressSelected && ![this.address.externalOne, this.address.externalTwo, this.address.onion].some(x => x && String(x).trim() == String(newVal).trim())){
          //the picked contact's address was edited away: its method (Epicbox) no longer applies
          this.addressSelected = false;
          this.method = 'http';
          this.address = {};
        }
      },
  },
  setup(){

    const store = useStore();
    const foundAddress = ref([]);
    const addressSelected = ref(false);
    const amountField = ref('');
    const addressField = ref('');
    const method = ref('http');
    const message = ref('');
    const isLoadingSend = ref(false);
    const isLoadingSendFile = ref(false);
    //the last send went through and nothing new is typed yet (shared/sendForm.js)
    const sent = ref(false);
    const address = ref({});
    const dandelion = ref('');



    const { resetFormErrors } = useFormValidation();

    return {
      store,
      foundAddress,
      addressSelected,
      amountField,
      addressField,
      method,
      message,
      resetFormErrors,
      isLoadingSend,
      isLoadingSendFile,
      sent,
      address,
      dandelion
    }

  },
  computed: {
    /* Tor addresses are sent to (Modern Send; Classic has no Tor and refuses them) */
    torAware(){
      return false;
    },
    /* what the recipient text is to Tor (shared/torUi.js onionVerdict): none | typo | tor_off | wait | failed | ok */
    onionState(){
      return this.torAware ? onionVerdict(this.addressField && this.addressField.input, this.store.state.tor) : 'none';
    },
    /* sending needs a synced node; unknown or unreachable counts as not synced */
    nodeSynced(){
      const s = this.store.state.nodeStatus;
      return !!(s && !s.error && s.sync_status === 'synced' && s.tip && s.tip.height > 0);
    },
    /* the address (or chosen address book entry) means sending via Epicbox */
    epicboxSelected(){
      return sendMethod(this.method, this.addressField && this.addressField.input) == 'epicbox';
    },
    epicboxConnected(){
      return !!this.store.state.walletEpicboxService;
    },
  },
  methods: {

    /* the message for a Tor address in the recipient field: the refusal without Tor (Classic), or what
       Tor needs first / the typo (Modern); null when it can be sent */
    onionMessage(){
      if(!this.torAware) return this.$t("msg.validators.onion_address");
      const tor = this.store.state.tor;
      switch(this.onionState){
        case 'typo': return this.$t('msg.modern.settings.tor.send_typo');
        case 'tor_off': return this.$t('msg.modern.settings.tor.send_off');
        case 'failed': return torErrorText((...a) => this.$t(...a), tor.error, tor.detail);
        default: return null;
      }
    },
    /* shows that message, and takes one of ours away when it no longer applies */
    showOnionMessage(){
      const f = this.addressField;
      if(!f || !f.errors) return;
      const ours = [this.$t("msg.validators.onion_address"), this.$t('msg.modern.settings.tor.send_typo'), this.$t('msg.modern.settings.tor.send_off')];
      const msg = isOnionAddress(f.input) ? this.onionMessage() : null;
      if(msg){
        f.errors.address = msg;
      }else if(ours.includes(f.errors.address)){
        f.errors.address = null;
      }
    },
    /* the recipient field's check: a Tor address by the Tor rules (Modern), anything else as before */
    validAddress(){
      const f = this.addressField;
      if(this.torAware && isOnionAddress(f.input)){
        f.defaultValue = String(f.input).trim();
        const msg = this.onionMessage();
        if(msg) f.errors.address = msg;
        return !msg;
      }
      return f.validInput();
    },
    /* "Turn on Tor" next to a Tor address (Modern Send): the progress shows in place */
    async turnOnTor(){
      if(this.torTurning) return;
      this.torTurning = true;
      try{
        this.emitter.emit('app.setTor', true);
      }finally{
        this.torTurning = false;
      }
    },
    async retryTor(){
      this.emitter.emit('app.startTor');
    },

    /* the picker (or Contacts › Send) chose a contact: its address (field, or the first it has: Epicbox
       before HTTP) goes into the recipient field, with the contact's send method. false: nothing to use */
    pickContact(contact, field){
      const ok = sendableAddresses(contact, { tor: this.torAware });
      const use = (ok.find(a => a.field == field) || ok[0] || {}).field;
      if(!use || !this.addressField) return false;
      this.addressSelected = false;
      this.fillAddressField(contact, use);
      this.pickerOpen = false;
      if(this.addressField.errors && this.addressField.errors.address && !isOnionAddress(this.addressField.input)){
        this.addressField.errors.address = null;
      }
      //next: the amount
      this.$nextTick(() => {
        const amount = typeof document != 'undefined' && document.querySelector('input[inputmode=decimal]');
        if (amount && amount.focus) amount.focus();
      });
      return true;
    },
    async openPicker(){
      this.pickerOpen = true;
      this.pickerLoading = true;
      try{
        this.pickerContacts = await this.$addressBookService.getAddress(this.store.state.user.id) || [];
      }catch(e){
        console.error('contacts not read', e);
        this.pickerContacts = [];
      }
      this.pickerLoading = false;
      await this.loadAvatars();
    },
    /* the wallet's contact pictures (the picker's rows, the chosen contact under the field) */
    async loadAvatars(){
      try{
        const map = await (this.$contactAvatars || contactAvatars()).forUser(this.store.state.user.id);
        const out = {};
        for(const [k, v] of map) out[k] = v;
        this.pickerAvatars = out;
      }catch(e){
        console.error('contact pictures not read', e);
      }
    },
    /* the picker closed without a choice: back to the recipient field */
    closePicker(){
      this.pickerOpen = false;
      this.$nextTick(() => { if (this.$refs.pickerBtn && this.$refs.pickerBtn.focus) this.$refs.pickerBtn.focus(); });
    },

    fillAddressField(address, type){
      this.address = address;
      if(!this.addressSelected){
        if(type == 'externalOne'){
          this.addressField.setValue(address.externalOne.trim());
          this.method = 'epicbox';
        }else if(type == 'externalTwo'){
          this.addressField.setValue(address.externalTwo.trim());
          this.method = 'http';
        }else if(type == 'onion'){
          this.addressField.setValue(address.onion.trim());
          this.method = 'http';
        }
        this.addressSelected = true;
        this.foundAddress = [];
      }
    },

    async keyEvent(value){

      if(!this.addressSelected){

        if(value != ''){

          let found = await this.$addressBookService.findAddress(this.store.state.user.id, value, { tor: this.torAware });
          //a contact picked while the search was on its way: no list over it
          if(this.addressSelected) return;
          //only entries with an address that can be sent to (Epicbox or HTTP)
          this.foundAddress = found.filter(a => a.externalOne || a.externalTwo || (this.torAware && a.onion));
        }else{
          this.foundAddress = [];
        }
      }
    },


    async sendFile(){

      if(!this.nodeSynced || this.isLoadingSendFile) return;
      this.resetFormErrors();
      let isFormAllValid = [];

      //the amount check asks the wallet for the fee of exactly this amount: busy from here
      this.isLoadingSendFile = true;
      let amountValid = false;
      try {
        amountValid = await this.amountField.validInput(this.store.state.summary.spendable);
      } catch (e) {
        amountValid = false;
      }
      isFormAllValid.push(amountValid);


      if(!isFormAllValid.includes(false)){

        let tx_data = Object.assign({
          "src_acct_name": null,
          //nanoepic, exact (0.29 * 100000000 is not an integer)
          "amount": this.amountField.amountNano,
          "minimum_confirmations": MIN_CONFIRMATIONS,
          "max_outputs": MAX_OUTPUTS,
          "message": this.message,
          //the GUI never asks for a payment proof (the CLI still can)
          "payment_proof_recipient_address": null,
          "target_slate_version": null,
          "ttl_blocks": null,
          "send_args": null
        //the coins the fee was worked out for (after "All": every coin, no change)
        }, this.amountField.txSelection());

        let res = await this.$walletService.issueSendTransaction(tx_data);

        if(res && res.result.Ok){
          let result = res.result.Ok;

          let fn_output = await window.api.showSaveDialog(this.$t('msg.save'), this.$t('msg.fileSend.saveMsg'), result.id + '.tx');
          if (fn_output.filePath){

            let lock = await this.$walletService.lock_outputs(result);

            if(lock && lock.result.Ok == null){
              try {
                fs.writeFileSync(fn_output.filePath, JSON.stringify(result), {
                  encoding: "utf8",
                  flag: "w"
                });
              }catch(err){
                this.$toast.error(err.message);
                this.isLoadingSendFile = false;
                return;
              }

              await this.$addressTransactionsService.addAddress({

                user_id: this.store.state.user.id,
                slateid: result.id,
                type: 'file',
                address: this.address ? this.address.id : null

              });

              this.$toast.success(this.$t('msg.fileSend.saved'));
              this.emitter.emit('app.update');


            }else if(lock && lock.result.error){
              this.$toast.error(lock.result.error.message);
            }else{
              this.$toast.error(this.$t('msg.fileSend.CreateFailed'));

            }

          }else{
            this.$toast.error(this.$t('msg.fileSend.cancelled'));
          }
        }else if(res && res.result.error){
          this.$toast.error(res.result.error.message);
        }else{
          this.$toast.error(this.$t('msg.fileSend.CreateFailed'));
        }

        this.isLoadingSendFile = false;
      }else{
        this.isLoadingSendFile = false;
        return;
      }

    },



    async send(){

      if(!this.nodeSynced || (this.epicboxSelected && !this.epicboxConnected) || this.isLoadingSend || this.sent) return;
      //the amount check asks the wallet for the fee of exactly this amount: busy from here
      //(the Modern review dialog keeps its busy state through the check and the send)
      this.isLoadingSend = true;
      try {
        await this.sendNow();
      } finally {
        this.isLoadingSend = false;
      }
    },

    /* a send to an onion address: progress through torStep, then the same finish as any send */
    async sendTor(tx_data, onion){
      this.torStep = 'connecting';
      let res;
      try{
        res = await this.$walletService.sendOverTor(tx_data, onion, (step) => { this.torStep = step; },
          { fluff: this.dandelion && this.dandelion.checked ? false : true });
      }finally{
        this.torStep = '';
      }
      if(res && res.ok){
        await this.$addressTransactionsService.addAddress({
          user_id: this.store.state.user.id,
          slateid: res.slate && res.slate.id,
          type: 'tor',
          address: this.address ? this.address.id : null,
          //the onion itself (Activity shows it, txDisplay.whoOf): a column outside the schema, which
          //JsStore stores and returns as is, so the database version and older versions are unaffected
          tor_address: onion
        });
        this.$toast.success(this.$t("msg.httpSend.success"));
        clearSendForm(this);
        this.emitter.emit('app.update');
      }else{
        const text = torSendError((...a) => this.$t(...a), res);
        this.store.commit('updates', {
          "status": "is-danger",
          "text":   text,
          "icon":   "information"
        });
        this.$toast.error(text);
      }
    },

    async sendNow(){
      this.resetFormErrors();
      let isFormAllValid = [];
      let amountValid = false;
      try {
        amountValid = await this.amountField.validInput(this.store.state.summary.spendable);
      } catch (e) {
        amountValid = false;
      }
      isFormAllValid.push(amountValid);
      isFormAllValid.push(this.validAddress());

      let method = sendMethod(this.method, this.addressField.defaultValue);


      if(!isFormAllValid.includes(false)){

        let tx_data = Object.assign({

          "src_acct_name": null,
          //nanoepic, exact (0.29 * 100000000 is not an integer)
          "amount": this.amountField.amountNano,
          "message": this.message,
          "minimum_confirmations": MIN_CONFIRMATIONS,
          "max_outputs": MAX_OUTPUTS,
          "target_slate_version": null,
          "ttl_blocks": null,
          //the GUI never asks for a payment proof (the CLI still can)
          "payment_proof_recipient_address": null,
          "send_args": {
            "method": method,
            "dest": this.addressField.defaultValue,
            "finalize": true,
            "post_tx": true,
            "fluff": this.dandelion.checked ? false : true
          }

        //the coins the fee was worked out for (after "All": every coin, no change)
        }, this.amountField.txSelection());

        //over Tor the GUI exchanges the slate itself (walletService.sendOverTor)
        if(this.torAware && isOnionAddress(this.addressField.defaultValue)){
          tx_data.send_args = null;
          await this.sendTor(tx_data, parseOnion(this.addressField.defaultValue).host);
          return;
        }

        let res = await this.$walletService.issueSendTransaction(tx_data)

        if(res && res.result && res.result.Ok){

            let tx_id = res.result.Ok.id



            await this.$addressTransactionsService.addAddress({

              user_id: this.store.state.user.id,
              slateid: tx_id,
              type: 'direct',
              address: this.address ? this.address.id : null

            });

            this.$toast.success(this.$t("msg.httpSend.success"));
            clearSendForm(this);
            this.emitter.emit('app.update');

        }else{


          //no answer at all (false) has no error to show
          const text = (res && res.error && res.error.message) || this.$walletService.lastError || this.$t('msg.httpSend.TxFailed');
          this.store.commit('updates', {
                "status": "is-danger",
                "text":   text,
                "icon":   "information"
          });

          this.$toast.error(this.$t('msg.httpSend.TxFailed'));

        }
      }

    },

  }
}
</script>
<style>
</style>
