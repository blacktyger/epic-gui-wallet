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

                    <a v-if="address.onion" @click="fillAddressField(address, 'onion')" class="dropdown-item" data-address-id="{{address.id}}">
                      {{ address.name }} - TOR <span class="paste-address">{{ address.onion }}</span>
                    </a>

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
                  <input class="switch is-success" id="sendProofSwitch" type="checkbox" v-model="withproof" @click="addProof">
                  <label for="sendProofSwitch">{{ $t("msg.send_proof") }}</label>
                  <div v-show="withproof">
                    <ProofAddressField ref="proofAddressField" />
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
                <button class="button is-primary" :class="{ 'button__loader': isLoadingSend }" :disabled="!nodeSynced || (epicboxSelected && !epicboxConnected)" @click="send">
                  <span class="button__text">{{ $t("msg.send") }}</span>
                </button>

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
import ProofAddressField from "@/components/form/proofAddressField";
import AddressField from "@/components/form/addressField";
import useFormValidation from "@/modules/useFormValidation";

export default {
  name: "http-send",
  components: {
    AmountField,
    ProofAddressField,
    AddressField,
  },


  watch: {
      'addressField.input': function (newVal) {
        if(newVal == ''){
          this.addressSelected = false;
          this.withproof = false;
          this.foundAddress = [];
          this.method = 'http';
          this.address = {};

        }
      },
  },
  setup(){

    const store = useStore();
    const foundAddress = ref([]);
    const addressSelected = ref(false);
    const withproof = ref(false);
    const amountField = ref('');
    const proofAddressField = ref('');
    const addressField = ref('');
    const method = ref('http');
    const message = ref('');
    const isLoadingSend = ref(false);
    const isLoadingSendFile = ref(false);
    const address = ref({});
    const dandelion = ref('');



    const { resetFormErrors } = useFormValidation();

    return {
      store,
      foundAddress,
      addressSelected,
      withproof,
      amountField,
      proofAddressField,
      addressField,
      method,
      message,
      resetFormErrors,
      isLoadingSend,
      isLoadingSendFile,
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
      const v = (this.addressField && this.addressField.input) || '';
      return this.method == 'epicbox' || v.includes('@') || v.startsWith('es') || v.startsWith('epicbox');
    },
    epicboxConnected(){
      return !!this.store.state.walletEpicboxService;
    },
  },
  methods: {

    addProof(){

      if(!this.withproof){
        this.withproof = true;
      }else{
        this.withproof = false;
      }

    },
    fillAddressField(address, type){
      this.address = address;
      if(!this.addressSelected){
        if(type == 'onion'){
          this.addressField.setValue(address.onion.trim());
          this.method = 'http';

        }else if(type == 'externalOne'){
          this.addressField.setValue(address.externalOne.trim());
          this.method = 'epicbox';
        }else if(type == 'externalTwo'){
          this.addressField.setValue(address.externalTwo.trim());
          this.method = 'http';
        }

        if(address.alwaysproof && address.proofaddr != ''){
          this.withproof = true;
        }
        //always paste proof address even if empty
        this.proofAddressField.setValue(address.proofaddr);
        this.addressSelected = true;
        this.foundAddress = [];
      }
    },

    async keyEvent(value){

      if(!this.addressSelected){

        if(value != ''){

          let found = await this.$addressBookService.findAddress(this.store.state.user.id, value);
          //only entries with an address that can be sent to (onion, Epicbox or HTTP)
          this.foundAddress = found.filter(a => a.onion || a.externalOne || a.externalTwo);
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
      this.withproof ? isFormAllValid.push(this.proofAddressField.validInput()) : null;


      if(!isFormAllValid.includes(false)){

        let tx_data = Object.assign({
          "src_acct_name": null,
          //nanoepic, exact (0.29 * 100000000 is not an integer)
          "amount": this.amountField.amountNano,
          "minimum_confirmations": MIN_CONFIRMATIONS,
          "max_outputs": MAX_OUTPUTS,
          "message": this.message,
          "payment_proof_recipient_address": this.withproof ? this.proofAddressField.defaultValue : null,
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

      if(!this.nodeSynced || (this.epicboxSelected && !this.epicboxConnected) || this.isLoadingSend) return;
      this.resetFormErrors();
      let isFormAllValid = [];

      //the amount check asks the wallet for the fee of exactly this amount: busy from here
      //(the Modern review dialog keeps its busy state through the check and the send)
      this.isLoadingSend = true;
      let amountValid = false;
      try {
        amountValid = await this.amountField.validInput(this.store.state.summary.spendable);
      } catch (e) {
        amountValid = false;
      }
      isFormAllValid.push(amountValid);
      this.withproof ? isFormAllValid.push(this.proofAddressField.validInput()) : null;
      isFormAllValid.push(this.addressField.validInput());

      let method = this.method;
      if(this.addressField.defaultValue.includes('@') || this.addressField.defaultValue.startsWith('es') || this.addressField.defaultValue.startsWith('epicbox')){
        method = 'epicbox';
      }


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
          "payment_proof_recipient_address": this.withproof ? this.proofAddressField.defaultValue : null,
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

        this.isLoadingSend = false;
      }else{
        this.isLoadingSend = false;
        return;
      }

    },

  }
}
</script>
<style>
</style>
