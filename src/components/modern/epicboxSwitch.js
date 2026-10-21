/*
 * Epicbox status and the one-click switch (#52), for Settings › Receiving, Receive and Send.
 * The status is our listener's own (shared/epicboxHealth.js); when it doesn't answer, the
 * healthiest other server of the public list (status.btlabs.uk, cached a minute by the main
 * process) is offered. Switching saves the server like Settings does and moves our listener
 * (App.vue app.applyEpicbox); it never happens by itself.
 * For components with store, configService, $walletService, $userService, emitter and $toast.
 */
import { loadEpicboxServers } from '@/shared/epicboxDirectory';
import { epicboxHealth, healthiestOther } from '@/shared/epicboxHealth';
import { serverLabel } from '@/shared/epicboxConfig';

//the clock for "not responding" and the list while something is wrong
const TICK_MS = 15000;
const LIST_MS = 60000;

export default {
  data() {
    return { ebServers: [], ebLive: false, ebNow: Date.now(), ebSwitching: false };
  },
  computed: {
    ebChain() {
      return (this.configService && this.configService.defaultAccountNetwork) || 'mainnet';
    },
    ebDomain() {
      return String(((this.configService && this.configService.config) || {}).epicbox_domain || '');
    },
    ebHealth() {
      return epicboxHealth({
        epicbox: this.store.state.epicbox, on: this.store.state.walletEpicboxService,
        domain: this.ebDomain, servers: this.ebServers, now: this.ebNow,
      });
    },
    /* the server to offer while ours doesn't answer, or null */
    ebSuggest() {
      return this.ebHealth.state == 'down' ? healthiestOther(this.ebServers, this.ebHealth.server) : null;
    },
  },
  mounted() {
    this.ebLoad();
    this.ebTimer = setInterval(() => {
      this.ebNow = Date.now();
      const s = this.ebHealth.state;
      if ((s == 'connecting' || s == 'down') && this.ebNow - (this.ebLoaded || 0) >= LIST_MS) this.ebLoad();
    }, TICK_MS);
  },
  beforeUnmount() {
    clearInterval(this.ebTimer);
    this.ebGone = true;
  },
  methods: {
    async ebLoad() {
      this.ebLoaded = Date.now();
      const res = await loadEpicboxServers(window.api, this.ebChain);
      if (this.ebGone) return;
      this.ebServers = res.servers;
      this.ebLive = res.live;
    },
    ebLabel(domain) {
      return serverLabel({ domain }) || domain;
    },
    /* save the Epicbox server (as Settings › Save does) and move our listener to it; false: not saved */
    async switchEpicbox(domain) {
      const d = String(domain || '').trim();
      if (!d || this.ebSwitching) return false;
      this.ebSwitching = true;
      try {
        const saved = this.$walletService.readEpicboxConfig();
        let ok = false;
        try {
          ok = this.configService.updateConfig({ epicbox_domain: d }) !== false;
          if (ok) await this.$userService.ensureUser(this.configService.walletId, { epicbox_domain: d });
        } catch (e) {
          console.log('[epicbox] server not saved: ' + (e && e.message ? e.message : e));
          ok = false;
        }
        if (!ok) {
          this.$toast.error(this.$t('msg.settings.error_save'));
          return false;
        }
        //App.vue says how the switch went (switched / connecting / failed); the button stays busy until
        //our listener's state moves (or 30 s), so a second click can't switch again to yet another server
        if (this.$walletService.token) {
          const moved = new Promise((resolve) => {
            const stop = this.$watch(() => this.store.state.epicbox.state, () => { stop(); resolve(); });
            setTimeout(() => { stop(); resolve(); }, 30000);
          });
          this.emitter.emit('app.applyEpicbox', { saved });
          await moved;
        }
        return true;
      } finally {
        this.ebSwitching = false;
      }
    },
  },
};
