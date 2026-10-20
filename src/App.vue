<template>

  <!-- Classic interface (Bulma), unchanged -->
  <template v-if="isClassic">
    <router-view name="navBar" />
    <router-view name="asideMenu" />
    <router-view name="headerbar" />

    <router-view v-slot="{ Component }">
        <component :is="Component" :key="$route.fullPath" />
    </router-view>
    <aside-right />

    <modal-node-box
      :is-active="isNodeModalActive"
      @confirm="nodesyncedConfirm"
      @cancel="nodesyncedCancel"

    />

    <modal-kill-box/>

    <modal-firstsync-box
      :is-active="isFirstscanModalActive"
      @confirm="firstscanConfirm"
      @cancel="firstscanCancel"
      :output-data="scanoutput"
    />
  </template>

  <!-- Modern interface (6.1 redesign): same routes, same logic, its own views (components/modern) -->
  <ModernApp
    v-else
    :is-node-modal-active="isNodeModalActive"
    :is-firstscan-modal-active="isFirstscanModalActive"
    :scanoutput="scanoutput"
    @nodesynced-confirm="nodesyncedConfirm"
    @nodesynced-cancel="nodesyncedCancel"
    @firstscan-confirm="firstscanConfirm"
    @firstscan-cancel="firstscanCancel"
  />

  <!-- switching between the BT Labs Theme and Classic: shown before and after the reload -->
  <RestartOverlay v-if="restart.target" :target="restart.target" :stage="restart.stage" />

</template>

<script>

  import mixin from './mixin.js';
  import { MIN_CONFIRMATIONS, outputConfirmationState } from '@/shared/confirmations';
  import { walletSyncAfterSummary, needsNodeRefresh, nextRefreshDelay, refreshFromNode } from '@/shared/walletSync';
  import { nextNodePollDelay } from '@/shared/nodePoll';
  import { wantsRefresh } from '@/shared/epicboxListener';
  import { serverLabel } from '@/shared/epicboxConfig';
  import { httpListenerState } from '@/shared/httpListener';
  import { kernelsDue, minHeightFor, fetchKernelHeight } from '@/shared/sendAllKernel';
  import { useI18n } from 'vue-i18n';
  import { withoutUserinfo, isLocal } from '@/shared/nodeVersion';
  import { ref, watch, onUnmounted } from 'vue';
  import { applyLocale } from '@/shared/locale';
  import { useStore } from '@/store';
  import { useRouter } from '@/router';
  import { reloadUi, getUi, markRestart, takeRestart } from '@/shared/theme';
  import { keepScan } from '@/components/wallets';
  import AsideRight from '@/components/layout/AsideRight.vue'
  import ModalNodeBox from '@/components/layout/NodesyncedModalBox.vue'
  import ModalFirstsyncBox from '@/components/layout/FirstsyncModalBox.vue'
  import ModalKillBox from '@/components/layout/KillProcessModalBox.vue'
  import ModernApp from '@/components/modern/ModernApp.vue'
  import RestartOverlay from '@/components/RestartOverlay.vue'

  window.nodeSynced = null;

  //app components
  export default {
    name: 'Epic GUI Wallet',
    mixins: [mixin],
    components: {
      AsideRight,
      ModalNodeBox,
      ModalFirstsyncBox,
      ModalKillBox,
      ModernApp,
      RestartOverlay,
    },
    data() {
      //the interface switch in progress (RestartOverlay): target 'modern' | 'classic', stage lock | reload | done
      return { restart: { target: '', stage: '' } };
    },
    computed: {
      isClassic(){
        return this.store.state.ui === 'classic';
      },
    },

    setup() {

      const { locale, t } = useI18n();
      //<html lang> and dir (rtl for Persian) follow the language (QA T26)
      watch(locale, (l) => applyLocale(document, l), { immediate: true });
      const loggedIn = ref(false);
      //Menu › Lock wallet (shared/appMenu.js): enabled while a wallet is unlocked, in the app's language
      watch([loggedIn, locale], ([on]) => window.api.menuState(on, { lock: t('msg.modern.lock'), quit: t('msg.wallets.quit'),
        menu: t('msg.wallets.menu_menu'), source: t('msg.wallets.menu_source'), application: t('msg.wallets.menu_application'),
        edit: t('msg.wallets.menu_edit'), undo: t('msg.wallets.menu_undo'), redo: t('msg.wallets.menu_redo'), cut: t('msg.wallets.menu_cut'),
        copy: t('msg.wallets.menu_copy'), paste: t('msg.wallets.menu_paste'), selectAll: t('msg.wallets.menu_select_all') }), { immediate: true });
      const store = useStore();
      const router = useRouter();
      const isNodeModalActive = ref(false);
      const isFirstscanModalActive = ref(false);
      const scanoutput = ref([]);


      let startRefreshNodeId = 0;
      let refreshId = 0;

      //Classic's dark skin; the modern UI has its own (shared/theme.js)
      store.commit('darkModeToggle', store.state.ui === 'classic');
      router.push('/');

      /* is this called ever ? */
      onUnmounted (_ => {

        clearTimeout(startRefreshNodeId);
        clearTimeout(refreshId);
      })

      return {
        locale,
        loggedIn,
        store,
        isNodeModalActive,
        isFirstscanModalActive,
        scanoutput,
        t
      }
    },


    async created() {

      this.locale = await window.api.locale();

      //Menu › Lock wallet: the same as the Lock button and Ctrl+L, only while a wallet is unlocked
      //(skipped while a lock is under way: Ctrl+L can reach both the page and the menu)
      window.api.onMenuLock(() => {
        if (this.loggedIn && !this.loggingOut) this.emitter.emit('app.logout');
      });
      //Classic: Ctrl+L in the page too, as Modern's AppShell has it; the menu accelerator alone needs
      //the window to have the keyboard focus of the desktop
      window.addEventListener('keydown', (e) => {
        if (this.isClassic && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() == 'l'
          && this.loggedIn && !this.loggingOut) {
          e.preventDefault();
          this.emitter.emit('app.logout');
        }
      });

      //the window hidden or minimized polls less (nodePoll.js, walletSync.js); shown again, the node
      //is asked at once if the last poll is older than a visible poll would be
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.onWindowShown();
      });

      window.nodeChildProcess.on('firstscan-stdout', (payload) => {

        let lines = payload.data.split("\n");

        for(var i = 0;i<lines.length;i++){
          let cleanString = lines[i].replace(/^.+(?:WARN\s|DEBUG\s)/gm, '');
          if(cleanString !== lines[i]){
            if(cleanString.includes('This wallet has not been scanned against the current chain')){
              this.isFirstscanModalActive = true;
            }

            this.scanoutput.unshift("\n"+cleanString);
          }
        }

      });

      /* start epicbox once the node is synced: checked at once, not on the next node poll */
      this.emitter.on('app.startEpicbox', async() => {

        const session = this.loginSession;
        const waitStarted = performance.now();
        //stops at once when the external node's status can't be read (too old, status locked)
        let confirmed = await this.waitForNodeReady(session, undefined, () => this.epicboxBlocked());
        //logged out while waiting for the node: no Epicbox for that session
        if(session !== this.loginSession){
          return;
        }
        if(confirmed === 'blocked'){
          //say why now instead of after the 10 minute wait; the notice links to Receive
          this.store.commit('nodeProblemUpdate', {epicboxSkipped: true, hidden: false});
          this.$toast.error(this.t("msg.node_problem.epicbox_skipped"), {duration: 15000});
          return;
        }

        if(confirmed){
          console.log('[login] node synced, starting Epicbox +' + Math.round(performance.now() - waitStarted) + ' ms');
          const isEpicbox = await this.$walletService.startEpicbox();
          //logged out meanwhile: the listener goes with the session
          if(session !== this.loginSession){
            if(isEpicbox && isEpicbox.pid){
              await window.nodeChildProcess.stopPids([isEpicbox.pid]);
            }
            return;
          }
          if(isEpicbox && isEpicbox.success){
            this.$toast.success(this.t("msg.login.epicbox_started"));
            this.store.commit('walletEpicboxService', true);
            this.store.commit('walletListenerService', true);
          }else if(isEpicbox && isEpicbox.pending){
            //it runs and keeps trying to connect: its events turn it on
            this.$toast.warning(this.t("msg.app.epicbox_connecting", [serverLabel(isEpicbox.server)]));
          }else if(isEpicbox && isEpicbox.off){
            this.store.commit('walletEpicboxService', false);
          }else{
            this.$toast.error(this.t("msg.login.error_epicbox_started"));
            this.store.commit('walletEpicboxService', false);
            this.store.commit('walletListenerService', false);
          }



        }else if(!(this.store.state.nodeStatus && this.store.state.nodeStatus.node_behind)){
          //a node shown as "N blocks behind" already says why (with Switch node): no toast on top
          this.$toast.error(this.t("msg.app.epicbox_wait_timeout"));
        }



      });

      /* the Epicbox settings were saved (Settings): restart our listener on the new server, tell
         the owner API, check the old server once (with the session's password, in the main
         process). saved: the config before */
      this.emitter.on('app.applyEpicbox', async ({saved}) => {
        const session = this.loginSession;
        let r;
        try{
          r = await this.$walletService.applyEpicboxChange(saved);
        }catch(e){
          console.log('[epicbox] switch failed: ' + (e && e.message ? e.message : String(e)));
          r = {plan: {restart: true, start: true}, started: {success: false}};
        }
        if(session !== this.loginSession){
          return;
        }
        if(r.ownerConfig === false){
          this.$toast.error(this.t("msg.app.epicbox_owner_config_failed"));
        }
        //locked meanwhile: the old server is checked at the next start (epicbox_check_pending)
        if(r.noSession){
          return;
        }
        if(!r.plan || !r.plan.restart){
          return;
        }
        if(r.checked && r.checked.handled){
          this.$toast.success(this.t("msg.app.epicbox_old_checked", [r.checked.handled, serverLabel(r.plan.checkOld)]));
          this.requestRefresh();
        }
        if(r.stopFailed){
          this.$toast.error(this.t("msg.app.epicbox_switch_failed"));
        }else if(r.started && r.started.success){
          this.store.commit('walletEpicboxService', true);
          this.$toast.success(this.t("msg.app.epicbox_switched", [serverLabel(r.started.server)]));
        }else if(r.started && r.started.pending){
          this.$toast.warning(this.t("msg.app.epicbox_connecting", [serverLabel(r.started.server)]));
        }else if(r.plan.start){
          this.$toast.error(this.t("msg.app.epicbox_switch_failed"));
        }
        if(!r.plan.start){
          this.store.commit('walletEpicboxService', false);
        }
      });

      /* what our Epicbox listener does (walletService: its stdout, shared/epicboxListener.js) */
      this.emitter.on('epicbox.state', (st) => this.store.commit('epicbox', st));
      this.emitter.on('epicbox.event', (ev) => this.onEpicboxEvent(ev));

      /* after login, in the background: the HTTP listener, and Epicbox alongside (it waits for the node to sync) */
      this.emitter.on('app.startListeners', async () => {
        if(!this.configService.config['walletlisten_on_startup']){
          return;
        }
        const session = this.loginSession;
        //Epicbox does not wait for the HTTP listener, only for the node
        if(this.configService.config['epicbox_domain'] != undefined && this.configService.config['epicbox_domain'] != '' ){
          this.emitter.emit('app.startEpicbox');
        }
        this.store.commit('listenerStarting', true);
        const started = performance.now();
        let isListen;
        try{
          isListen = await this.$walletService.startListen('http');
        }finally{
          this.store.commit('listenerStarting', false);
        }
        console.log('[login] http listener ' + (isListen && isListen.success ? 'started' : 'not started' + (isListen && isListen.portInUse ? ' (port ' + isListen.portInUse + ' in use)' : '')) + ' +' + Math.round(performance.now() - started) + ' ms (background)');
        if(session === this.loginSession){
          //its own state: the status says HTTP only while it runs, and why it doesn't (QA W01)
          this.store.commit('httpListener', httpListenerState(isListen, this.configService.walletListenerPort));
          if(isListen && isListen.success){
            this.store.commit('walletListenerService', true);
          }
          if(isListen && isListen.portInUse){
            this.$toast.error(this.t("msg.login.port_in_use", [isListen.portInUse]));
          }
        }
        //logged out meanwhile: this listener belongs to no session, stop just this one
        if(session !== this.loginSession){
          if(isListen && isListen.pid){
            await window.nodeChildProcess.kill(isListen.pid);
          }
          return;
        }
      });

      this.emitter.on('app.startRefreshNodeStatus', () => {
        this.stopRefreshNode();
        this.startRefreshNode();
      });

      this.emitter.on('app.stopRefreshNodeStatus', () => {
        this.stopRefreshNode();
      });

      this.emitter.on('app.nodeStart', async() => {
        await this.nodeStart();
      });

      this.emitter.on('app.restartNode', async() => {
        if(this.store.state.user.nodeInternal){
          this.$toast.success(this.t("msg.app.node_restarting"));
          this.stopRefreshNode();
          this.stopRefresh();
          await this.$nodeService.stopNode();
          //locked within the 3 s: no node for a session that is gone
          const session = this.loginSession;
          setTimeout(async() => {
            if(session !== this.loginSession){
              return;
            }
            await this.nodeStart();


          }, 3000);

          clearTimeout(this.restartRefreshId);
          this.restartRefreshId = setTimeout(() => {

            this.requestRefresh();

          }, 30000);


        }
        //await this.$nodeService.restartNode();
        //this.$toast.success(this.t("msg.app.node_started"));

      });


      this.emitter.on('app.selectLocale', (locale) => {
        this.locale = locale;
      })

      //a refresh the user (or a transaction screen) asked for: from the node, even at the same tip
      this.emitter.on('app.update', () => {
        this.forceNodeRefresh = true;
        this.requestRefresh();
      });

      this.emitter.on('app.logout', (opts) => this.logoutApp(opts || {}));

      /* switch between the Modern and Classic interface: log out cleanly, then start the
         renderer again with the other stylesheet (shared/theme.js) */
      this.emitter.on('app.reloadUi', async () => {
        if (this.restart.target) return;
        //the overlay is painted before anything slow starts, so the window never looks stuck
        this.restart = { target: getUi(), stage: 'lock' };
        await this.$nextTick();
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
        const started = performance.now();
        try {
          await this.logoutApp();
        } finally {
          this.restart.stage = 'reload';
          markRestart(this.restart.target);
          console.log('[switch] locked +' + Math.round(performance.now() - started) + ' ms, reloading');
          //one frame for the "Restarting in" step to show, then the window starts again
          await new Promise((resolve) => setTimeout(resolve, 120));
          reloadUi();
        }
      });

      //the window just restarted into this interface: finish the overlay it began
      const restarted = takeRestart();
      if (restarted) {
        this.restart = { target: restarted, stage: 'reload' };
        setTimeout(() => { this.restart.stage = 'done'; }, 350);
        setTimeout(() => { this.restart = { target: '', stage: '' }; }, 800);
      }

      this.emitter.on('app.accountLoggedIn', async () => {

        //load user selected locale
        //"" = the OS language, already set at start
        this.locale = this.configService.config && this.configService.config.locale ? this.configService.config.locale : this.locale;

        window.debug ? console.log('accountLoggedIn') : null;

        //also emitted when leaving the Setup Assistant opened from the navbar: only a real login starts a session
        if(!this.loggedIn){
          this.loginSession = (this.loginSession || 0) + 1;
          //balances and txs shown before the first refresh are marked as updating
          this.store.commit('walletSync', 'loading');
          this.localRefreshTip = 0;
        }
        this.loggedIn = true;
        this.store.dispatch('toggleFullPage', false);
        this.store.commit('asideStateToggle');
        this.$router.push('/dashboard');


        //start refresh outputs summary etc
        this.emitter.emit('app.update');

      });


    },

    async mounted() {



      //App main window min size
      window.api.resize(1024, 768);


      //never a blank window: whatever fails here, the app still opens a page
      try {
        await this.routeAtStart();
      } catch (e) {
        console.log('[start] routing failed: ' + (e && e.message ? e.message : e));
        let hasWallets = false;
        try { hasWallets = this.configService.settings.wallets().length > 0; } catch (e2) { /* none */ }
        this.$router.push(hasWallets ? '/login' : '/new');
      }

    },
    methods: {

      /* where the app opens: an error screen when settings.json can't be read (nothing is
         written then), the found screen once when an older Epic Wallet left wallets, else
         Unlock when there are wallets and Welcome when there are none */
      async routeAtStart(){
        const settings = this.configService.settings;
        if(settings.readOnly){
          console.log('[start] settings file unreadable: ' + settings.loadError);
          this.$router.push({name: 'settingsError'});
          return;
        }
        if(settings.isFirstRun()){
          const started = performance.now();
          let scan = null;
          try{
            scan = await this.$importer.scan();
          }catch(e){
            console.log('[start] scan for older wallets failed: ' + (e && e.message ? e.message : e));
          }
          const wallets = scan && scan.wallets ? scan.wallets.length : 0;
          const chains = scan && scan.chains ? scan.chains.length : 0;
          console.log('[start] older wallets: ' + wallets + ', chain data: ' + chains + ' +' + Math.round(performance.now() - started) + ' ms');
          //chain data alone is no reason for the found screen: it is node data, offered in Settings
          if(wallets){
            keepScan(scan);
            this.$router.push({name: 'found'});
            return;
          }
          //a failed scan is not recorded: it runs again on the next start (as when settings.json
          //can't be saved now: markScanned is false then, and the next start scans again)
          if(scan && !settings.markScanned(0)){
            console.log('[start] settings not saved: ' + settings.saveError);
          }
        }
        this.$router.push(settings.wallets().length ? '/login' : '/new');
      },

      /* opts.stay: the caller (Add another wallet) goes on from its own page; opts.done: called once closed;
         opts.switching: Switch wallet, so the built-in node keeps running */
      async logoutApp(opts = {}){
        //Menu › Lock wallet waits for this one instead of starting a second (Ctrl+L can reach both)
        this.loggingOut = true;
        try {
          await this.closeSession(opts);
        } finally {
          this.loggingOut = false;
        }
      },
      async closeSession(opts){
        //first: the main process forgets the password, whatever happens below
        window.nodeChildProcess.clearSessionPassword().catch(() => {});
        //a copied recovery phrase leaves the clipboard on lock
        window.clipboard.wipeSecret().catch(() => {});
        this.stopRefreshNode();
        this.stopRefresh();
        this.lastNodeRefresh = null;
        this.nodeRetries = 0;
        this.loginSession = (this.loginSession || 0) + 1;
        //a node check still running (nodeStart, reclassifyNode) belongs to no session any more
        this.nodeStartGen = (this.nodeStartGen || 0) + 1;
        this.store.commit('user', {});
        this.store.commit('txs', []);
        this.store.commit('commits', []);
        this.store.commit('kernelHeight', null);
        this.kernelChecked = {};
        this.store.commit('walletTip', 0);
        this.store.commit('walletSync', '');
        this.store.commit('listenerStarting', false);
        this.store.commit('nodeProblem', null);
        this.store.commit('nodeAddressChange', null);
        this.store.commit('summary', {
          spendable: 0,
          total: 0,
          unconfirmed: 0,
          unfinalization: 0,
          immature: 0,
          locked: 0,
        });
        //one process scan for listener, wallet and node (walletService.stopAll)
        const started = performance.now();
        const cfg = this.configService.config || {};
        //switching: the built-in node stays, it serves every wallet of its network
        await this.$walletService.stopAll(opts.switching ? true : cfg.node_background != false);
        this.store.commit('walletEpicboxService', false);
        this.store.commit('walletListenerService', false);
        this.store.commit('epicbox', null);
        this.store.commit('httpListener', null);
        clearTimeout(this.epicboxRefreshId);
        console.log('[logout] processes stopped +' + Math.round(performance.now() - started) + ' ms');

        this.$walletService.logoutClient();
        this.loggedIn = false;
        this.walletApiFailed = false;
        this.configService.resetConfig();

        this.store.dispatch('toggleFullPage', true);
        this.store.commit('asideStateToggle', false);
        if(!opts.stay){
          this.$router.push('/login');
        }
        if(typeof opts.done === 'function'){
          opts.done();
        }
      },

      /* the node is synced, for Epicbox: asked at once and then every 2 s (a node on this computer)
         or 10 s (a remote one: a public node that is behind would be asked 30 times a minute), not
         only read from the poll, which starts 10 s after login. false after timeoutMs or logout */
      async waitForNodeReady(session, timeoutMs = 10*60*1000, blocked = () => false){
        const started = Date.now();
        while(session === this.loginSession && Date.now() - started < timeoutMs){
          if(window.nodeSynced === true){
            return true;
          }
          if(blocked()){
            return 'blocked';
          }
          const s = await this.$nodeService.getNodeStatus(this.store.state.user.nodeInternal).catch(() => false);
          if(s && s.tip && s.tip.height > 0 && s.sync_status === 'no_sync'){
            window.nodeSynced = true;
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, this.nodeIsLocal() ? 2000 : 10000));
        }
        return false;
      },

      /* an event of our Epicbox listener (or of the check of the old server) */
      onEpicboxEvent(ev){
        if(!ev){
          return;
        }
        //a slate was handled: show it now, not on the next poll (several in a row: one refresh)
        if(this.loggedIn && wantsRefresh(ev)){
          clearTimeout(this.epicboxRefreshId);
          this.epicboxRefreshId = setTimeout(() => this.requestRefresh(), 400);
        }
        //the check of the old server reports through walletService; another wallet's listener: not shown
        if(ev.check || (ev.dir && ev.dir !== this.configService.walletConfigDir)){
          return;
        }
        const cur = this.store.state.epicbox || {};
        const busy = cur.state == 'switching' || cur.state == 'checking_old';
        if(ev.type == 'connecting'){
          this.store.commit('epicbox', {state: 'connecting', server: ev.url, pid: ev.pid});
        }else if(ev.type == 'listening'){
          this.store.commit('epicbox', {state: 'listening', server: ev.url, address: ev.address, pid: ev.pid, checking: ''});
          if(this.loggedIn){
            this.store.commit('walletEpicboxService', true);
            //receiving is on (Epicbox came up after a pending start): the status and Receive say so
            this.store.commit('walletListenerService', true);
          }
        }else if(ev.type == 'subscribed' && cur.state != 'listening'){
          this.store.commit('epicbox', {state: 'listening', pid: ev.pid});
        }else if(ev.type == 'paused'){
          this.store.commit('epicbox', {state: 'paused', pid: ev.pid});
        }else if(ev.type == 'disconnected'){
          this.store.commit('epicbox', {state: 'connecting', pid: ev.pid});
        }else if(ev.type == 'exit' && (!cur.pid || cur.pid == ev.pid)){
          this.store.commit('walletEpicboxService', false);
          if(!busy){
            this.store.commit('epicbox', {state: 'off', pid: 0});
          }
        }
      },

      waitForNodesynced (variable, timeoutMs = 10*60*1000, blocked = () => false) {
        const started = Date.now();
        function waitFor() {
          if (window[variable] === true) {
            return Promise.resolve(true);
          }
          if (blocked()) {
            return Promise.resolve('blocked');
          }
          if (Date.now() - started > timeoutMs) {
            return Promise.resolve(false);
          }
          return new Promise((resolve) => setTimeout(resolve, 500)).then(() => waitFor());
        }
        return waitFor();
      },

      /* Epicbox can't wait for this node: its status can't be read and won't be (unlike an unreachable node) */
      epicboxBlocked(){
        const p = this.store.state.nodeProblem;
        return !!(p && !p.statusReadable && p.kind != 'unreachable');
      },

      /* the classification of the external node (shared/nodeVersion.js) -> the store's nodeProblem */
      setNodeProblem(check){
        if(!check || check.kind == 'ok'){
          //usable, maybe an older node or one with a locked /v1/status: no notice, a line in the log
          if(check && check.reason){
            console.log('[node] ' + withoutUserinfo(check.address) + ': usable, ' + check.reason + ', version ' + (check.version || 'unknown'));
          }
          this.store.commit('nodeProblem', null);
          return;
        }
        const {kind, address, version, reason, local, statusReadable, statusVia} = check;
        //the user hid the notice, or Epicbox was skipped, in this session: a new check keeps that
        //(same node only: another address gets its own notice)
        const before = this.store.state.nodeProblem && this.store.state.nodeProblem.address == address ? this.store.state.nodeProblem : {};
        //the notice says it in plain words; the details are for the log
        console.log('[node] ' + withoutUserinfo(address) + ': ' + kind + ', version ' + (version || 'unknown') + ', ' + (reason || '-')
          + ', status ' + (statusReadable ? 'readable via ' + statusVia : 'not readable'));
        this.store.commit('nodeProblem', {
          kind, address, version, reason, local, statusReadable, statusVia,
          network: this.configService.defaultAccountNetwork || 'mainnet',
          epicboxSkipped: !!before.epicboxSkipped,
          hidden: !!before.hidden,
        });
      },

      /* an external node that was unreachable answers again: classify it again (it may be too old) */
      async reclassifyNode(){
        if(this.reclassifying){
          return;
        }
        this.reclassifying = true;
        const gen = this.nodeStartGen;
        try{
          const check = await this.$nodeService.classifyNode(this.configService.config['check_node_api_http_addr'] || '');
          if(gen === this.nodeStartGen && !this.store.state.user.nodeInternal){
            this.setNodeProblem(check);
          }
        }finally{
          this.reclassifying = false;
        }
      },

      nodesyncedModalOpen(){
        this.isNodeModalActive = true
      },

      nodesyncedConfirm(){
        this.isNodeModalActive = false
        this.emitter.emit('app.logout');
      },

      nodesyncedCancel(){
        this.isNodeModalActive = false
      },

      firstscanConfirm(){
        this.isFirstscanModalActive = false
      },
      firstscanCancel(){
        this.isFirstscanModalActive = false
      },

      async nodeStart(){

        this.stopRefreshNode();
        this.nodeStatusFailed = false;
        this.nodePollFailures = 0;
        //another node (or the same one checked again): its first refresh asks it
        this.lastNodeRefresh = null;
        window.nodeSynced = null;
        this.$nodeService.resetHealth();
        this.store.commit('nodeStatus', {});
        this.store.commit('nodeProblem', null);
        //a newer nodeStart (node switched meanwhile) wins
        const gen = this.nodeStartGen = (this.nodeStartGen || 0) + 1;

        //start internal server only if its setup else just check if external node is running
        if(this.store.state.user.nodeInternal){

          this.store.commit('nodeType', 'internal');

          if(!this.configService.startCheckNode()){
            this.$toast.error(this.t("msg.app.error_setup_internal_node"));
          }else{
            const session = this.loginSession;
            let started  = await this.$nodeService.internalNodeStart();

            //locked while the node was starting: the lock's stop ran before this node existed
            if(started && session !== this.loginSession && !this.loggedIn && !(this.configService.config || {}).node_background){
              await this.$nodeService.stopNode();
              return;
            }

            if(started){
              this.$toast.success(this.t("msg.app.node_started"));
              //start the status check for the node
              //give the node some time before api status is called
              this.startRefreshNodeId = setTimeout(this.startRefreshNode, 10000);
            }else if(this.$nodeService.portInUse){
              this.$toast.error(this.t("msg.app.node_port_in_use", [this.$nodeService.portInUse]), {duration: false});
            }else{
              this.$toast.error(this.t("msg.app.node_not_started"));
            }
          }

        }else{

          this.store.commit('nodeType', this.configService.config['check_node_api_http_addr']);
          //what kind of node is it: too old, status locked, unreachable, not an Epic node? The notice
          //(NodeProblemNotice) says which and offers the fixes; no toast for it
          const nodeAddr = this.configService.config['check_node_api_http_addr'] || '';
          const check = await this.$nodeService.classifyNode(nodeAddr);
          if(gen !== this.nodeStartGen){
            return;
          }
          this.setNodeProblem(check);
          if(check.statusReadable){
            this.$toast.success(this.t("msg.app.external_node_online"));
            //Epicbox waits for this; the status poll starts only in 10 s
            window.nodeSynced = !!(check.status && check.status.tip && check.status.tip.height > 0 && check.status.sync_status === 'no_sync');
            this.store.commit('nodeStatus', check.status);
          }else{
            this.nodeStatusFailed = true;
            this.store.commit('nodeStatus', {error: true});
          }
          //start the status check for the node
          //give the node some time before api status is called
          this.startRefreshNodeId = setTimeout(this.startRefreshNode, 10000);

        }
      },

      async nodeStatus(){
        await window.api.nodebackground(this.configService.config.node_background);

        const gen = this.nodeStartGen;
        let respNode = await this.$nodeService.getNodeStatus(this.store.state.user.nodeInternal, {poll: true});
        //the node was switched meanwhile: this status is the old node's
        if(gen !== this.nodeStartGen){
          return;
        }
        if(respNode){
          this.nodeStatusFailed = false;
          this.nodePollFailures = 0;
          if(!this.store.state.user.nodeInternal && this.store.state.nodeProblem && this.store.state.nodeProblem.kind == 'unreachable'){
            this.reclassifyNode();
          }

          //sync_status as nodeHealth.js assessed it (at the network tip is synced); a node behind the tip
          //only gets the "N blocks behind" line, it holds back neither Epicbox nor sending
          window.nodeSynced = !!(respNode.tip && respNode.tip.height > 0 && respNode.sync_status === 'no_sync');

          if(this.store.state.user.nodeInternal && this.configService.config.nodesynced == false){
            if(respNode.tip && respNode.tip.height > 0 && respNode.sync_status === 'no_sync'){
              this.configService.updateConfig({
                nodesynced: true,
                check_node_api_http_addr: this.configService.localNodeUrl()
              });
              //updateConfig renders the wallet's toml again
              this.nodesyncedModalOpen();

            }
          }
          //a new block: refresh the wallet now, so confirmations follow the tip
          const lastTip = this.store.state.nodeStatus && this.store.state.nodeStatus.tip ? this.store.state.nodeStatus.tip.height : 0;
          this.store.commit('nodeStatus', respNode);
          if(this.loggedIn && lastTip > 0 && respNode.tip && respNode.tip.height > lastTip){
            this.requestRefresh();
          }else if(this.loggedIn && needsNodeRefresh(this.store.state.walletSync, this.store.state.nodeStatus)
                   && respNode.tip && respNode.tip.height != this.localRefreshTip){
            //the balance was read without the node: refresh it as soon as the node is there,
            //once per tip, so a wallet that can't use the node is not refreshed on every poll
            this.localRefreshTip = respNode.tip.height;
            this.requestRefresh();
          }
        }else{
          //only toast on the transition to failed, keep polling
          if(!this.nodeStatusFailed){
            if(this.store.state.user.nodeInternal){
              this.$toast.error(this.t("msg.app.node_offline"));
            }else{
              this.$toast.error(this.t("msg.app.external_node_offline"));
            }
          }
          this.nodeStatusFailed = true;
          this.nodePollFailures = (this.nodePollFailures || 0) + 1;
          window.nodeSynced = false;
          this.store.commit('nodeStatus', {error: true});
        }

      },
      /* the window is hidden or minimized (the polls back off, nodePoll.js / walletSync.js) */
      windowHidden(){
        return typeof document !== 'undefined' && !!document.hidden;
      },
      /* the node is on this computer: the built-in one or a local address (polled as before) */
      nodeIsLocal(){
        return !!this.store.state.user.nodeInternal || isLocal(this.configService.config['check_node_api_http_addr'] || '');
      },
      /* shown again after a hidden poll interval: ask the node now (a new block refreshes the wallet) */
      onWindowShown(){
        if(!this.loggedIn || !this.nodePollActive || this.nodePolling){
          return;
        }
        if(Date.now() - (this.nodePolledAt || 0) >= nextNodePollDelay({local: this.nodeIsLocal()})){
          this.stopRefreshNode();
          this.startRefreshNode();
        }
      },
      /* run a wallet refresh now; one already running is followed by another */
      requestRefresh(){
        if(this.refreshing){
          this.refreshAgain = true;
          return;
        }
        this.stopRefresh();
        this.startRefresh();
      },
      stopRefresh(){
        //invalidate a refresh that is still running, so it does not schedule another one
        this.refreshGen = (this.refreshGen || 0) + 1;
        this.refreshAgain = false;
        clearTimeout(this.refreshId);
        clearTimeout(this.restartRefreshId);
      },

      /* a transaction is still on its way (sent, received or in the mempool), or a coin is still confirming */
      hasPendingTx(){
        const recent = Date.now() - 1000*60*60;
        return (this.store.state.txs || []).some(tx => tx.status == 'unconfirmed' && Date.parse(tx.creation_ts) > recent)
          || (this.store.state.commits || []).some(c => outputConfirmationState(c, this.store.getters.tipHeight).state == 'confirming');
      },

      /* refresh wallet summary txs and outputs */
      async startRefresh() {

          //poll faster while a transaction is pending, so its status follows the listener and the chain,
          //and retry soon a refresh that did not reach the wallet or the node, until it does
          let refresh = _ => this.refreshId = setTimeout(this.startRefresh, nextRefreshDelay({
            walletSync: this.store.state.walletSync,
            node: this.store.state.nodeStatus,
            failed: this.walletApiFailed || this.refreshFailed,
            pendingTx: this.hasPendingTx(),
            hidden: this.windowHidden(),
            nodeRetries: this.nodeRetries || 0,
          }))
          const gen = this.refreshGen || 0;
          this.refreshing = true;
          this.refreshAgain = false;
          try {
            //each refresh from the node makes epic-wallet fetch all the wallet's outputs and rescan the
            //last 100 blocks: once per tip (walletSync.refreshFromNode), local reads in between
            const node = this.store.state.nodeStatus;
            const force = !!this.forceNodeRefresh;
            this.forceNodeRefresh = false;
            let refreshfromNode = refreshFromNode({node, last: this.lastNodeRefresh, force});
            const atTip = node && node.tip ? Number(node.tip.height) || 0 : 0;
            //the node was asked at this tip and answered: the balance shown is still the synced one
            const sameTip = !refreshfromNode && !!node && node.sync_status == 'synced';
            const started = performance.now();

            //skip txs and outputs while the wallet api is down
            this.refreshFailed = true;
            if(await this.getSummaryinfo(refreshfromNode, gen, {sameTip, atTip})){
              this.refreshFailed = false;
              //the summary call has just refreshed the wallet from the node (all three run the same
              //update), so txs and outputs read that state instead of asking the node twice more
              await this.getTxs(false, gen);
              await this.getCommits(false, gen);
              //a send-all epic-wallet leaves waiting: ask the node, in the background (QA T03)
              this.checkSendAllKernels();
            }
            window.debug ? console.log('[refresh] ' + (refreshfromNode ? 'from node' : (sameTip ? 'local, same tip' : 'local')) + ' +' + Math.round(performance.now() - started) + ' ms') : null;


          }
          catch (e) {
            console.log('[refresh] failed: ' + (e && e.message ? e.message : String(e)));
            if(gen === (this.refreshGen || 0)){
              clearTimeout(this.refreshId);
            }
          }
          finally {
            this.refreshing = false;
            if(this.refreshAgain){
              this.requestRefresh();
            }else if(gen === (this.refreshGen || 0)){
              refresh()
            }
          }

      },

      /* refresh node status */
      async startRefreshNode() {


          //often enough to see each new block soon, which triggers a wallet refresh; less while the
          //window is hidden and after polls that got no answer, a remote node less than a local one
          let refresh = _ => this.startRefreshNodeId = setTimeout(this.startRefreshNode, nextNodePollDelay({
            local: this.nodeIsLocal(),
            hidden: this.windowHidden(),
            failures: this.nodePollFailures || 0,
          }))
          const gen = this.nodeRefreshGen || 0;
          this.nodePollActive = true;
          this.nodePolling = true;

          try {
            await this.nodeStatus();

          }
          catch (e) {
            clearTimeout(this.startRefreshNodeId);
          }
          finally {
            this.nodePolling = false;
            this.nodePolledAt = Date.now();
            if(gen === (this.nodeRefreshGen || 0)){
              refresh()
            }
          }

      },
      stopRefreshNode(){
        //invalidate a poll that is still running, so it does not schedule another one
        this.nodeRefreshGen = (this.nodeRefreshGen || 0) + 1;
        this.nodePollActive = false;
        clearTimeout(this.startRefreshNodeId);
      },

      /* a refresh that was stopped while it waited (logout, restart) does not write its results */
      isStale(gen){
        return gen !== undefined && gen !== (this.refreshGen || 0);
      },

      async getSummaryinfo(refreshfromNode, gen, {sameTip = false, atTip = 0} = {}) {

          let summary = await this.$walletService.getSummaryInfo(MIN_CONFIRMATIONS, refreshfromNode);
          if(this.isStale(gen)){
            return false;
          }
          if(summary && summary.result && summary.result.Ok){
            let data = summary.result.Ok
            //data[0]: the wallet was refreshed from the node; else this is the wallet's last known state
            //a local read at the tip the node last answered for: still synced
            const sync = sameTip && this.store.state.walletSync == 'synced'
              ? 'synced' : walletSyncAfterSummary(this.store.state.walletSync, data[0], refreshfromNode, this.store.state.nodeStatus);
            if(refreshfromNode){
              //the next refresh at this tip reads locally; one the node could not update backs off
              this.lastNodeRefresh = data[0] ? {tip: atTip, at: Date.now()} : null;
              this.nodeRetries = data[0] ? 0 : (this.nodeRetries || 0) + 1;
            }
            if(refreshfromNode && !data[0]){
              //the wallet says no more than that: its own log has the reason
              console.log('[refresh] the wallet could not update from the node ' + (this.configService.walletNodeAddr || this.configService.config['check_node_api_http_addr']) + ', showing its last known balance');
            }else if(sync == 'synced' && this.store.state.walletSync == 'local'){
              console.log('[refresh] the wallet updated from the node again');
            }
            this.store.commit('walletSync', sync);
            //confirmations are counted from the height this balance was worked out at
            this.store.commit('walletTip', data[1]['last_confirmed_height']);
            this.store.commit('summary', {
              spendable: data[1]['amount_currently_spendable']/100000000,
              total: data[1]['total']/100000000,
              unconfirmed: data[1]['amount_awaiting_confirmation']/100000000,
              locked: data[1]['amount_locked']/100000000,
              unfinalization: data[1]['amount_awaiting_finalization']/100000000,
              immature: data[1]['amount_immature']/100000000,
            });
            this.walletApiFailed = false;
            return true;
          }else if(!summary){
            console.log('[refresh] wallet API: ' + (this.$walletService.lastError || 'no answer'));
            //only report the transition to failed, keep polling
            if(!this.walletApiFailed){
              this.$toast.error(this.t("msg.app.wallet_api_unreachable"));
              this.store.commit('updates', {
                    "status": "is-danger",
                    "text": "Summary: " + this.t("msg.app.wallet_api_unreachable"),
                    "icon":   "information"
              });
            }
            this.walletApiFailed = true;
            if(this.store.state.walletSync == 'loading'){
              this.store.commit('walletSync', 'error');
            }
          }else{
            console.log('[refresh] wallet API error: ' + (summary.error ? summary.error.message : JSON.stringify(summary.result)));
            if(this.store.state.walletSync == 'loading'){
              this.store.commit('walletSync', 'error');
            }
            this.store.commit('updates', {
                  "status": "is-danger",
                  "text": "Summary: " + (summary.error ? summary.error.message : JSON.stringify(summary.result)),
                  "icon":   "information"
            });

          }
          return false;
      },

      /* a send of everything stays "Waiting for confirmations" in epic-wallet (no change output to see
         on chain, QA T03): for that case only, the node's public get_kernel says the block it is in.
         At most once a minute per tx, until found; shown, never written to the wallet */
      async checkSendAllKernels() {
        if(this.kernelChecking){
          return;
        }
        this.kernelChecked = this.kernelChecked || {};
        const due = kernelsDue(this.store.state.txs, this.store.state.commits, {found: this.store.state.kernelHeights, checked: this.kernelChecked});
        if(!due.length){
          return;
        }
        const session = this.loginSession;
        const node = this.configService.config['check_node_api_http_addr'] ? this.configService.config['check_node_api_http_addr'] : this.configService.defaultEpicNode;
        this.kernelChecking = true;
        try{
          for(const tx of due){
            this.kernelChecked[tx.id] = Date.now();
            const h = await fetchKernelHeight(node, tx.kernel_excess, minHeightFor(tx, this.store.getters.tipHeight));
            if(session !== this.loginSession){
              return;
            }
            console.log('[send-all] tx ' + tx.id + ': kernel ' + (h > 0 ? 'in block ' + h : (h === 0 ? 'not in a block yet' : 'no answer from the node')));
            if(h > 0){
              this.store.commit('kernelHeight', {id: tx.id, height: h});
            }
          }
        }finally{
          this.kernelChecking = false;
        }
      },

      async getTxs(refreshfromNode, gen) {

        let txs = await this.$walletService.getTransactions(refreshfromNode, null, null);
        if(this.isStale(gen)){
          return;
        }

        if(txs && txs.result && txs.result.Ok){
          let data = txs.result.Ok.txs.reverse()
          this.store.dispatch('processTxs', {data: data, table: this.$addressTransactionsService})

        }else{
          //false: no answer from the wallet (e.g. it timed out)
          const reason = txs && txs.error ? txs.error.message : (this.$walletService.lastError || 'no answer');
          console.log('[refresh] txs: ' + reason);
          this.store.commit('updates', {
                "status": "is-danger",
                "text":   "Txs: " + reason,
                "icon":   "information"
          });

        }

      },

      async getCommits(refreshfromNode, gen) {

          let commits = await this.$walletService.getCommits(false, refreshfromNode, null);
          if(this.isStale(gen)){
            return;
          }

          if(commits && commits.result && commits.result.Ok){
            //this.total_commits =
            let data = commits.result.Ok.outputs.reverse();
            this.store.dispatch('processCommits', data)

          }else{
            const reason = commits && commits.error ? commits.error.message : (this.$walletService.lastError || 'no answer');
            console.log('[refresh] outputs: ' + reason);
            this.store.commit('updates', {
                  "status": "is-danger",
                  "text": "Commits: " + reason,
                  "icon":   "information"
            });

          }
      },
    }
  }

</script>
