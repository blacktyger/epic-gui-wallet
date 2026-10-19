<template>

  <section class="section is-main-section">


    <div v-show="store.state.walletListenerService">
      <div class="columns">
        <div class="column is-two-thirds">
          <div class="message is-info">

            <div class="message-header"><p>{{ $t("msg.httpReceive.listening") }}</p></div>
            <div class="message-body">

              <p v-if="store.state.walletEpicboxService">
                {{ $t("msg.httpReceive.epicbox_address") }}:<br/>
                <code>{{ epicboxAddress }}</code>&nbsp;<mdicon @click="copy(epicboxAddress)" name="content-copy" size=16 />&nbsp;<mdicon class="is-clickable" @click="qrcode(epicboxAddress, 'epicbox')" name="qrcode-scan" size=16 />
              </p>
              <p v-else>
                {{ $t("msg.httpReceive.epicbox_address") }}:<br/>

                <code v-if="this.store.state.user.epicbox_domain != ''">{{ $t("msg.httpReceive.epicbox_not_available") }}</code>
                <code v-else>{{ $t("msg.httpReceive.epicbox_off") }}</code>

              </p>
              <!-- the server the Epicbox listener is really on -->
              <p v-if="epicboxLine" class="help" role="status">{{ epicboxLine.text }}</p>
              <p>&nbsp;</p>

              <p>
                {{ $t("msg.httpReceive.local_address") }}:<br/>
                <code>{{ localAddress }}</code>
                &nbsp;<mdicon v-if="portIsForwarded" name="flag-checkered" style="color:hsl(141, 53%, 53%);" title="port is open" /><mdicon v-else name="flag-checkered" style="color:hsl(348, 100%, 61%);" title="port is closed" />
                &nbsp;<mdicon class="is-clickable" @click="checkPortOpen()" name="refresh" size=16 />
                &nbsp;<mdicon class="is-clickable" @click="copy(localAddress)" name="content-copy" size=16 />
                &nbsp;<mdicon class="is-clickable" @click="qrcode(localAddress, 'local')" name="qrcode-scan" size=16 />
              </p>

            </div>

          </div>



        </div>
        <div class="column">
          <div class="message is-info">

            <div class="message-header"><p v-if="addressTypeHeader">{{ $t("msg.httpReceive.your_qrcode", [addressTypeHeader]) }}</p><p v-else>{{ $t("msg.httpReceive.click_qrcode_icon") }}</p></div>
            <div v-show="addressTypeHeader"  class="message-body">
              <canvas id="qrcodeCanvas"></canvas>
            </div>
          </div>
        </div>

      </div>
      <div class="columns">
        <div class="column is-half">
              <div class="field">
                <div class="control">
                  <button class="button is-primary" @click="stop" :class="{ 'button__loader': isLoading }">
                      <span class="button__text">{{ $t("msg.httpReceive.close") }}</span>
                  </button>
                </div>
              </div>
        </div>
      </div>
    </div>
    <div v-show="!store.state.walletListenerService">
      <div class="message is-warning">
        <div class="message-header"><p>{{ $t("msg.httpReceive.attention") }}</p></div>
        <div class="message-body">
          <p>{{ $t("msg.httpReceive.reachableMsg") }}</p>
        </div>
      </div>
      <div class="columns">
        <div class="column is-half">

            <div class="field">
              <div class="control">
                <button class="button is-primary" @click="start" :class="{ 'button__loader': isLoading }">
                    <span class="button__text">{{ $t("msg.httpReceive.start") }}</span>
                </button>
              </div>
            </div>

        </div>
      </div>


    </div><!-- end else -->




  </section>

</template>
<script>


import { ref,onMounted } from 'vue';
import { useStore } from '@/store';
import useFormValidation from "@/modules/useFormValidation";
import { epicboxStatus } from '@/shared/epicboxStatus';
import { serverFromUrl, serverLabel, PORT_SECURE } from '@/shared/epicboxConfig';


const clipboard = window.clipboard;

export default {
  name: "http-receive",
  components: {
  },
  setup(){

    const store = useStore();

    const localAddress = ref('');
    const epicboxAddress = ref('');
    //the public key of the Epicbox address; the domain is the listener's (see epicboxDomainNow)
    const epicboxKey = ref('');
    const { resetFormErrors } = useFormValidation();
    const isLoading = ref(false);
    const vueCanvas = ref(null);
    const addressTypeHeader = ref('');
    const publicIp = ref('');
    const portIsForwarded = ref(false);
    //the check when the page opens is done (Modern shows "checking" until then)
    const portCheckedOnce = ref(false);

    return {
      store,
      localAddress,

      epicboxAddress,
      epicboxKey,
      resetFormErrors,
      isLoading,
      addressTypeHeader,
      publicIp,
      portIsForwarded,
      portCheckedOnce

    }
  },

  computed: {
    /* the server the Epicbox listener is really on (its own output), for the status line */
    epicboxLine(){
      const st = epicboxStatus(this.store.state.epicbox, this.store.state.walletEpicboxService);
      const t = (k, a) => this.$t('msg.httpReceive.' + k, a);
      if(st.kind == 'checking') return {tone: 'busy', text: t('epicbox_checking_old', [st.checking])};
      if(st.kind == 'off') return null;
      if(!st.server) return st.kind == 'listening' ? {tone: 'ok', text: t('epicbox_listening')} : null;
      if(st.kind == 'listening') return {tone: 'ok', text: t('epicbox_listening_on', [st.server])};
      if(st.kind == 'paused') return {tone: 'warn', text: t('epicbox_paused_on', [st.server])};
      if(st.kind == 'connecting') return {tone: 'busy', text: t('epicbox_connecting_to', [st.server])};
      return {tone: 'busy', text: t('epicbox_starting_on', [st.server])};
    },
  },
  watch: {
    //the listener moved to another server: the address follows it
    'store.state.epicbox.server'(){
      if(this.epicboxKey){
        this.epicboxAddress = this.epicboxKey + '@' + this.epicboxDomainNow();
      }
    },
  },
  async mounted(){


    //no public IP (api.ipify.org not reachable): no address rather than http://undefined:3415
    this.publicIp = await window.config.getPublicIp() || {};
    this.localAddress = this.publicIp.ip ? 'http://' + this.publicIp.ip + ':' + this.configService.walletListenerPort : '';
    this.portIsForwarded = this.publicIp.ip ? await window.config.isPortReachable(this.publicIp.ip, this.configService.walletListenerPort) : false;
    this.portCheckedOnce = true;

    this.epicboxAddress = await this.getEpicboxAddress();


    var c = document.getElementById("qrcodeCanvas");
    this.vueCanvas = c;



  },
  methods: {
    async checkPortOpen(){
      this.portIsForwarded = this.publicIp && this.publicIp.ip ? await window.config.isPortReachable(this.publicIp.ip, this.configService.walletListenerPort) : false;
      this.$toast.show(this.$t("msg.httpReceive.check_port_open_done"), {duration:1000});
    },
    async qrcode(text, addressType){

      this.addressTypeHeader = addressType;
      this.vueCanvas = document.getElementById("qrcodeCanvas");
      window.nodeQr.toCanvas(this.vueCanvas, text, function (error) {
        if (error) console.error('HttpReceive.qrcode', error)


      })
    },
    async getEpicboxAddress(){
      let epicboxAddress = await this.$walletService.getEpicboxAddress();
      if(epicboxAddress && epicboxAddress.result && epicboxAddress.result.Ok){
        this.epicboxKey = epicboxAddress.result.Ok.public_key;
        return this.epicboxAddress = this.epicboxKey + '@' + this.epicboxDomainNow();
      }
      return '';

    },
    /* the domain of our Epicbox address: the server the listener connected to, else the setting */
    epicboxDomainNow(){
      const s = serverFromUrl(this.store.state.epicbox && this.store.state.epicbox.server);
      if(s && s.domain){
        return s.domain + (s.port != PORT_SECURE ? ':' + s.port : '');
      }
      return this.configService.config['epicbox_domain'] != '' ? this.configService.config['epicbox_domain'] : this.configService.epicboxDomain;
    },
    copy(text){
      window.clipboard.writeText(text);
      this.$toast.show(this.$t("msg.copy_to_clipboard"), {duration:1000});
    },
    async start(){


      this.resetFormErrors();

      //no password prompt: the main process starts them with the session's (shared/ptyHost.js)
      {

        this.isLoading = true;
        const isListen = await this.$walletService.startListen('http');
        const isEpicbox = await this.$walletService.startEpicbox();
        this.isLoading = false;
        if(isListen && isListen.success){

          this.$toast.success(this.$t("msg.login.listener_started"));
          this.store.commit('walletListenerService', true);

        }else if(isListen.success == false){

          this.$toast.error(isListen.portInUse ? this.$t("msg.login.port_in_use", [isListen.portInUse]) : this.$t("msg.login.error_listener_started"));
          this.store.commit('walletListenerService', false);
        }

        if(isEpicbox && isEpicbox.success){
          this.epicboxAddress = await this.getEpicboxAddress();
          this.$toast.success(this.$t("msg.login.epicbox_started"));
          this.store.commit('walletEpicboxService', true);
        }else if(isEpicbox && isEpicbox.pending){
          //it runs and keeps trying to connect: its events turn it on (App.onEpicboxEvent)
          this.epicboxAddress = await this.getEpicboxAddress();
          this.$toast.warning(this.$t("msg.app.epicbox_connecting", [serverLabel(isEpicbox.server)]));
        }else{
          this.$toast.error(this.$t("msg.login.error_epicbox_started"));
          this.store.commit('walletEpicboxService', false);
        }

      }



    },
    async stop(){

      this.isLoading = true;
      let killed = await this.$walletService.stopListen();
      this.isLoading = false;
      if(killed){
        this.store.commit('walletListenerService', false);
        this.$toast.success(this.$t("msg.httpReceive.listener_stopped"));
      }
    },


  }
}
</script>
