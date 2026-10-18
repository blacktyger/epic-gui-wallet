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
  <!-- live public nodes from status.btlabs.uk: picking one only fills the address; hidden when unavailable -->
  <NodeDirectory
    v-if="select == 'external' && !directoryFailed"
    :address="String(input || '')"
    :chain="directoryChain"
    :disabled="checking"
    @pick="pickPublicNode"
  />



</template>

<script>

  import { ref, computed } from "vue";
  import useFormValidation from "@/modules/useFormValidation";
  import NodeDirectory from "@/components/form/NodeDirectory.vue";
  import { loadDirectory } from "@/shared/nodeDirectory";

  export default {
    components: { NodeDirectory },
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
          //no scheme given: assume https, keep any port
          if(defaultValue.value && !/^[a-z][a-z0-9+.-]*:\/\//i.test(defaultValue.value)){
            defaultValue.value = 'https://' + defaultValue.value;
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
    data() {
      return { directoryFailed: false };
    },
    computed: {
      directoryChain(){
        return (this.configService && this.configService.defaultAccountNetwork) || 'mainnet';
      }
    },
    mounted() {
      //warm the main process cache, so the list is there by the time "external" is picked
      loadDirectory(window.api, this.directoryChain);
    },
    //the public node list is optional: if it fails in any way, drop it and keep the field working
    errorCaptured(err, instance) {
      if(instance && instance.$options && instance.$options.name === 'NodeDirectory'){
        this.directoryFailed = true;
        return false;
      }
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

      /* a public node from the list: fill the address, as if typed; saving stays the user's action */
      pickPublicNode(endpoint){
        this.input = endpoint;
        this.errors.nodeaddress = null;
      },

      async nodeserverFieldChanged(){
        await this.emitter.emit('settings.nodeserverFieldChanged', "");
      }
    }

    //

  };
</script>
