<template>

  <section class="section is-main-section" >
    <div class="columns">
      <div class="column is-half">

        <div class="field">
          <label class="label">{{ $t("msg.account.your_name") }}<span class="required">*</span></label>
          <TextField ref="textField" fieldname="name" />
        </div>

        <div class="field">
          <div class="control">
            <button class="button is-primary" @click="save" >{{ $t("msg.save") }}</button>
          </div>
        </div>

      </div>
    </div>
  </section>

</template>

<script>

import { ref, reactive } from 'vue';
import { useStore } from '@/store';

import useFormValidation from "@/modules/useFormValidation";
import TextField from "@/components/form/textField";

  export default {
    name: "settings",
    components: {
      TextField,
    },
    setup(){

      const { resetFormErrors } = useFormValidation();

      const store = useStore();
      const textField = ref('');

      return{
        store,
        textField,
        resetFormErrors
      }
    },

    mounted(){

      this.textField.input = this.store.state.user.name;

    },

    methods: {

      async save(){

        this.resetFormErrors();
        let isFormAllValid = [];

        isFormAllValid.push(this.textField.validInput('name'));

        if(!isFormAllValid.includes(false)){

          let updated = await this.$userService.updateUserByAccount(this.configService.configAccount, {name:this.textField.defaultValue});
          if(updated){
            this.$toast.success(this.$t("msg.account.settings_saved"));
          }else{
            this.$toast.error(this.$t("msg.account.error_save"));
          }


        }else{
          return;
        }

      },

    }
  }
</script>
