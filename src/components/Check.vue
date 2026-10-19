<template>

    <section class="section is-main-section">
      <div class="columns">
        <div class="column">



      <div v-if="!checking">
        <div class="message is-info">
          <div class="message-header"><p>{{ $t("msg.check.introTitle") }}</p></div>
          <div class="message-body">
            <p>{{ $t("msg.check.intro1") }}</p>
          </div>
        </div>

        <div class="columns">
          <div class="column is-half">
            <div class="field">
              <div class="control">
                  <input class="switch is-success" id="unconfirmedSwitch" type="checkbox" v-model="delete_unconfirmed">
                  <label for="unconfirmedSwitch">{{ $t("msg.check.delete_unconfirmed") }}</label>
              </div>

            </div>
            <div class="field" >
                <div class="control">

                  <button type="submit" class="button is-primary" @click.prevent="start">
                    <span class="button__text">{{ $t("msg.check.start") }}</span>
                  </button>
                </div>

            </div>
          </div>
        </div>

      </div>
      <div v-else>
        <div class="message is-info" style="height:300px;max-height:300px;overflow-y:scroll;">

          <div class="message-header" v-if="checking"><p>{{ $t("msg.check.checking") }}</p></div>
          <div class="message-body">
            <div class="control">

              <p class="is-size-7" v-for="output in checkOutputs" :key="output">{{ output }}</p>
          </div>
          </div>
        </div>

        <div class="field">
          <div class="control">
            <button type="submit" class="button is-primary" @click.prevent="stop">
              <span class="button__text">{{ $t("msg.check.stop") }}</span>
            </button>
          </div>
        </div>

        </div>

      </div>


      <div v-if="checking">



</div><!-- end column -->

</div>

    </section>


</template>
<script>
const log = window.log

import { ref } from 'vue';
import useFormValidation from "@/modules/useFormValidation";
export default {
  name: "check",
  components: {
  },
  setup() {

    const checking = ref(false);
    const checkOutputs = ref([]);
    const delete_unconfirmed = ref();
    const { resetFormErrors } = useFormValidation();

    return {
      resetFormErrors,
      checking,
      checkOutputs,
      delete_unconfirmed


    }

  },
  methods: {

    async start(){
      this.resetFormErrors();

      //the unlocked wallet is checked: no password prompt
      {
        this.checking = true;
        this.checkOutputs = [];

        const res = await this.$walletService.check(this.delete_unconfirmed, (line) => {
          if(this.checking && line){
            this.checkOutputs.unshift("\n" + line);
          }
        });

        if(res.stopped || !this.checking){
          return;
        }
        this.checking = false;
        this.checkOutputs = [];
        if(res.success){
          log.debug('Wallet check finished.')
          this.emitter.emit('app.update');
          this.$toast.success(this.$t("msg.check.scan_finished"));
        }else{
          log.debug('Wallet check failed: ' + res.msg)
          this.$toast.error(this.$t("msg.check.error_scan"));
        }
      }
    },

    stop(){
      this.$walletService.stopCheck()
      this.checking = false;
      this.$toast.success(this.$t("msg.check.scan_stop"));

    },

  }
}
</script>
<style>
.center{
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
