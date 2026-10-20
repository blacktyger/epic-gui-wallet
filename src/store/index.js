import { createStore } from 'vuex';
import axios from 'axios';
import { getUi, getScheme } from '@/shared/theme';
import { waitingForReply } from '@/shared/txWaiting';
import { avatarLetters } from '@/shared/walletLabel';

export const store = createStore({
  state: {
    /* AppStyle (needed for demo render() in main.js) */
    appStyle: 'default',
    debug: false,

    //hide amount values with *****
    hideValues: false,
    /* User */
    userName: null,
    userEmail: null,
    userAvatar: null,

    /* NavBar */
    isNavBarVisible: false,

    /* FooterBar */
    isFooterBarVisible: true,

    /* Aside */
    isAsideVisible: false,
    isAsideExpanded: false,

    asideActiveForcedKey: null,
    isAsideRightVisible: false,
    isAsideRightActive: false,

    /* Updates */
    hasUpdates: false,

    /* Overlay */
    isOverlayVisible: false,

    /* Layout */
    isLayoutFullPage: false,
    isLayoutBoxed: false,
    isLayoutAsideHidden: true,


    /* Dark mode (available with AppLightDark.vue only) */
    isDarkModeActive: true,

    /* interface (shared/theme.js): 'modern' | 'classic', fixed until the window reloads, and the
       modern colour scheme */
    ui: getUi(),
    scheme: getScheme(),


    /* which service are running */
    walletListenerService: false,
    walletEpicboxService: false,
    /* send-alls epic-wallet never marks confirmed (QA T03): {tx id: the height the node has its kernel at},
       display only (shared/sendAllKernel.js) */
    kernelHeights: {},
    /* the HTTP listener on its own (shared/httpListener.js, QA W01): {state: 'off'|'on'|'failed', port, reason} */
    httpListener: {state: 'off', port: 0, reason: ''},
    /* our Epicbox listener, from its own output (App.onEpicboxEvent) and walletService:
       state: '' | starting | connecting | listening | paused | switching | checking_old | off;
       server: the wss:// url it connected to (or is starting on); checking: the old server being
       checked after a server change; address: the address it listens for */
    epicbox: {state: '', server: '', address: '', checking: '', pid: 0},
    //a server change needs the password to restart the listener: the config before the save, else null
    nodeType: '',
    nodeStatus: {

      sync_info:{
        current_height: 0,
        highest_height: 0,
        downloaded_size: 0,
        total_size: 0,
        rproofs: 0,
        rproofs_total: 0,
        kernels: 0,
        kernels_total: 0,
      }

    },

    user: {},
    stuffUpdates: [],
    updates: [],
    txs: [],
    commits: [],
    //the height the wallet counted its balance at (summary last_confirmed_height)
    walletTip: 0,
    //balance and txs since login: '' (logged out), 'loading' (not read yet), 'local' (read from the
    //wallet, not yet checked against the node), 'synced' (refreshed from the node), 'error'
    walletSync: '',
    //the HTTP listener is being started after login
    listenerStarting: false,
    //the step of opening the wallet running now (see StartupProgress), '' when idle
    loginStage: '',
    //the external node can't be used as it should (NodeProblemNotice): null, or
    //{kind: 'too_old' | 'unreachable' | 'not_epic', address, version, reason, local,
    // statusReadable, network, epicboxSkipped, hidden} (kinds: shared/nodeVersion.js classifyNode)
    nodeProblem: null,
    //the saved node address was cleaned up at login (shared/nodeAddressMigration.js): null or {from, to, reason, network}
    nodeAddressChange: null,
    summary: {
      spendable: 0,
      total: 0,
      unconfirmed: 0,
      unfinalization: 0,
      immature: 0,
      locked: 0,
    },
  },
  mutations: {
    /* A fit-them-all commit */
    basic (state, payload) {
      state[payload.key] = payload.value
    },
    walletEpicboxService(state, payload){
      state.walletEpicboxService = payload;
    },
    /* merge into state.epicbox; null resets it (logout) */
    epicbox(state, payload){
      state.epicbox = payload ? Object.assign({}, state.epicbox, payload) : {state: '', server: '', address: '', checking: '', pid: 0};
    },
    walletListenerService(state, payload){
      state.walletListenerService = payload;
    },
    /* {id, height}; null resets them (logout) */
    kernelHeight(state, payload){
      state.kernelHeights = payload ? Object.assign({}, state.kernelHeights, {[payload.id]: payload.height}) : {};
    },
    /* null resets it (logout, stopped) */
    httpListener(state, payload){
      state.httpListener = payload ? Object.assign({state: 'off', port: 0, reason: ''}, payload) : {state: 'off', port: 0, reason: ''};
    },




    nodeStatus(state, payload){


        if(payload.sync_status){
          switch(payload.sync_status){
            case 'header_sync':
              payload.sync_status = 'Header sync'
            break;
            case 'body_sync':
              payload.sync_status = 'Body sync'
            break;
            case 'awaiting_peers':
              payload.sync_status = 'Awaiting peers'
            break;

            case 'txhashset_download':
              payload.sync_status = 'Download Txhashset'
            break;
            case 'syncing':
                payload.sync_status = '... processing'
            break;
            case 'txhashset_rangeproofs_validation':
              payload.sync_status = 'Validate rangeproofs'
            break;
            case 'txhashset_kernels_validation':
              payload.sync_status = 'Validate block kernels'
            break;
            default:
              payload.sync_status = 'synced'
            break;
          }
        }
/*
sync_info:
rproofs: 19000
rproofs_total: 64579
*/
        if(payload && !payload.sync_info){
          payload.sync_info = {
            current_height: 0,
            highest_height: 0,
            downloaded_size: 0,
            total_size: 0,
            rproofs: 0,
            rproofs_total: 0,
            kernels: 0,
            kernels_total: 0,
          }
        }
        state.nodeStatus = payload;
    },
    nodeType(state, payload){
      state.nodeType = payload;
    },

    /* AppStyle */
    appStyle (state, payload) {
      state.appStyle = payload
    },

    txs(state, payload) {
      if (payload) {
        state.txs = payload;
      }
    },

    summary(state, payload) {
      if (payload) {
        state.summary = payload;
      }
    },

    walletTip(state, payload) {
      state.walletTip = Number(payload) || 0;
    },

    walletSync(state, payload) {
      state.walletSync = payload;
    },

    listenerStarting(state, payload) {
      state.listenerStarting = !!payload;
    },

    loginStage(state, payload) {
      state.loginStage = payload || '';
    },

    nodeProblem(state, payload) {
      state.nodeProblem = payload || null;
    },

    /* merge into the current node problem (e.g. {epicboxSkipped: true}); nothing when there is none */
    nodeProblemUpdate(state, payload) {
      if (state.nodeProblem) {
        state.nodeProblem = {...state.nodeProblem, ...payload};
      }
    },

    nodeAddressChange(state, payload) {
      state.nodeAddressChange = payload || null;
    },

    commits(state, payload) {
      if (payload) {
        state.commits = payload;
      }
    },

    hideValues(state) {
      state.hideValues = state.hideValues !== true;
    },


    /* User */
    user (state, payload) {
      if(payload){
        state.user = payload
      }

      if (payload.name) {
        state.userAvatar = avatarLetters(payload.name);
      }

    },

    /* aside right update */
    updates(state, payload) {
      if (payload) {
        state.updates.unshift(payload);
        state.hasUpdates = true;
      }

    },

    /* Full Page mode */
    fullPage (state, payload) {
      state.isNavBarVisible = !payload
      state.isAsideVisible = !payload
      state.isFooterBarVisible = !payload
      state.isOverlayVisible = false
      state.isLayoutFullPage = payload
    },

    /* Aside Desktop Visibility */
    asideVisibilityToggle (state, payload) {
      state.isAsideVisible = payload
    },

    /* Aside Desktop State */
    asideStateToggle (state, payload = null) {
      const isExpand = payload !== null ? payload : !state.isAsideExpanded

      document.documentElement.classList[isExpand ? 'add' : 'remove']('has-aside-expanded')

      state.isAsideExpanded = isExpand
    },



    /* Aside Forced Active Key (when secondary submenu is open) */
    asideActiveForcedKeyToggle (state, payload) {
      state.asideActiveForcedKey = payload && payload.menuSecondaryKey ? payload.menuSecondaryKey : null
    },

    /* Aside Right */
    asideRightToggle (state, payload) {
      state.isAsideRightVisible = payload
      state.isAsideRightActive = payload
      state.hasUpdates = false
    },

    /* Overlay */
    overlayToggle (state, payload = null) {
      const setIsVisible = payload !== null ? payload : !state.isOverlayVisible

      if (!setIsVisible && state.isLayoutAsideHidden && (state.isAsideVisible || state.isAsideRightVisible)) {
        return
      }

      state.isOverlayVisible = setIsVisible

      document.documentElement.classList[setIsVisible ? 'add' : 'remove']('is-clipped')
    },

    /* Layouts */
    layoutBoxedToggle (state, payload = null) {
      const setIsBoxed = payload !== null ? payload : !state.isLayoutBoxed

      state.isLayoutAsideHidden = setIsBoxed
      state.isLayoutBoxed = setIsBoxed
      state.isAsideExpanded = setIsBoxed
      state.isAsideVisible = !setIsBoxed
      state.isAsideRightVisible = false
      state.isAsideRightActive = false

      document.documentElement.classList[setIsBoxed ? 'remove' : 'add']('has-aside-left', 'has-navbar-fixed-top')
      document.documentElement.classList[setIsBoxed ? 'add' : 'remove']('has-boxed-layout', 'has-aside-hidden-layout', 'has-aside-expanded')
    },

    layoutWideToggle (state, payload = null) {
      const setIsWide = payload !== null ? payload : !state.isLayoutBoxed

      state.isLayoutAsideHidden = setIsWide
      state.isAsideExpanded = setIsWide
      state.isAsideVisible = !setIsWide
      state.isAsideRightVisible = !setIsWide

      document.documentElement.classList[setIsWide ? 'remove' : 'add']('has-aside-left')
      document.documentElement.classList[setIsWide ? 'add' : 'remove']('has-aside-hidden-layout', 'has-aside-expanded')
    },

    /* the modern colour scheme, saved and applied by shared/theme.js saveScheme() */
    scheme (state, payload) {
      state.scheme = payload;
    },

    /* Dark Mode */
    darkModeToggle (state, payload = null) {
      const setIsDark = payload !== null ? payload : !state.isDarkModeActive

      state.isDarkModeActive = setIsDark

      document.documentElement.classList[setIsDark ? 'add' : 'remove']('is-dark-mode-active')
    },



  },
  getters: {
    /* the tip confirmations are counted from: the newer of the wallet's own (last_confirmed_height
       of the latest refresh) and the node's, so the count follows each new block; a new node tip
       also triggers a wallet refresh (App.vue nodeStatus) */
    tipHeight(state){
      const node = state.nodeStatus && state.nodeStatus.tip ? Number(state.nodeStatus.tip.height) || 0 : 0;
      return Math.max(state.walletTip || 0, node);
    },
  },
  actions: {

    async processTxs({ commit, state }, payload) {

      let transactionsWithAddress = await payload.table.getAddress(state.user.id);

      let txs_processed = await payload.data.map(function(x){
        x.status = 'unconfirmed'
        if( x.confirmed){
          x.status = 'confirmed'
        }
        if( x.tx_type.search('Cancelled') != -1){
          x.status = 'cancelled'
        }
        if(x.status === 'unconfirmed' && x.tx_type != 'TxSentMempool'){
          x.cancelable = true
        }
        let hasAddress = transactionsWithAddress.find(function(transaction, index) {
          if(transaction.slateid == x.tx_slate_id)
            return true;
        });
        if(hasAddress){

          x.address = hasAddress;
        }
        //a send whose reply has not come for a few minutes: the list says so, next to Cancel
        x.waitingReply = waitingForReply(x, Date.now());

        return x
      })
      state.debug ? console.log('processTxs', txs_processed) : null;
      commit('txs', txs_processed);

    },

    processCommits({ commit, state }, cts){

      //confirmations are worked out by the views from getters.tipHeight, so they follow each new block
      let cts_processed = cts.map(ct => ct['output'])

      state.debug ? console.log('processCommits', cts_processed) : null;
      commit('commits', cts_processed);
    },

    asideCloseAll ({ commit }) {
      commit('asideVisibilityToggle', false)
      commit('asideRightToggle', false)
      commit('overlayToggle', false)
    },
    asideVisibilityToggle ({ commit, state }, payload = null) {
      const setIsVisible = payload !== null ? payload : !state.isAsideVisible

      commit('asideVisibilityToggle', setIsVisible)
      commit('overlayToggle', setIsVisible)
    },
    asideRightToggle ({ commit, state }, payload = null) {
      const isShow = payload !== null ? payload : !state.isAsideRightVisible

      commit('asideRightToggle', isShow)

      if (state.isLayoutAsideHidden) {
        commit('overlayToggle', isShow)
      }

      if (!state.isLayoutAsideHidden) {
        document.documentElement.classList[isShow ? 'add' : 'remove']('has-aside-right')
      }
    },

    toggleFullPage ({ commit }, payload) {


      commit('layoutBoxedToggle', false)
      commit('fullPage', payload)

      document.documentElement.classList.remove('is-clipped')

      if (payload) {
        document.documentElement.classList.remove('has-aside-left', 'has-navbar-fixed-top')
      }
    },

  }
})

export function useStore () {
  return store
}
