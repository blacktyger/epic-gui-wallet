require('promise.prototype.finally').shim();
import { fetchNodeVersion, fetchNodeStatus, classifyNode, fetchTipHeight } from './nodeVersion.js';

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
  }

  async restartNode(){

    //if restart failed at some point we stop restarting the node
    if(this.restartSuccess){
      this.debug ? console.log('NodeService.restartNode') : null;
      this.restartSuccess = false;
      await this.stopNode();
      this.restartSuccess = await this.internalNodeStart();
      return this.restartSuccess;
    }

  }
  /* stop the node this app started (never a node someone else runs) */
  async stopNode(){

      const res = await window.nodeChildProcess.stopOwned(['node']);
      this.debug ? console.log('NodeService.stopNode', JSON.stringify(res.stopped)) : null;
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

  /* ok | too_old | status_locked | unreachable | not_epic for the saved node (shared/nodeVersion.js) */
  async classifyNode(address){
    const check = await classifyNode(address, {apiSecret: this.configService.apisecret, referenceHeight: () => this.referenceHeight()});
    //for the status polls: a status read via get_tip has no user agent, the panel shows this version
    this.nodeVersion = check.version || '';
    return check;
  }

  /* the height a node with only a tip (POST /v2/foreign get_tip) is compared with to call it synced:
     the public node's tip on mainnet (asked at most once a minute), else the highest height seen */
  async referenceHeight(){
    const now = Date.now();
    if((this.configService.defaultAccountNetwork || 'mainnet') == 'mainnet' && (!this.referenceTip || now - this.referenceTip.at > 60000)){
      const height = await fetchTipHeight(this.configService.getNodeFallBack(), {timeoutMs: 5000});
      //a failed ask keeps the last known one and is tried again in a minute
      this.referenceTip = {height: height || (this.referenceTip ? this.referenceTip.height : 0), at: now};
    }
    return Math.max(this.referenceTip ? this.referenceTip.height : 0, this.highestSeenHeight || 0);
  }

  /* remember the highest tip a status showed (the reference when there is no public node) */
  noteHeight(status){
    const h = status && status.tip ? Number(status.tip.height) || 0 : 0;
    const high = status && status.sync_info ? Number(status.sync_info.highest_height) || 0 : 0;
    this.highestSeenHeight = Math.max(this.highestSeenHeight || 0, h, high);
  }

  async getNodeStatus(internal){

    let baseURL = this.configService.config['check_node_api_http_addr'] ? this.configService.config['check_node_api_http_addr'] : this.configService.defaultEpicNode;

    //GET /v1/status; on a 401 (plain node 4.1.0) the same status from POST /v2/owner get_status,
    //else the tip from POST /v2/foreign get_tip. The node secret is sent to the local node only
    const res = await fetchNodeStatus(baseURL, {apiSecret: this.configService.apisecret, timeoutMs: 10000, referenceHeight: () => this.referenceHeight(), version: this.nodeVersion || ''});
    if(!res.ok){
      window.log ? console.log('NodeService.fetch', res.reason) : null;
    }
    //how the status was read last: 'v1', 'owner' or null
    this.statusVia = res.ok ? res.via : null;
    let response = res.ok ? res.status : false;
    if(response && res.via != 'foreign'){
      this.noteHeight(response);
    }

    /* check if node status is ok or need a restart because is stalled */
    if(internal){

      if(!response){
        this.syncStatusCheckedTime = Math.floor(Date.now() / 1000);
        await this.restartNode();
      }else{
        //check some other indicators that node is not stalled
        if((this.syncStatusCheckedTime+this.sysnStatusStalltime) < Math.floor(Date.now() / 1000)){
          this.syncStatusCheckedTime = Math.floor(Date.now() / 1000);

          //never restart at this stages
          if(!this.safeSyncStates.includes(response.sync_status)){
            let restart = false;


            //no peers
            if(response.connections == 0 && response.sync_status !== 'awaiting_peers'){
              this.debug ? console.log('NodeService.nopeers', response.connections) : null;
              restart = true;
            }
            //if node is synced but has no tip height
            if(response.tip && response.tip.height == 0 && response.sync_status === 'no_sync'){
              this.debug ? console.log('NodeService.notipheight', response.sync_status) : null;
              restart = true;
            }

            if(response.sync_info && response.sync_info.highest_height == 0 && response.sync_status !== 'awaiting_peers'){
              this.debug ? console.log('NodeService.nohighest_height', response.sync_info.highest_height) : null;
              restart = true;
            }
            // body_sync has latest block height but do not switch to no_sync
            if(response.sync_status === 'body_sync' && response.tip.height == response.sync_info.current_height && response.sync_info.highest_height == response.sync_info.current_height){
              this.debug ? console.log('NodeServicen.not_switch_to_no_sync', response) : null;
              restart = true;
            }

            if(restart){
              await this.restartNode();
            }

          }
        }
      }
    }

    this.debug ? console.log('NodeService.getNodeStatus', response) : null;
    return response;

  }

}

export default NodeService
