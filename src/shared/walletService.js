
import axios from 'axios';
import { REFRESH_CALL_TIMEOUT } from '@/shared/walletSync';
import { ownerApiArgs, listenArgs, epicboxArgs, initArgs, statusMessageText, OWNER_API_START_DIR } from '@/shared/walletArgs';
const Buffer = require('buffer').Buffer;
const crypto = window.nodeCrypto;

require('promise.prototype.finally').shim();

const log = window.log;
console.log = log.log;
const ownerApiPort = 3420;
const jsonRPCUrl = 'http://127.0.0.1:3420/v3/owner'
const jsonRPCForeignUrl = 'http://127.0.0.1:3420/v2/foreign'

class WalletService {

    constructor(emitter, configService) {
        this.emitter = emitter;
        this.client;
        this.configService = configService;
        this.walletProcess = false;
        this.walletIsListen = false;
        this.walletIsEpicbox = false;
        this.shared_key;
        this.token;
        this.debug = window.debug;
    }

    logoutClient(){
      this.client = undefined;
      this.shared_key = undefined;
      this.token = undefined;
      this.walletIsListen = false;
      this.walletIsEpicbox = false;
    }
    async initSecure(url) {

      let emitter = this.emitter;
      let secp256k1 = window.nodeSecp256k1;


      let privateKey = secp256k1.utils.randomPrivateKey();
      let publicKey = secp256k1.getPublicKey(privateKey);


      const params = {
          'ecdh_pubkey': Buffer.from(publicKey).toString('hex')
      }

      const headers = {
          'Content-Type': 'application/json'
      }

      const body = {
          jsonrpc: "2.0",
          id: +new Date(),
          method: 'init_secure_api',
          params: params,
      }

      let response = await this.client.post(url, body, headers).catch(error => {
            this.debug ? console.log('walletService.initSecure', error) : null;
            return false;
      });

      //wallet api not reachable or refused the key exchange
      if(!response || !response.data || !response.data.result || !response.data.result.Ok){
        return undefined;
      }

      let key = secp256k1.getSharedSecret(privateKey, response.data.result.Ok);
      return Buffer.from(key).toString('hex').substr(2, 64);

    }

    initClient() {

      let baseURL = this.configService.config['check_node_api_http_addr'] ? this.configService.config['check_node_api_http_addr'] : this.configService.defaultEpicNode;
      let password = this.configService.ownerApisecret;

      return new Promise(function(resolve, reject) {

                let client = axios.create({
                    baseURL: baseURL,
                    auth: {
                        username: 'epic',
                        password: password
                    },
                    withCredentials:true

                })

                resolve(client);
      });
    }

    /* timeout (ms, 0: none): give up on a call the wallet does not answer; why the last call
       failed is kept in lastError, for the log */
    async jsonRPC(method, params, isForeign, timeout = 0){
        this.lastError = '';
        const headers = {
            'Content-Type': 'application/json',
            'withCredentials': true,
            'credentials': 'same-origin'
        }

        const body = {
            jsonrpc: "2.0",
            id: +new Date(),
            method: method,
            params: params,
        }

        const url = isForeign ? jsonRPCForeignUrl : jsonRPCUrl


        if(this.client == undefined){
          this.client = await this.initClient();
        }

        if(this.shared_key == undefined){
           this.shared_key = await this.initSecure(url);

        }

        //do not enrypt receive_tx


        if(!isForeign){

          //no shared key: the wallet api is down
          if(this.shared_key == undefined){
            this.lastError = 'no secure connection to the wallet API';
            return false;
          }

          const aesCipher = window.nodeAes256gcm(this.shared_key);
          const nonce = new Buffer.from(crypto.randomBytes(12));
          let enc = aesCipher.encrypt(JSON.stringify(body), nonce);

          let encParams = {
            'nonce': nonce.toString('hex'),
            'body_enc': enc,
          }
          const encBody = {
            jsonrpc: "2.0",
            id: + new Date(),
            method: 'encrypted_request_v3',
            params: encParams,
          }


          let response = await this.client.post(url, encBody, Object.assign({}, headers, timeout ? {timeout: timeout} : {}))
          .catch(error => {
                //the error object holds the request, with the owner API secret: log its message only
                this.lastError = (error.code == 'ECONNABORTED' || error.code == 'ETIMEDOUT') ? 'no answer within ' + Math.round(timeout/1000) + ' s' : (error.message || String(error));
                this.debug ? console.log('WalletService.error', method, this.lastError) : null;
                return false;
          });
          let nonce2;
          let data;
          if(response.data && response.data.result){
            nonce2 = Buffer.from(response.data.result.Ok.nonce, 'hex');
            data = Buffer.from(response.data.result.Ok.body_enc, 'base64');
          }else{
            if(response && response.data && response.data.error && !this.lastError){
              this.lastError = response.data.error.message || JSON.stringify(response.data.error);
            }
            this.debug ? console.log('WalletService.jsonRPC', method) : null;
            return false;
          }

          let dec = aesCipher.decrypt(data, nonce2)

          if(dec != ''){
            let response = JSON.parse(dec);

            return response;
          }
      }else{

        let response = await this.client.post(url, body, headers, {withCredentials:true})
        .catch(error => {
              this.debug ? console.log('WalletService.jsonRPC', error) : null;
              return false;
        });


        if(response){
          return response;
        }else{
          this.debug ? console.log('WalletService.noresponce', method) : null;
        }

      }

      return false;

    }

    async getNodeHeight(){
        return await this.jsonRPC(
          'node_height',
          {
            token: this.token
          }, false);
    }

    async getSummaryInfo(minimum_confirmations, refreshfromNode = true){
        return await this.jsonRPC(
          'retrieve_summary_info',
          {
            token: this.token,
            refresh_from_node: refreshfromNode,
            minimum_confirmations: minimum_confirmations
          }, false, REFRESH_CALL_TIMEOUT);
    }

    async getTransactions(toRefresh, tx_id, tx_salte_id){
        return await this.jsonRPC('retrieve_txs',
          {
            token: this.token,
            refresh_from_node: toRefresh,
            tx_id: tx_id,
            tx_slate_id: tx_salte_id,
            limit: null,
            offset: null,
            sort_order: null,
          }, false, REFRESH_CALL_TIMEOUT);
    }

    async getCommits(include_spent, toRefresh, tx_id){
        return await this.jsonRPC(
          'retrieve_outputs',
          {
            token: this.token,
            include_spent: include_spent,
            refresh_from_node: toRefresh,
            tx_id: tx_id,
            limit: null,
            offset: null,
            sort_order: null,
          }, false, REFRESH_CALL_TIMEOUT);
    }

    async cancelTransactions(tx_id, tx_salte_id){
      return await this.jsonRPC(
          'cancel_tx',
          {
            token: this.token,
            tx_id: tx_id,
            tx_slate_id: tx_salte_id
          }, false);
    }

    async receiveTransaction(slate, account, message){
      return this.jsonRPC('receive_tx', [slate, account, message, null], true)
    }

    async issueSendTransaction(tx_data){
      return await this.jsonRPC(
        'init_send_tx',
        {
          token: this.token,
          args: tx_data
        }, false);
    }

    async lock_outputs(params){

      return await this.jsonRPC(
        'tx_lock_outputs',
        {
          token: this.token,
          slate: params,
          participant_id: 0,
          addr_to: "",
        }, false);
    }

    async finalizeTransaction(slate){
      return await this.jsonRPC(
        'finalize_tx',
        {
          token: this.token,
          slate: slate
        }, false);
    }

    async postTransaction(tx){
      return await this.jsonRPC(
        'post_tx',
        {
          token: this.token,
          tx: tx,
          fluff: true
        }, false);
    }

    async getPubliProofAddress(){
      return this.jsonRPC(
        'get_public_proof_address',
        {
          "token": this.token,
          "derivation_index": 0
        }, false);
    }

    async getEpicboxAddress(){

      return this.jsonRPC(
        'get_public_address',
        {
          "token": this.token,
          "derivation_index": 0
        }, false);
    }

    async getProofAddressFromOnionV3(address_v3){
      return this.jsonRPC(
        'proof_address_from_onion_v3',
        {
          "address_v3": address_v3
        }, false);
    }

    async getMnemonic(password){

      return this.jsonRPC(
        'get_mnemonic',
        {
          "name": "",
          "password": password
        }, false);
    }


    /* start a epic wallet in owner_api mode
       knownNotRunning: the caller just scanned the processes (killEpicProcess) and no owner_api is left,
       so skip another scan (each one spawns ps, or powershell on Windows: ~1 s there) */
    async start(password, emitOutput, knownNotRunning = false, onStage = () => {}){
        this.lastStartFailure = '';

        let walletProcess = [];
        this.client = undefined;
        this.shared_key = undefined;

        //only an owner_api this app started for this wallet is reused, never someone else's
        if(!knownNotRunning){
          walletProcess = await window.nodeChildProcess.ownedProcesses(['owner_api'], {dir: this.configService.walletConfigDir});
        }

        if(!walletProcess.length){

          //another program (e.g. the user's own CLI wallet) holds the owner API port: say so, don't touch it
          if(await window.config.isPortReachable('127.0.0.1', ownerApiPort)){
            return {success:false, msg:'port ' + ownerApiPort + ' in use', portInUse: ownerApiPort};
          }

          //no password: the wallet is opened below, over the encrypted API (shared/walletArgs.js).
          //The start dir is in 6.1's config dir: nothing is created in an imported wallet's folder
          const configDir = this.configService.walletConfigDir;
          let args = ownerApiArgs({
            network: this.configService.defaultAccountNetwork,
            configDir: configDir,
            dataDir: this.configService.walletDataDir,
            startDir: window.nodePath.join(configDir, OWNER_API_START_DIR),
          });

          let walletOpenId = await window.nodeChildProcess.execStart(this.configService.epicPath, args, this.configService.platform, emitOutput);

          if(walletOpenId > 0){
            this.walletProcess = true;
          }else{
            //-1: the wallet said the password is wrong; anything else: the service didn't start.
            //Read by the BT Labs Theme unlock screen; the result is the same as before.
            this.lastStartFailure = walletOpenId === -1 ? 'password' : 'service';
            return {success:false, msg:'Error opening wallet (is password correct?)'};
          }
        }

        onStage('unlock');
        //the folder holding wallet_data: an older GUI's folder for an imported wallet
        let userTopDir = await this.jsonRPC('set_top_level_directory', {dir: this.configService.walletDataDir}, false)

        if(userTopDir && userTopDir.result){

            let tokenResponse = await this.jsonRPC('open_wallet', {"name": "", password: password}, false)

            if(tokenResponse.result){
              this.token = tokenResponse.result.Ok;
            }else if(tokenResponse.error){

              //a wrong password: the same plain message as when epic-wallet itself refused it
              const err = tokenResponse.error.message || String(tokenResponse.error);
              if(err.includes('Error opening wallet')){
                return {success:false, msg:'Error opening wallet (is password correct?)'};
              }
              return {success:false, msg: tokenResponse.error};
            }

            if(this.token){
              return {success:true, msg:this.token};
            }
        }

        return {success:false, msg:'wallet start unknown error'};
    }

    /* start a epic wallet in listen mode */
    async startEpicbox(password){


        let args = [];
        let torBooted = false;
        //our Epicbox listener for this wallet may still run (epicbox_background, or the previous version's,
        //adopted at login): reuse it. execEpicbox doesn't start a second one either while ours runs
        let walletIsEpicbox = await window.nodeChildProcess.ownedProcesses(['epicbox'], {dir: this.configService.walletConfigDir});

        if(!walletIsEpicbox.length){


          let walletListenId = 0;

          let args = epicboxArgs({
            network: this.configService.defaultAccountNetwork,
            configDir: this.configService.walletConfigDir,
            dataDir: this.configService.walletDataDir,
            password: password,
          });

          walletListenId = await window.nodeChildProcess.execEpicbox(this.configService.epicPath, args, this.configService.platform, password);

          if(walletListenId && walletListenId.msg > 0){
              this.walletIsEpicbox = true;

          }else{
            return {success:false};
          }
        }

        return {success:true};
    }

    /* start a epic wallet in listen mode */
    async startListen(password, tor, method){


        let args = [];
        let torBooted = false;
        let walletIsListen = await window.nodeChildProcess.ownedProcesses(['listen'], {dir: this.configService.walletConfigDir});

        if(!walletIsListen.length){

          //another program holds the listener port: say so, don't touch it
          const port = this.configService.walletListenerPort;
          if(await window.config.isPortReachable('127.0.0.1', port)){
            return {success:false, tor: torBooted, portInUse: port};
          }

          let walletListenId = 0;

          //the GUI only listens via http (Epicbox has its own startEpicbox); method is kept for callers
          let args = listenArgs({
            network: this.configService.defaultAccountNetwork,
            configDir: this.configService.walletConfigDir,
            dataDir: this.configService.walletDataDir,
            password: password,
            tor: tor,
          });

          walletListenId = await window.nodeChildProcess.execListen(this.configService.epicPath, args, this.configService.platform, password);

          if(walletListenId && walletListenId.msg > 0){
              this.walletIsListen = true;
              torBooted = walletListenId.tor;
              //the listener started here (none when one was already running)
              return {success:true, tor: torBooted, pid: walletListenId.msg};
          }else{
            return {success:false, tor: torBooted};
          }
        }

        return {success:true, tor: torBooted};
    }

    async isListen(){

      let walletIsListen = await window.nodeChildProcess.ownedProcesses(['listen'], {dir: this.configService.walletConfigDir});
      return walletIsListen.length > 0;
    }

    /* stop our listeners and their Tor; the Epicbox listener stays with epicbox_background */
    async stopListen(epicbox_background){

      const roles = epicbox_background ? ['listen'] : ['listen', 'epicbox'];
      const res = await window.nodeChildProcess.stopOwned(roles, {tor: true, torDirs: [this.configService.walletDataDir].filter(Boolean)});
      this.debug ? console.log('WalletService.listener_stopped', JSON.stringify(res.stopped)) : null;
      return true;
    }

    /* logout: stop our listener (keeping a background Epicbox listener when asked), its Tor, our
       owner API and, unless it runs in the background, our built-in node, in one call (one
       process scan). Only processes the app started (shared/processOwnership.js). Lock and the
       interface switch used to run stopListen + stopWallet + nodeService.stopNode one after
       another, and each scan starts PowerShell on Windows. */
    async stopAll(epicbox_background, node_background){

      const roles = ['owner_api', 'listen', ...(epicbox_background ? [] : ['epicbox']), ...(node_background ? [] : ['node'])];
      const res = await window.nodeChildProcess.stopOwned(roles, {tor: true, torDirs: [this.configService.walletDataDir].filter(Boolean)});
      this.debug ? console.log('WalletService.stopAll', JSON.stringify(res.stopped)) : null;
      return true;
    }

    /* stop our owner_api */
    async stopWallet(){

      const res = await window.nodeChildProcess.stopOwned(['owner_api']);
      this.debug ? console.log('WalletService.stopWallet', JSON.stringify(res.stopped)) : null;
      return true;
    }

    /* a new wallet in 6.1's folder (<root>/wallets/<id>), listed once its seed exists.
       Resolves {success, msg: the recovery phrase or the error, wallet: the list entry} */
    async new(password, network, {label = ''} = {}){
        return this.initWallet(network, label, 'created', (cmd, args) =>
          window.nodeChildProcess.execNew(cmd, args, this.configService.platform, password), password, false);
    }

    /* the same from a recovery phrase */
    async recover(seeds, password, network, {label = ''} = {}){
        return this.initWallet(network, label, 'restored', (cmd, args) =>
          window.nodeChildProcess.execRecover(cmd, args, this.configService.platform, seeds, password), password, true);
    }

    /* init (or init -r) on a new, empty folder: 4.1.0 refuses a folder that already holds an
       epic-wallet.toml, and writes its own default there, which registerWallet then replaces
       with 6.1's. A failed init lists nothing and removes the folder while it holds no
       wallet_data (configService.discardWalletDirs). */
    async initWallet(network, label, origin, run, password, recover){
        const cs = this.configService;
        const dirs = cs.newWalletDirs(network);
        let res;
        try{
          res = await run(cs.epicPath, initArgs({network: network, configDir: dirs.configDir, password: password, recover: recover}));
        }catch(e){
          res = {success: false, msg: e && e.message ? e.message : String(e)};
        }
        const seed = window.nodePath.join(dirs.dataDir, 'wallet_data', 'wallet.seed');
        if(!res || !res.success || !window.nodeFs.existsSync(seed)){
          cs.discardWalletDirs(dirs);
          return {success: false, msg: res && !res.success ? res.msg : 'epic-wallet created no wallet seed'};
        }
        try{
          const wallet = cs.registerWallet({id: dirs.id, network: network, configDir: dirs.configDir, dataDir: dirs.dataDir, origin: origin, label: label});
          return {success: true, msg: res.msg, wallet: wallet};
        }catch(e){
          //the seed exists: the folder stays, it can be added with Open a wallet folder
          return {success: false, msg: 'the wallet was created in ' + dirs.configDir + ' but could not be listed: ' + (e && e.message)};
        }
    }

    /* check the wallet against the chain (scan) on the running owner API, no extra process.
       The password is checked first, as the wallet CLI did. onMessage gets the progress lines.
       Resolves {success, wrongPassword?, msg?}; once stopCheck() was called, {success:false, stopped:true}. */
    async check(password, delete_unconfirmed, onMessage = () => {}){

        this.checkStopped = false;
        const proof = await this.jsonRPC('get_mnemonic', {name: "", password: password}, false);
        if(!proof || !proof.result || proof.result.Ok == undefined){
          const err = proof && proof.error ? (proof.error.message || String(proof.error)) : (this.lastError || 'wallet API not reachable');
          return {success: false, wrongPassword: err.includes('Error opening wallet') || err.includes('check password'), msg: err};
        }

        //progress: the owner API keeps its status messages until they are read
        let polling = true;
        const poll = async () => {
          while(polling){
            const res = await this.jsonRPC('get_updater_messages', {count: 100}, false, REFRESH_CALL_TIMEOUT);
            if(polling && res && res.result && Array.isArray(res.result.Ok)){
              //newest first: oldest first to the caller
              res.result.Ok.slice().reverse().forEach(m => onMessage(statusMessageText(m)));
            }
            await new Promise(r => setTimeout(r, 1000));
          }
        };
        const poller = poll();

        const res = await this.jsonRPC('scan', {
          token: this.token,
          start_height: 0,
          delete_unconfirmed: !!delete_unconfirmed,
        }, false);
        polling = false;
        await poller;

        if(this.checkStopped){
          return {success: false, stopped: true};
        }
        if(res && res.result && 'Ok' in res.result){
          return {success: true};
        }
        return {success: false, msg: res && res.error ? (res.error.message || String(res.error)) : (this.lastError || 'scan failed')};
    }

    /* the scan on the owner API can't be cancelled: stop waiting for it (and stop a scan process
       a previous version started) */
    async stopCheck(){

        this.checkStopped = true;
        const res = await window.nodeChildProcess.stopOwned(['scan']);
        this.debug ? console.log('WalletService.stopCheck', JSON.stringify(res.stopped)) : null;

    }

}

export default WalletService
