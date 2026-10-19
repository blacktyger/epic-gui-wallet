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
                  <router-link class="button has-icon" to="/addressBook">
                    <span class="icon"><mdicon name="plus" /></span>
                  </router-link>

              </div>
            </div>

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
                <textarea maxlength="256" class="textarea" v-model="message" placeholder="Message (max. 256 chars)" ></textarea>
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

export default {
  name: "http-send",
  components: {
    AmountField,
    AddressField,
  },


  watch: {
      //after a send the form is clear and Send disabled until something new is typed
      'amountField.input': function (newVal) { inputAfterSend(this, newVal); },
      message: function (newVal) { inputAfterSend(this, newVal); },
      'addressField.input': function (newVal) {
        inputAfterSend(this, newVal);
        //a Tor address: said at once, not only on Send (no Tor in this wallet)
        const onionMsg = this.$t("msg.validators.onion_address");
        if(this.addressField && this.addressField.errors){
          if(isOnionAddress(newVal)){
            this.addressField.errors.address = onionMsg;
          }else if(this.addressField.errors.address == onionMsg){
            this.addressField.errors.address = null;
          }
        }
        if(newVal == ''){
          this.addressSelected = false;
          this.foundAddress = [];
          this.method = 'http';
          this.address = {};

        }else if(this.addressSelected && ![this.address.externalOne, this.address.externalTwo].some(x => x && String(x).trim() == String(newVal).trim())){
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

    fillAddressField(address, type){
      this.address = address;
      if(!this.addressSelected){
        if(type == 'externalOne'){
          this.addressField.setValue(address.externalOne.trim());
          this.method = 'epicbox';
        }else if(type == 'externalTwo'){
          this.addressField.setValue(address.externalTwo.trim());
          this.method = 'http';
        }
        this.addressSelected = true;
        this.foundAddress = [];
      }
    },

    async keyEvent(value){

      if(!this.addressSelected){

        if(value != ''){

          let found = await this.$addressBookService.findAddress(this.store.state.user.id, value);
          //only entries with an address that can be sent to (Epicbox or HTTP)
          this.foundAddress = found.filter(a => a.externalOne || a.externalTwo);
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

              this.$toast.success('Transaction file saved');
              this.emitter.emit('app.update');


            }else if(lock && lock.result.error){
              this.$toast.error(lock.result.error.message);
            }else{
              this.$toast.error(this.$t('msg.fileSend.CreateFailed'));

            }

          }else{
            this.$toast.error('Transaction cancelled.');
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
      isFormAllValid.push(this.addressField.validInput());

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
