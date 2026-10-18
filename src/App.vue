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

</template>

<script>

  import mixin from './mixin.js';
  import { MIN_CONFIRMATIONS, outputConfirmationState } from '@/shared/confirmations';
  import { useI18n } from 'vue-i18n';
  import { ref, onUnmounted } from 'vue';
  import { useStore } from '@/store';
  import { useRouter } from '@/router';
  import { reloadUi } from '@/shared/theme';
  import AsideRight from '@/components/layout/AsideRight.vue'
  import ModalNodeBox from '@/components/layout/NodesyncedModalBox.vue'
  import ModalFirstsyncBox from '@/components/layout/FirstsyncModalBox.vue'
  import ModalKillBox from '@/components/layout/KillProcessModalBox.vue'
  import ModernApp from '@/components/modern/ModernApp.vue'

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
    },
    computed: {
      isClassic(){
        return this.store.state.ui === 'classic';
      },
    },

    setup() {

      const { locale, t } = useI18n();
      const loggedIn = ref(false);
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

      /* start epicbox and refresh outputs/summary if node is snyced */
      this.emitter.on('app.startEpicbox', async(res) => {

        const session = this.loginSession;
        let confirmed = await this.waitForNodesynced('nodeSynced').then((res) => {
          return res;
        });
        //logged out while waiting for the node: no Epicbox for that session
        if(session !== this.loginSession){
          return;
        }

        if(confirmed){
          const isEpicbox = await this.$walletService.startEpicbox(res);
          if(isEpicbox && isEpicbox.success){
            this.$toast.success(this.t("msg.login.epicbox_started"));
            this.store.commit('walletEpicboxService', true);
            this.store.commit('walletListenerService', true);
          }else{
            this.$toast.error(this.t("msg.login.error_epicbox_started"));
            this.store.commit('walletEpicboxService', false);
            this.store.commit('walletListenerService', false);
          }



        }else{
          this.$toast.error(this.t("msg.app.epicbox_wait_timeout"));
        }



      });

      /* after login, in the background: the HTTP listener, then Epicbox (it waits for the node to sync) */
      this.emitter.on('app.startListeners', async (password) => {
        if(!this.configService.config['walletlisten_on_startup']){
          return;
        }
        const session = this.loginSession;
        this.store.commit('listenerStarting', true);
        const started = performance.now();
        let isListen;
        try{
          isListen = await this.$walletService.startListen(password, true, 'http');
        }finally{
          this.store.commit('listenerStarting', false);
        }
        console.log('[login] http listener ' + (isListen && isListen.success ? 'started' : 'not started') + ' +' + Math.round(performance.now() - started) + ' ms (background)');
        //logged out meanwhile: this listener belongs to no session, stop just this one
        if(session !== this.loginSession){
          if(isListen && isListen.pid){
            await window.nodeChildProcess.kill(isListen.pid);
          }
          return;
        }
        //Tor state only, no toast: Tor is not configurable and fails to bootstrap on most setups
        this.store.commit('torService', !!(isListen && isListen.tor));

        //start epicbox, will be executed when node has synced status
        if(this.configService.config['epicbox_domain'] != undefined && this.configService.config['epicbox_domain'] != '' ){
          this.emitter.emit('app.startEpicbox', password);
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
          setTimeout(async() => {
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

      this.emitter.on('app.update', () => {
        this.requestRefresh();
      });

      this.emitter.on('app.logout', () => this.logoutApp());

      /* switch between the Modern and Classic interface: log out cleanly, then start the
         renderer again with the other stylesheet (shared/theme.js) */
      this.emitter.on('app.reloadUi', async () => {
        await this.logoutApp();
        reloadUi();
      });

      this.emitter.on('app.accountLoggedIn', async () => {

        //load user selected locale
        this.locale = this.configService.config && this.configService.config.locale ? this.configService.config.locale : 'en';

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


      if(this.configService.appHasAccounts()){
        //upgrade wallet 3.0 paths to 4.0 paths
        if(await !this.configService.checkAccountsFolderStructure()){

          console.log('checking accounts folder structure has issues');

        }else{

          //continue to login page
          this.$router.push('/login');
        }


      } else {

        window.debug ? console.log('app has no accounts') : null;
        this.$router.push('/new');
      }

    },
    methods: {

      async logoutApp(){
        this.stopRefreshNode();
        this.stopRefresh();
        this.loginSession = (this.loginSession || 0) + 1;
        this.store.commit('user', {});
        this.store.commit('txs', []);
        this.store.commit('commits', []);
        this.store.commit('walletTip', 0);
        this.store.commit('walletSync', '');
        this.store.commit('listenerStarting', false);
        this.store.commit('summary', {
          spendable: 0,
          total: 0,
          unconfirmed: 0,
          unfinalization: 0,
          immature: 0,
          locked: 0,
        });
        await this.$walletService.stopListen(this.configService.config.epicbox_background);
        this.store.commit('walletEpicboxService', false);
        await this.$walletService.stopWallet();
        if(this.configService.config && this.configService.config.node_background == false)
          await this.$nodeService.stopNode();

        this.$walletService.logoutClient();
        this.loggedIn = false;
        this.walletApiFailed = false;
        this.configService.resetConfig();

        this.store.dispatch('toggleFullPage', true);
        this.store.commit('asideStateToggle', false);
        this.$router.push('/login');
      },

      waitForNodesynced (variable, timeoutMs = 10*60*1000) {
        const started = Date.now();
        function waitFor() {
          if (window[variable] === true) {
            return Promise.resolve(true);
          }
          if (Date.now() - started > timeoutMs) {
            return Promise.resolve(false);
          }
          return new Promise((resolve) => setTimeout(resolve, 500)).then(() => waitFor());
        }
        return waitFor();
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
        window.nodeSynced = null;
        this.store.commit('nodeStatus', {});

        //start internal server only if its setup else just check if external node is running
        if(this.store.state.user.nodeInternal){

          this.store.commit('nodeType', 'internal');

          if(!this.configService.startCheckNode()){
            this.$toast.error(this.t("msg.app.error_setup_internal_node"));
          }else{
            let started  = await this.$nodeService.internalNodeStart();

            if(started){
              this.$toast.success(this.t("msg.app.node_started"));
              //start the status check for the node
              //give the node some time before api status is called
              this.startRefreshNodeId = setTimeout(this.startRefreshNode, 10000);
            }else{
              this.$toast.error(this.t("msg.app.node_not_started"));
            }
          }

        }else{

          this.store.commit('nodeType', this.configService.config['check_node_api_http_addr']);
          //a saved address that is no Epic node (e.g. carried over from an old config): say so once
          const nodeAddr = this.configService.config['check_node_api_http_addr'] || '';
          const check = await this.$nodeService.checkNodeVersion(nodeAddr);
          if(!check.ok){
            this.$toast.error(this.t("msg.app.external_node_invalid", [nodeAddr, check.reason]), {duration: false});
            this.nodeStatusFailed = true;
            this.store.commit('nodeStatus', {error: true});
            this.startRefreshNodeId = setTimeout(this.startRefreshNode, 10000);
            return;
          }
          let respNode = await this.$nodeService.getNodeStatus(this.store.state.user.nodeInternal);
          if(respNode){
            this.$toast.success(this.t("msg.app.external_node_online"));
            this.store.commit('nodeStatus', respNode);
            //start the status check for the node
            //give the node some time before api status is called
            this.startRefreshNodeId = setTimeout(this.startRefreshNode, 10000);
          }else{
            this.$toast.error(this.t("msg.app.external_node_offline"));
            this.nodeStatusFailed = true;
            this.store.commit('nodeStatus', {error: true});
            this.startRefreshNodeId = setTimeout(this.startRefreshNode, 10000);
          }

        }
      },

      async nodeStatus(){
        await window.api.nodebackground(this.configService.config.node_background);
        await window.api.epicboxbackground(this.configService.config.epicbox_background);

        let respNode = await this.$nodeService.getNodeStatus(this.store.state.user.nodeInternal);
        if(respNode){
          this.nodeStatusFailed = false;

          window.nodeSynced = respNode.tip && respNode.tip.height > 0 && respNode.sync_status === 'no_sync';

          if(this.store.state.user.nodeInternal && this.configService.config.nodesynced == false){
            if(respNode.tip && respNode.tip.height > 0 && respNode.sync_status === 'no_sync'){
              this.configService.updateConfig({
                nodesynced: true,
                check_node_api_http_addr: 'http://127.0.0.1:3413'
              });

              this.configService.checkTomlFile();
              this.nodesyncedModalOpen();

            }
          }
          //a new block: refresh the wallet now, so confirmations follow the tip
          const lastTip = this.store.state.nodeStatus && this.store.state.nodeStatus.tip ? this.store.state.nodeStatus.tip.height : 0;
          this.store.commit('nodeStatus', respNode);
          if(this.loggedIn && lastTip > 0 && respNode.tip && respNode.tip.height > lastTip){
            this.requestRefresh();
          }else if(this.loggedIn && this.store.state.walletSync == 'local' && this.store.state.nodeStatus.sync_status == 'synced'
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
          window.nodeSynced = false;
          this.store.commit('nodeStatus', {error: true});
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

          //poll faster while a transaction is pending, so its status follows the listener and the chain
          let refresh = _ => this.refreshId = setTimeout(this.startRefresh, this.hasPendingTx() ? 1000*15 : 1000*60)
          const gen = this.refreshGen || 0;
          this.refreshing = true;
          this.refreshAgain = false;
          try {
            let refreshfromNode = this.store.state.nodeStatus.sync_status == 'synced' ?  true : false;
            const started = performance.now();

            //skip txs and outputs while the wallet api is down
            if(await this.getSummaryinfo(refreshfromNode, gen)){
              //the summary call has just refreshed the wallet from the node (all three run the same
              //update), so txs and outputs read that state instead of asking the node twice more
              await this.getTxs(false, gen);
              await this.getCommits(false, gen);
            }
            window.debug ? console.log('[refresh] ' + (refreshfromNode ? 'from node' : 'local') + ' +' + Math.round(performance.now() - started) + ' ms') : null;


          }
          catch (e) {
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


          //often enough to see each new block soon, which triggers a wallet refresh
          let refresh = _ => this.startRefreshNodeId = setTimeout(this.startRefreshNode, 1000*10)
          const gen = this.nodeRefreshGen || 0;

          try {
            await this.nodeStatus();

          }
          catch (e) {
            clearTimeout(this.startRefreshNodeId);
          }
          finally {
            if(gen === (this.nodeRefreshGen || 0)){
              refresh()
            }
          }

      },
      stopRefreshNode(){
        //invalidate a poll that is still running, so it does not schedule another one
        this.nodeRefreshGen = (this.nodeRefreshGen || 0) + 1;
        clearTimeout(this.startRefreshNodeId);
      },

      /* a refresh that was stopped while it waited (logout, restart) does not write its results */
      isStale(gen){
        return gen !== undefined && gen !== (this.refreshGen || 0);
      },

      async getSummaryinfo(refreshfromNode, gen) {

          let summary = await this.$walletService.getSummaryInfo(MIN_CONFIRMATIONS, refreshfromNode);
          if(this.isStale(gen)){
            return false;
          }
          if(summary && summary.result && summary.result.Ok){
            let data = summary.result.Ok
            //data[0]: the wallet was refreshed from the node; else this is the wallet's last known state
            this.store.commit('walletSync', data[0] ? 'synced' : 'local');
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

      async getTxs(refreshfromNode, gen) {

        let txs = await this.$walletService.getTransactions(refreshfromNode, null, null);
        if(this.isStale(gen)){
          return;
        }

        if(txs && txs.result && txs.result.Ok){
          let data = txs.result.Ok.txs.reverse()
          this.store.dispatch('processTxs', {data: data, table: this.$addressTransactionsService})

        }else{
          this.store.commit('updates', {
                "status": "is-danger",
                "text":   "Txs: " + txs.error.message,
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

            this.store.commit('updates', {
                  "status": "is-danger",
                  "text": "Commits: " +  commits.error.message,
                  "icon":   "information"
            });

          }
      },
    }
  }

</script>
