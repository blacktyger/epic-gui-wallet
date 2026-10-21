/*
 * The HTTP listener on demand (Modern): Receive › HTTP address and Settings › Node and receiving turn
 * it on and off on its own, Epicbox keeps running. It starts with the wallet only with Start with
 * wallet on (config http_listener_autostart, shared/httpListener.js httpAutostart): each epic-wallet
 * process asks the node every 10 s, so one less while nobody receives over HTTP.
 * For components with store, configService, $walletService, $toast and $t (Receive, Settings).
 */
import { httpListenerState } from '@/shared/httpListener';

export default {
  data() {
    return {
      //Turn on / Turn off is under way
      httpSwitching: false,
    };
  },
  computed: {
    //the HTTP listener runs (its own state, store.state.httpListener)
    httpOn() {
      const h = this.store.state.httpListener;
      return !!(h && h.state == 'on');
    },
    //Tor is on: it receives through this listener, so it stays on until Tor is off (tor-616 D6)
    torHoldsHttp() {
      const t = this.store.state.tor;
      return !!(t && t.enabled);
    },
    //it did not start: {port, reason} (shared/httpListener.js), else null
    httpFailed() {
      const h = this.store.state.httpListener;
      return h && h.state == 'failed' ? h : null;
    },
  },
  methods: {
    async httpTurnOn() {
      if (this.httpSwitching) return;
      this.httpSwitching = true;
      //the login session (App.vue): a lock or wallet switch meanwhile ends it, leaving the page does not
      const session = this.$root.loginSession;
      let res;
      try {
        res = await this.$walletService.startListen('http');
      } finally {
        this.httpSwitching = false;
      }
      //locked or switched meanwhile: stop the listener this started
      if (session !== this.$root.loginSession) {
        if (res && res.pid) await window.nodeChildProcess.kill(res.pid);
        return;
      }
      this.store.commit('httpListener', httpListenerState(res, this.configService.walletListenerPort));
      if (res && res.success) this.store.commit('walletListenerService', true);
      //the page was left meanwhile: the store has the state, no toast from a closed page
      if (this.$.isUnmounted) return;
      if (res && res.success) {
        this.$toast.success(this.$t('msg.login.listener_started'));
      } else {
        this.$toast.error(res && res.portInUse ? this.$t('msg.login.port_in_use', [res.portInUse]) : this.$t('msg.login.error_listener_started'));
      }
    },
    async httpTurnOff() {
      if (this.httpSwitching || this.torHoldsHttp) return;
      this.httpSwitching = true;
      try {
        await this.$walletService.stopHttpListen();
        this.store.commit('httpListener', null);
        //Epicbox may still receive: the receiving status follows it
        this.store.commit('walletListenerService', !!this.store.state.walletEpicboxService);
        if (typeof this.httpTurnedOff == 'function') this.httpTurnedOff();
      } finally {
        this.httpSwitching = false;
      }
    },
    /* the switch (a checkbox): on or off now, then it shows what really runs (a start that failed
       leaves httpOn false, which Vue would not write back to the box the user just ticked) */
    async httpSwitchChanged(e) {
      const box = e && e.target;
      await (box && box.checked ? this.httpTurnOn() : this.httpTurnOff());
      if (box) box.checked = this.httpOn;
    },
  },
};
