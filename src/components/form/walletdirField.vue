<template>


  <p class="button is-link is-success is-outlined" v-if="defaultValue"><br/><strong>{{ defaultValue }}</strong></p>
  <a class="button is-link is-outlined" @click="selectDir">{{ $t("msg.create.select") }}</a>

  <div style="color:red;" v-if="errors.walletdir">
     {{ errors.walletdir }}
  </div>
  <!-- a warning, not an error: the user may keep the folder -->
  <article class="message is-warning" v-if="oneDriveRoot" role="status" style="margin-top: 0.75rem;">
    <div class="message-body">
      <!-- the dark theme colours strong text light; here it must keep the message colour -->
      <strong style="color: inherit">{{ $t("msg.walletfolder.onedrive_title") }}</strong><br/>
      {{ $t("msg.walletfolder.onedrive_warning", [chosenDir, configService.defaultWalletRoot]) }}
    </div>
  </article>
</template>

<script>
  import { ref, computed } from "vue";
  import useFormValidation from "@/modules/useFormValidation";
  import { oneDriveRootOf } from "@/shared/oneDrive";

  export default {

    setup() {

      const defaultValue = ref('');
      const selectedDir = ref('');

      const { validateDirField, errors } = useFormValidation();

      const validInput = (configService) => {
        defaultValue.value = selectedDir.value == '' ? configService.defaultWalletRoot : selectedDir.value;
        return validateDirField("walletdir", defaultValue.value, configService);
      };

      return { errors, defaultValue, validInput, selectedDir };
    },
    computed: {
      /* the folder new wallets go to: the one picked, else the default */
      chosenDir(){
        return this.selectedDir || (this.configService && this.configService.defaultWalletRoot) || '';
      },
      /* the OneDrive root that folder is in, '' if none */
      oneDriveRoot(){
        const roots = window.config && window.config.getOneDriveRoots ? window.config.getOneDriveRoots() : [];
        return oneDriveRootOf(this.chosenDir, {roots, platform: this.configService ? this.configService.platform : 'linux'});
      },
    },
    methods:{

      async selectDir(){

          let customHomedir = await window.api.showOpenDialog();
          if(customHomedir.canceled == false){
            this.selectedDir = customHomedir.filePaths[0]

          }
      },

    }

  };
</script>
