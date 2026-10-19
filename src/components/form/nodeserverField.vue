<template>
  <div class="field">
    <label class="label">{{ $t("msg.node_server") }}<span class="required">*</span></label>
    <div class="control">

      <div class="select is-fullwidth" >
        <select @change="nodeserverFieldChanged" v-model="select" required>
          <option value="internal">{{ $t("msg.node_server_builtin") }}</option>
          <option value="external">{{ $t("msg.node_server_external") }}</option>
        </select>
      </div>
    </div>
  </div>
  <div class="field" v-if="select == 'external'">
    <label class="label">{{ $t("msg.node_server_address") }}<span class="required">*</span></label>
    <div class="control">
      <input
        class="input"
        type="nodeaddress"
        required
        v-model="input"
        :disabled="checking"
         />
         <div style="color:red;" v-if="errors.nodeaddress">
            {{ errors.nodeaddress }}
         </div>
    </div>
  </div>



</template>

<script>

  import { ref, computed } from "vue";
  import useFormValidation from "@/modules/useFormValidation";
  import { isPrivateHost } from "@/shared/nodeAddress";

  export default {
    setup() {

      let input = ref('');
      let select = ref('internal');
      let defaultValue = ref(null);
      let nodeInternal = ref(false);

      const { validateAddressField, errors } = useFormValidation();

      const validInput = () => {


        defaultValue.value = input.value.trim();
        if(select.value == 'external'){
          nodeInternal.value = false;
          //no scheme given: http for this computer or the LAN (nodeAddress.isPrivateHost), else https; keep any port
          if(defaultValue.value && !/^[a-z][a-z0-9+.-]*:\/\//i.test(defaultValue.value)){
            let host = '';
            try{ host = new URL('http://' + defaultValue.value).hostname; }catch(e){ host = ''; }
            defaultValue.value = (isPrivateHost(host) ? 'http://' : 'https://') + defaultValue.value;
          }
          defaultValue.value = defaultValue.value.replace(/\/+$/, '');
          input.value = defaultValue.value;
          return validateAddressField("nodeaddress", defaultValue.value, true);
        }else{
          nodeInternal.value = true;
          defaultValue.value = 'http://127.0.0.1:3413';
          return true;
        }


      };

      return { input, select, nodeInternal, errors, defaultValue, validInput, checking: ref(false) };
    },
    watch: {
      //prefill the default node when external is picked and the address is empty
      select(value){
        if(value == 'external' && !this.input.trim()){
          this.input = this.configService.getNodeFallBack();
        }
      }
    },
    methods: {

      /* after validInput(): check that the external address really is an Epic node */
      async verifyNode(){
        if(this.select != 'external'){
          return true;
        }
        this.checking = true;
        const check = await this.$nodeService.checkNodeVersion(this.defaultValue);
        this.checking = false;
        if(!check.ok){
          this.errors.nodeaddress = this.$t("msg.validators.not_epic_node", [this.defaultValue + ' (' + check.reason + ')']);
        }
        return check.ok;
      },

      async nodeserverFieldChanged(){
        await this.emitter.emit('settings.nodeserverFieldChanged', "");
      }
    }

    //

  };
</script>
