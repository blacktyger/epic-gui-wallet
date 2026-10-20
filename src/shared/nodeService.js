require('promise.prototype.finally').shim();
import { fetchNodeVersion, fetchNodeStatus, fetchLocalStatus, classifyNode } from './nodeVersion.js';
import { loadDirectory, CHAINS } from './nodeDirectory.js';
import { assessNodeStatus, directoryReferenceHeight, createBehindTracker } from './nodeHealth.js';
import { probeNode, createCheckCache } from './nodeCheck.js';

//the node list is asked for once at the first status and then at most every 10 minutes (the main
//process caches it for a minute, so the Settings node list may have fetched it already), and a
//network tip older than DIRECTORY_MAX_AGE_MS is not used
const DIRECTORY_EVERY_MS = 10 * 60 * 1000;
const DIRECTORY_MAX_AGE_MS = 15 * 60 * 1000;

const log = window.log;
console.log = log.log;

class NodeService {

  constructor(emitter, configService) {
      this.emitter = emitter;
      this.configService = configService;
      this.internalNodeProcess = false;
      this.syncStatusLastHeight = 0;
      this.syncStatusCheckedTime = Math.floor(Date.now() / 1000);
      this.sysnStatusStalltime = (60*3); //3 minutes
      this.restartSuccess = true;
      this.debug = true;//window.debug;
      //do not restart on this node states
      this.safeSyncStates = [
        'txhashset_download',
        'syncing',
        'txhashset_rangeproofs_validation',
        'txhashset_kernels_validation',

      ]
      //the network tip from the public node list (nodeHealth.js): {chain, height, at}
      this.networkTip = null;
      this.directoryAskedAt = 0;
      this.behindTracker = createBehindTracker();
      this.checkCache = createCheckCache({ttlMs: 60 * 1000});
  }

  async restartNode(){

    //if restart failed at some point we stop restarting the node
    if(this.restartSuccess){
      this.restartSuccess = false;
      await this.stopNode();
      this.restartSuccess = await this.internalNodeStart();
      console.log('[node] built-in node restart ' + (this.restartSuccess ? 'started' : 'failed' + (this.portInUse ? ': port ' + this.portInUse + ' in use' : '')));
      return this.restartSuccess;
    }

  }
  /* stop the node this app started (never a node someone else runs) */
  async stopNode(){

      const res = await window.nodeChildProcess.stopOwned(['node']);
      console.log('[node] built-in node stopped: ' + ((res && res.stopped) || []).map(p => p && typeof p === 'object' ? p.pid : p).join(', '));
  }


  async internalNodeStart(){

    //our node of this network may still run (node_background)
    this.portInUse = 0;
    let internalNodeProcess = await window.nodeChildProcess.ownedProcesses(['node'], {network: this.configService.defaultAccountNetwork});

    if(!internalNodeProcess.length){
      //another node (e.g. the user's own) holds the api port: leave it alone, say so
      const port = this.configService.getNodeApiPort();
      if(await window.config.isPortReachable('127.0.0.1', port)){
        this.portInUse = port;
        return false;
      }

      //always with 6.1's own toml (<root>/node/<net>/epic-server.toml): without --config_file the
      //node would use ~/.epic. The preload starts it in that folder.
      if(!this.configService.nodeTOMLPath && !this.configService.startCheckNode()){
        return false;
      }
      let args = [
        ...(this.configService.defaultAccountNetwork != 'mainnet' ? ['--' + this.configService.defaultAccountNetwork] : []),
        'server', '--config_file', this.configService.nodeTOMLPath, 'run',
      ];

      let nodeOpenId = await window.nodeChildProcess.execNode(this.configService.epicNodePath, args, this.configService.platform);
      if(nodeOpenId > 0){
        this.internalNodeProcess = true;
      }else{
        return false;
      }

    }
    return true;

  }

  /* is there an Epic node at this address? Works without the api secret on every node version
     (shared/nodeVersion.js). returns {ok: true, version} or {ok: false, reason} */
  async checkNodeVersion(address){
    return fetchNodeVersion(address);
  }

  /* a live check of an address the user typed or saved (Settings › Node, My nodes): a view for the
     screens (shared/nodeCheck.js nodeCheckView), null when there is nothing to ask or it was cancelled.
     Never with the api secret. The results are kept a minute (checkCache), for the field and the list */
  async probeNode(address, {signal} = {}){
    return probeNode(address, {signal, tipHeight: () => this.liveTipHeight()});
  }

  /* the network tip for a live check: the public node list (the main process keeps it a minute),
     else the last tip known */
  async liveTipHeight(){
    const chain = this.configService.defaultAccountNetwork || 'mainnet';
    if(CHAINS.includes(chain)){
      const height = directoryReferenceHeight(await loadDirectory(window.api, chain, 2500));
      if(height > 0){
        this.networkTip = {chain, height, at: Date.now()};
        return height;
      }
    }
    return Math.max(this.networkTipHeight(), this.highestSeenHeight || 0);
  }

  /* ok | too_old | unreachable | not_epic for the saved node (shared/nodeVersion.js) */
  async classifyNode(address){
    const check = await classifyNode(address, {referenceHeight: () => this.referenceHeight()});
    //for the status polls: a status read via get_tip has no user agent, the panel shows this version
    this.nodeVersion = check.version || '';
    if(check.status){
      check.status = this.assessStatus(check.status);
    }
    return check;
  }

  /* the height a node with only a tip (POST /v2/foreign get_tip) is compared with to call it synced:
     the network tip from the last node list, else the highest height seen. Asks nothing itself */
  async referenceHeight(){
    this.refreshNetworkTip();
    return Math.max(this.networkTipHeight(), this.highestSeenHeight || 0);
  }

  /* a node was (re)started or switched: its "behind" count starts again */
  resetHealth(){
    this.healthEpoch = (this.healthEpoch || 0) + 1;
    this.behindTracker.reset();
    this.highestSeenHeight = 0;
  }

  /* remember the highest tip a status showed (the reference when there is no public node) */
  noteHeight(status){
    const h = status && status.tip ? Number(status.tip.height) || 0 : 0;
    const high = status && status.sync_info ? Number(status.sync_info.highest_height) || 0 : 0;
    this.highestSeenHeight = Math.max(this.highestSeenHeight || 0, h, high);
  }

  /* ask the main process for the public node list in the background, never awaited: the status
     is checked against the last list there is (none yet, or none for usernet: nodeHealth's fallback) */
  refreshNetworkTip(){
    const chain = this.configService.defaultAccountNetwork || 'mainnet';
    const now = Date.now();
    if(!CHAINS.includes(chain) || now - this.directoryAskedAt < DIRECTORY_EVERY_MS){
      return;
    }
    this.directoryAskedAt = now;
    loadDirectory(window.api, chain).then((dir) => {
      const height = directoryReferenceHeight(dir);
      if(height > 0){
        this.networkTip = {chain, height, at: Date.now()};
      }
    }).catch(() => {});
  }

  /* the network tip for the wallet's network from the last list, 0 if none */
  networkTipHeight(){
    const chain = this.configService.defaultAccountNetwork || 'mainnet';
    const tip = this.networkTip;
    return tip && tip.chain == chain && Date.now() - tip.at < DIRECTORY_MAX_AGE_MS ? tip.height : 0;
  }

  /* the status as the wallet uses it (nodeHealth.assessNodeStatus): at the network tip is synced,
     whatever the node says. node_behind: how many blocks behind once BEHIND_CONFIRMATIONS counted
     checks in a row said so, else 0 (the UI's "Your node is N blocks behind"). Only the 10 s status
     poll counts (count: true); other reads (the Epicbox wait, the check at node start) get the
     last counted value */
  assessStatus(status, {count = false} = {}){
    this.refreshNetworkTip();
    const assessed = assessNodeStatus(status, {referenceHeight: this.networkTipHeight()});
    const ok = assessed && typeof assessed === 'object' && !assessed.error;
    const behind = count ? this.behindTracker.update(ok && assessed.behind_blocks) : this.behindTracker.current();
    return ok ? {...assessed, node_behind: behind} : assessed;
  }

  /* the node's status (assessStatus); poll: the regular 10 s status poll, the only read counted for
     the "behind" line */
  async getNodeStatus(internal, {poll = false} = {}){
    //a read that was on its way when the node was switched does not count for the new one
    const epoch = this.healthEpoch;

    let baseURL = this.configService.config['check_node_api_http_addr'] ? this.configService.config['check_node_api_http_addr'] : this.configService.defaultEpicNode;

    //every node is read the same way, from the public foreign API: get_tip + ready_for_txs (no secret).
    //Reads at the same time (the poll, the Epicbox wait) share one request
    const key = baseURL;
    if(!this.statusRead || this.statusRead.key !== key){
      //checked_at / response_ms: for Settings › Node (last checked, response time)
      const started = Date.now();
      const read = fetchNodeStatus(baseURL, {timeoutMs: 10000, referenceHeight: () => this.referenceHeight(), version: this.nodeVersion || ''})
        .then((r) => r.ok ? {...r, status: {...r.status, checked_at: Date.now(), response_ms: Date.now() - started}} : r);
      this.statusRead = {key, read};
      read.finally(() => { if(this.statusRead && this.statusRead.read === read) this.statusRead = null; });
    }
    const res = await this.statusRead.read;
    if(!res.ok){
      this.logNodeLine(baseURL, 'no status: ' + res.reason);
    }
    let response = res.ok ? res.status : false;

    /* check if node status is ok or need a restart because is stalled */
    if(internal){

      if(!response){
        this.syncStatusCheckedTime = Math.floor(Date.now() / 1000);
        if(this.restartSuccess) console.log('[node] built-in node does not answer, restarting');
        await this.restartNode();
      }else{
        //check some other indicators that node is not stalled. Only the watchdog reads the built-in
        //node's own GET /v1/status (localhost, api secret), on its own interval and never for the UI:
        //the foreign API can't tell a long txhashset download from a stall
        if((this.syncStatusCheckedTime+this.sysnStatusStalltime) < Math.floor(Date.now() / 1000)){
          this.syncStatusCheckedTime = Math.floor(Date.now() / 1000);
          const own = await fetchLocalStatus(baseURL, {apiSecret: this.configService.apisecret});
          await this.watchdog(own);
        }
      }
    }

    //the node's tip is the reference when there is no public node
    if(response){
      this.noteHeight(response);
    }
    response = this.assessStatus(response, {count: poll && epoch === this.healthEpoch});
    if(response){
      const tip = response.tip && response.tip.height;
      this.logNodeLine(baseURL, (internal ? 'built-in' : 'remote') + ', ' + response.sync_status,
        'height ' + tip + (response.node_behind ? ', ' + response.node_behind + ' behind' : ''));
    }
    return response;

  }

  /* the built-in node's stall checks on its own status (null: it gave none, nothing to judge) */
  async watchdog(response){
    if(!response || this.safeSyncStates.includes(response.sync_status)){
      //never restart at these stages
      return;
    }
    let restart = false;

    //no peers
    if(response.connections == 0 && response.sync_status !== 'awaiting_peers'){
      console.log('[node] built-in node stalled (no peers, ' + response.sync_status + '), restarting');
      restart = true;
    }
    //if node is synced but has no tip height
    if(response.tip && response.tip.height == 0 && response.sync_status === 'no_sync'){
      console.log('[node] built-in node stalled (synced but no tip height, ' + response.sync_status + '), restarting');
      restart = true;
    }

    if(response.sync_info && response.sync_info.highest_height == 0 && response.sync_status !== 'awaiting_peers'){
      console.log('[node] built-in node stalled (no highest height, ' + response.sync_status + '), restarting');
      restart = true;
    }
    // body_sync has latest block height but do not switch to no_sync
    if(response.sync_status === 'body_sync' && response.tip.height == response.sync_info.current_height && response.sync_info.highest_height == response.sync_info.current_height){
      console.log('[node] built-in node stalled (body sync at the tip but not done, ' + response.sync_status + '), restarting');
      restart = true;
    }

    if(restart){
      await this.restartNode();
    }
  }

  /* one log line when the node's state changes (not every 10 s poll): the state, and details that
     change all the time (height) only with it. The address without user:password@ */
  logNodeLine(url, state, detail = ''){
    let addr = String(url || '');
    try{ const u = new URL(addr); u.username = ''; u.password = ''; addr = u.origin; }catch(e){ /* as it is */ }
    const key = addr + ' ' + state;
    if(key === this.lastNodeLine) return;
    this.lastNodeLine = key;
    console.log('[node] ' + addr + ': ' + state + (detail ? ' (' + detail + ')' : ''));
  }

}

export default NodeService
