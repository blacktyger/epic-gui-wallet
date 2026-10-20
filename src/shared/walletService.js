
import axios from 'axios';
import { REFRESH_CALL_TIMEOUT } from '@/shared/walletSync';
import { parseEpicboxToml, normalizeEpicbox, sameServer, serverUrl, serverFromUrl, ownerApiEpicboxParams, withEpicboxSection, epicboxSwitchPlan } from '@/shared/epicboxConfig';
import { createOldServerCheck, oldServerCheckStep, CHECK_TIMES } from '@/shared/epicboxListener';
import { EPICBOX_CHECK_DIR, isEpicboxCheckDir } from '@/shared/processOwnership';
import { ownerApiArgs, listenArgs, epicboxArgs as buildEpicboxArgs, initArgs, statusMessageText, OWNER_API_START_DIR } from '@/shared/walletArgs';
import { WALLET_API_ORIGIN, isWalletApiUrl } from '@/shared/security';
import { isAddrInUse } from '@/shared/httpListener';
const Buffer = require('buffer').Buffer;

require('promise.prototype.finally').shim();

const log = window.log;
console.log = log.log;
const ownerApiPort = 3420;
const jsonRPCUrl = WALLET_API_ORIGIN + '/v3/owner'
const jsonRPCForeignUrl = WALLET_API_ORIGIN + '/v2/foreign'

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
        //Epicbox: one job at a time; listener events go to epicboxEventFns and to the emitter
        //('epicbox.event'); epicboxSession changes at lock, so a job of the last session stops
        this.epicboxQueue = Promise.resolve();
        this.epicboxEventFns = new Set();
        this.epicboxSession = 0;
        this.cancelEpicboxCheck = null;
        if(window.nodeChildProcess && window.nodeChildProcess.onEpicboxEvent){
          window.nodeChildProcess.onEpicboxEvent((ev) => {
            for(const fn of this.epicboxEventFns){
              fn(ev);
            }
            this.emitter.emit('epicbox.event', ev);
          });
        }
    }

    logoutClient(){
      this.client = undefined;
      this.shared_key = undefined;
      this.token = undefined;
      this.walletIsListen = false;
      this.walletIsEpicbox = false;
      //lock, logout, wallet switch: the main process forgets the session password, and an Epicbox
      //job of the last session stops
      this.epicboxSession++;
      window.nodeChildProcess.clearSessionPassword().catch(() => {});
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

    /* the client for the wallet API on this machine (epic-wallet owner_api), and for nothing else:
       the owner API secret goes with each of its calls, so a call to any other address (a node, a
       relative url) is refused before it is sent */
    initClient() {

      let password = this.configService.ownerApisecret;
      let client = axios.create({
          baseURL: WALLET_API_ORIGIN,
          auth: {
              username: 'epic',
              password: password
          },
      });
      client.interceptors.request.use((config) => {
          let url = '';
          try{ url = new URL(config.url || '', config.baseURL || WALLET_API_ORIGIN).href; }catch(e){ /* refused below */ }
          if(!isWalletApiUrl(url)){
            throw new Error('not the wallet API, not sent');
          }
          return config;
      });
      return Promise.resolve(client);
    }

    /* timeout (ms, 0: none): give up on a call the wallet does not answer; why the last call
       failed is kept in lastError, for the log */
    async jsonRPC(method, params, isForeign, timeout = 0){
        this.lastError = '';
        //no withCredentials: the wallet API answers CORS with "*", which a credentialed request
        //may not use; the secret goes in the Authorization header (initClient)
        const headers = {
            headers: {'Content-Type': 'application/json'}
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
          const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(12)));
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

        let response = await this.client.post(url, body, headers)
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

    async getEpicboxAddress(){

      return this.jsonRPC(
        'get_public_address',
        {
          "token": this.token,
          "derivation_index": 0
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
        //another wallet (or a failed unlock) keeps no password of an earlier one
        await window.nodeChildProcess.clearSessionPassword();

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
              //the listeners are started with it from now on, by the main process (shared/ptyHost.js):
              //handed over once, not kept here. Its dir is the listeners' -t (the data dir)
              await window.nodeChildProcess.setSessionPassword(password, this.configService.walletDataDir);
              return {success:true, msg:this.token};
            }
        }

        return {success:false, msg:'wallet start unknown error'};
    }

    /* ------------------------------------------------------------------ Epicbox
     * epic-wallet 4.1.0 reads [epicbox] from epic-wallet.toml once, at start: after a server change
     * the app restarts its own listener (only ever its own: processOwnership), tells the owner API
     * (set_epicbox_config) and checks the old server once for slates sent to the old address
     * (shared/epicboxConfig.js). One Epicbox job at a time (epicboxQueue). */

    /* run one Epicbox job after the previous one */
    epicboxJob(fn){
      const run = this.epicboxQueue.then(fn, fn);
      this.epicboxQueue = run.catch(() => {});
      return run;
    }

    epicboxState(state){
      this.emitter.emit('epicbox.state', state);
    }

    /* the Epicbox config the wallet uses now: [epicbox] of its epic-wallet.toml; domain '' when
       Epicbox is turned off in the settings (the toml then still names the default server) */
    readEpicboxConfig(){
      let text = '';
      try{
        text = window.nodeFs.readFileSync(this.epicboxTomlPath(), {encoding: 'utf8'});
      }catch(e){
        //no toml: the wallet's defaults
      }
      const cfg = normalizeEpicbox(parseEpicboxToml(text));
      const domain = this.configService.config ? this.configService.config['epicbox_domain'] : undefined;
      if(domain !== undefined && String(domain).trim() == ''){
        cfg.domain = '';
      }
      return cfg;
    }

    epicboxTomlPath(dir){
      return window.nodePath.join(dir || this.configService.walletConfigDir, this.configService.walletTOMLName || 'epic-wallet.toml');
    }

    /* no password: the main process answers the listener's prompt with the session's */
    epicboxArgs(){
      return buildEpicboxArgs({
        network: this.configService.defaultAccountNetwork,
        configDir: this.configService.walletConfigDir,
        dataDir: this.configService.walletDataDir,
      });
    }

    /* tell the owner API (used for our own address when sending) */
    async setEpicboxConfig(cfg){
      const res = await this.jsonRPC('set_epicbox_config', ownerApiEpicboxParams(cfg), false);
      const ok = !!(res && res.result && Object.prototype.hasOwnProperty.call(res.result, 'Ok'));
      console.log('[epicbox] owner API config ' + (ok ? 'set to ' : 'NOT set to ') + serverUrl(cfg) + (ok ? '' : ': ' + (this.lastError || (res && res.error ? res.error.message : 'no answer'))));
      return ok;
    }

    /* the wallet's Epicbox listener of ours that runs now: {owned, live, server} — server is what it
       connected to (its output, when this window started it), else what it was started with (the
       record), else {unknown: true}; null when none runs */
    async epicboxListenerNow(){
      const dir = this.configService.walletConfigDir;
      const owned = await window.nodeChildProcess.ownedProcesses(['epicbox'], {dir: dir});
      if(!owned.length){
        return null;
      }
      const live = await window.nodeChildProcess.liveEpicbox(dir);
      const ours = live && owned.some(p => p.pid == live.pid || p.entryPid == live.pid) ? live : null;
      const server = (ours && ours.url ? serverFromUrl(ours.url) : null)
        || (owned[0].server ? serverFromUrl(owned[0].server) : null)
        || {unknown: true};
      return {owned, live: ours, server};
    }

    /* start the wallet's listener (or the old-server check: meta.configDir, meta.check) on the
       main process's pseudo-terminal, with the password of this session */
    async spawnEpicbox(meta){
      const m = Object.assign({}, meta);
      let args = this.epicboxArgs();
      if(m.configDir){
        args[args.indexOf('-c') + 1] = m.configDir;
      }
      return window.nodeChildProcess.execEpicbox(this.configService.epicPath, args, this.configService.platform, m);
    }

    async stopEpicboxPids(owned){
      const pids = owned.map(p => p.entryPid || p.pid);
      const res = await window.nodeChildProcess.stopPids(pids);
      console.log('[epicbox] stopped listener ' + pids.join(', ') + (res.every(r => r) ? '' : ' (not all)'));
      //this window sees it end (its exit event) before a new one starts: else that one would be
      //taken for the old one, which still runs
      const dir = this.configService.walletConfigDir;
      for(let i = 0; i < 50 && await window.nodeChildProcess.liveEpicbox(dir); i++){
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      //still there after 5 s: a new one would be taken for it
      if(await window.nodeChildProcess.liveEpicbox(dir)){
        console.log('[epicbox] listener still running after stop');
        return false;
      }
      return res.every(r => r);
    }

    /* old-server checks of ours that still run (a crash, a quit during a check): stopped before a
       listener of the wallet starts, so there are never two */
    async stopEpicboxChecks(){
      const checks = (await window.nodeChildProcess.ownedProcesses(['epicbox'])).filter(p => isEpicboxCheckDir(p.dir));
      if(checks.length){
        await window.nodeChildProcess.stopPids(checks.map(p => p.entryPid || p.pid));
        console.log('[epicbox] stopped a leftover old-server check ' + checks.map(p => p.pid).join(', '));
      }
    }

    /*
     * Check the old server once: a listener of this wallet on it, until what was queued there is
     * handled (shared/epicboxListener.js oldServerCheckStep), then stopped by its pid. It reads its
     * config from <wallet dir>/epicbox_check (a copy of epic-wallet.toml with the old [epicbox]),
     * its wallet from the wallet dir (-t). Never at the same time as the wallet's own listener.
     */
    async checkOldEpicbox(server, session){
      const fs = window.nodeFs;
      const walletDir = this.configService.walletConfigDir;
      const checkDir = window.nodePath.join(walletDir, EPICBOX_CHECK_DIR);
      const started = Date.now();
      //locked since the job began: no check for a closed session
      if(session !== this.epicboxSession){
        return {why: 'cancelled'};
      }
      const cleanup = () => {
        try{
          fs.rmSync(checkDir, {recursive: true, force: true});
        }catch(e){
          console.log('[epicbox] could not remove ' + checkDir + ': ' + (e.code || e.message));
        }
      };
      try{
        fs.mkdirSync(checkDir, {recursive: true});
        const text = fs.readFileSync(this.epicboxTomlPath(), {encoding: 'utf8'});
        fs.writeFileSync(this.epicboxTomlPath(checkDir), withEpicboxSection(text, server), {encoding: 'utf8', mode: 0o600});
      }catch(e){
        console.log('[epicbox] old server check not started: ' + (e.code || e.message));
        cleanup();
        return {why: 'not_started'};
      }

      this.epicboxState({state: 'checking_old', checking: serverUrl(server)});
      console.log('[epicbox] checking the old server ' + serverUrl(server) + ' once');
      //the check's events are followed from before it is spawned: its first lines (connected,
      //subscribed, a queued slate) come with the answer to the spawn
      let st = createOldServerCheck(Date.now());
      let finished = null;
      let resolveWait = () => {};
      const waited = new Promise((resolve) => { resolveWait = resolve; });
      let timer = 0;
      const finish = (r) => {
        if(finished) return;
        finished = r;
        clearInterval(timer);
        this.epicboxEventFns.delete(onEvent);
        this.cancelEpicboxCheck = null;
        resolveWait(r);
      };
      const step = (ev) => {
        if(finished) return;
        const r = oldServerCheckStep(st, ev, Date.now());
        st = r.state;
        if(r.done) finish({why: r.why, handled: st.handled});
      };
      const onEvent = (ev) => { if(ev && ev.check && ev.dir === checkDir) step(ev); };
      this.epicboxEventFns.add(onEvent);
      this.cancelEpicboxCheck = () => finish({why: 'cancelled', handled: st.handled});
      timer = setInterval(() => step(null), 1000);

      const res = await this.spawnEpicbox({configDir: checkDir, server: serverUrl(server), check: true, timeoutMs: CHECK_TIMES.connect});
      const pid = res && res.pid ? Number(res.pid) : 0;
      if(!(res && res.success && pid) || session !== this.epicboxSession){
        finish({why: res && res.exited ? 'exited' : (session !== this.epicboxSession ? 'cancelled' : 'not_started'), handled: st.handled});
      }
      const result = await waited;
      //whatever the answer was, a check that may still run is stopped by its pid
      if(pid && result.why != 'exited'){
        await window.nodeChildProcess.stopPids([pid]);
      }
      cleanup();
      console.log('[epicbox] old server ' + serverUrl(server) + ' checked: ' + result.why + (result.handled ? ', ' + result.handled + ' slate(s)' : '') + ', ' + Math.round((Date.now() - started) / 1000) + ' s');
      return result;
    }

    /* the wallet's listener on the configured server; callers hold the Epicbox queue */
    async startEpicboxNow(cfg, session){
      if(session !== this.epicboxSession){
        return {success: false, cancelled: true};
      }
      await this.stopEpicboxChecks();
      this.epicboxState({state: 'starting', server: serverUrl(cfg), address: ''});
      const res = await this.spawnEpicbox({server: serverUrl(cfg), timeoutMs: 45000});
      const pid = res && res.pid ? Number(res.pid) : 0;
      if(res && res.success && pid > 0){
        this.walletIsEpicbox = true;
        return {success: true, pid, server: cfg};
      }
      //started, but no connection yet: it keeps trying (its events say when it is on)
      if(res && res.pending){
        return {success: false, pending: true, pid, server: cfg};
      }
      //locked meanwhile: the main process has no password for it
      if(res && res.noSession){
        this.epicboxState({state: 'off'});
        return {success: false, noSession: true};
      }
      this.epicboxState({state: 'off'});
      return {success: false};
    }

    /* start the wallet's Epicbox listener (login, Receive page). One of ours that this window
       started and that is on the configured server is reused. One this window did not start (its
       output does not reach it, so neither its server nor its slates can be seen; login stops
       those already) or on another server is started again, after a check of the server it was on. */
    async startEpicbox(){
      return this.epicboxJob(async () => {
        const session = this.epicboxSession;
        const cfg = this.readEpicboxConfig();
        if(!cfg.domain){
          return {success: false, off: true};
        }
        const now = await this.epicboxListenerNow();
        if(session !== this.epicboxSession){
          return {success: false, cancelled: true};
        }
        if(now && now.live && sameServer(now.server, cfg)){
          this.walletIsEpicbox = true;
          this.epicboxState({state: now.live.state == 'paused' ? 'paused' : 'listening', server: now.live.url || serverUrl(cfg), address: now.live.address, pid: now.live.pid});
          return {success: true, reused: true, server: cfg};
        }
        let checkedNow = null;
        if(now){
          console.log('[epicbox] restarting our listener (' + (now.live ? 'on ' + serverUrl(now.server) : 'started earlier, ' + (now.server.unknown ? 'server unknown' : 'on ' + serverUrl(now.server))) + '), configured: ' + serverUrl(cfg));
          this.epicboxState({state: 'switching', server: serverUrl(cfg), address: ''});
          if(!await this.stopEpicboxPids(now.owned)){
            return {success: false};
          }
          if(!now.server.unknown && !sameServer(now.server, cfg)){
            await this.checkOldEpicboxOnce(now.server, session);
            checkedNow = now.server;
          }
        }
        //a server change that was not applied then ("Not now", a lock during the switch): the
        //server the listener was on is checked once now (not twice: not when it was just checked)
        const pending = this.pendingEpicboxCheck();
        if(pending && sameServer(pending, cfg)){
          //back on that server: its slates come to the listener
          if(session === this.epicboxSession){
            this.setPendingEpicboxCheck(null);
          }
        }else if(pending && !(checkedNow && sameServer(pending, checkedNow))){
          await this.checkOldEpicboxOnce(pending, session);
        }
        return this.startEpicboxNow(cfg, session);
      });
    }

    /* checkOldEpicbox, and the pending check cleared once it ran: one that didn't (locked, wallet
       switched, the check listener didn't start) stays pending for the next start */
    async checkOldEpicboxOnce(server, session){
      const checked = await this.checkOldEpicbox(server, session);
      if(session === this.epicboxSession && checked && checked.why != 'cancelled' && checked.why != 'not_started'){
        this.setPendingEpicboxCheck(null);
      }
      return checked;
    }

    /* the old server still to be checked once (a server change the listener did not follow yet),
       in this account's config: a wss:// url, no secret */
    pendingEpicboxCheck(){
      const url = this.configService.config ? this.configService.config['epicbox_check_pending'] : '';
      return url ? serverFromUrl(url) : null;
    }
    setPendingEpicboxCheck(server){
      const url = server ? serverUrl(server) : '';
      if((this.configService.config || {})['epicbox_check_pending'] || url){
        this.configService.updateConfig({epicbox_check_pending: url});
      }
    }

    /*
     * After the Epicbox settings were saved (epic-wallet.toml rewritten): saved is the config
     * before. Tells the owner API, restarts our listener on the new server and checks the old one
     * once (epicboxSwitchPlan). The listeners start with the password of this session (the main
     * process has it). Resolves {noSession: true} (nothing changed but the owner API) when the
     * wallet was locked meanwhile.
     */
    async applyEpicboxChange(saved){
      return this.epicboxJob(async () => {
        const session = this.epicboxSession;
        const next = this.readEpicboxConfig();
        const now = await this.epicboxListenerNow();
        const plan = epicboxSwitchPlan({saved, next, listener: now ? now.server : null});
        console.log('[epicbox] settings saved: ' + (saved && saved.domain ? serverUrl(saved) : 'off') + ' -> ' + (next.domain ? serverUrl(next) : 'off')
          + '; listener ' + (now ? (now.server.unknown ? 'on an unknown server' : 'on ' + serverUrl(now.server)) : 'not running')
          + '; plan ' + JSON.stringify({setOwnerConfig: plan.setOwnerConfig, restart: plan.restart, checkOld: plan.checkOld ? serverUrl(plan.checkOld) : null, start: plan.start}));
        const out = {plan, ownerConfig: null};
        if(plan.setOwnerConfig){
          out.ownerConfig = await this.setEpicboxConfig(next);
        }
        if(!plan.restart){
          return out;
        }
        //a listener is started (the check or the new one): it needs the session's password; only
        //stopping it (Epicbox turned off) does not
        const spawns = plan.start || !!plan.checkOld;
        //until the switch is done, the old server is remembered for one check at the next start
        if(plan.checkOld && !this.pendingEpicboxCheck()){
          this.setPendingEpicboxCheck(plan.checkOld);
        }
        if(spawns && !(await window.nodeChildProcess.hasSessionPassword())){
          out.noSession = true;
          return out;
        }
        if(session !== this.epicboxSession){
          return out;
        }
        this.epicboxState({state: 'switching', server: next.domain ? serverUrl(next) : '', address: ''});
        if(!await this.stopEpicboxPids(now.owned)){
          out.stopFailed = true;
          return out;
        }
        this.walletIsEpicbox = false;
        if(plan.checkOld){
          out.checked = await this.checkOldEpicbox(plan.checkOld, session);
          if(out.checked && out.checked.why != 'cancelled' && out.checked.why != 'not_started'){
            this.setPendingEpicboxCheck(null);
          }
        }
        //locked meanwhile: no listener for a closed session
        if(session !== this.epicboxSession){
          out.cancelled = true;
          return out;
        }
        if(plan.start){
          out.started = await this.startEpicboxNow(next, session);
        }else{
          this.epicboxState({state: 'off'});
        }
        return out;
      });
    }

    /* start a epic wallet in listen mode (no Tor: --no_tor); the main process answers its prompt
       with the session password */
    async startListen(method){

        let walletIsListen = await window.nodeChildProcess.ownedProcesses(['listen'], {dir: this.configService.walletConfigDir});

        if(!walletIsListen.length){

          //another program holds the listener port: say so, don't touch it
          const port = this.configService.walletListenerPort;
          if(await window.config.isPortReachable('127.0.0.1', port)){
            return {success:false, portInUse: port};
          }

          let walletListenId = 0;

          //the GUI only listens via http (Epicbox has its own startEpicbox); method is kept for callers
          let args = listenArgs({
            network: this.configService.defaultAccountNetwork,
            configDir: this.configService.walletConfigDir,
            dataDir: this.configService.walletDataDir,
          });

          walletListenId = await window.nodeChildProcess.execListen(this.configService.epicPath, args, this.configService.platform);

          if(walletListenId && walletListenId.msg > 0){
              this.walletIsListen = true;
              //the listener started here (none when one was already running)
              return {success:true, pid: walletListenId.msg};
          }else{
            //it couldn't bind its port though the check above found it free (e.g. taken on another interface)
            const msg = walletListenId && walletListenId.msg;
            return {success:false, msg, noSession: !!(walletListenId && walletListenId.noSession), ...(isAddrInUse(msg) ? {portInUse: port} : {})};
          }
        }

        return {success:true};
    }

    async isListen(){

      let walletIsListen = await window.nodeChildProcess.ownedProcesses(['listen'], {dir: this.configService.walletConfigDir});
      return walletIsListen.length > 0;
    }

    /* the current wallet's processes only (its config dir): another wallet's listener is never
       stopped here; the built-in node is shared, never filtered by dir */
    ownedOpts(){
      return {dir: this.configService.walletConfigDir};
    }

    /* stop our listeners */
    async stopListen(){

      const roles = ['listen', 'epicbox'];
      const res = await window.nodeChildProcess.stopOwned(roles, this.ownedOpts());
      this.debug ? console.log('WalletService.listener_stopped', JSON.stringify(res.stopped)) : null;
      return true;
    }

    /* logout: stop our listeners (http and Epicbox), our
       owner API and, unless it runs in the background, our built-in node, in one call (one
       process scan). Only processes the app started (shared/processOwnership.js). Lock and the
       interface switch used to run stopListen + stopWallet + nodeService.stopNode one after
       another, and each scan starts PowerShell on Windows. */
    async stopAll(node_background){

      //an Epicbox job of this session ends here: a check of the old server stops now
      this.epicboxSession++;
      if(this.cancelEpicboxCheck){
        this.cancelEpicboxCheck();
      }
      const roles = ['owner_api', 'listen', 'epicbox', ...(node_background ? [] : ['node'])];
      const res = await window.nodeChildProcess.stopOwned(roles, this.ownedOpts());
      this.debug ? console.log('WalletService.stopAll', JSON.stringify(res.stopped)) : null;
      return true;
    }

    /* stop our owner_api */
    async stopWallet(){

      const res = await window.nodeChildProcess.stopOwned(['owner_api'], {dir: this.configService.walletConfigDir});
      this.debug ? console.log('WalletService.stopWallet', JSON.stringify(res.stopped)) : null;
      return true;
    }

    /* a new wallet in 6.1's folder (<root>/wallets/<id>), listed once its seed exists. The password
       answers epic-wallet's prompts in the main process, for this one process.
       Resolves {success, msg: the recovery phrase or the error, wallet: the list entry} */
    async new(password, network, {label = ''} = {}){
        return this.initWallet(network, label, 'created', (cmd, args) =>
          window.nodeChildProcess.execNew(cmd, args, this.configService.platform, password), false);
    }

    /* the same from a recovery phrase */
    async recover(seeds, password, network, {label = ''} = {}){
        return this.initWallet(network, label, 'restored', (cmd, args) =>
          window.nodeChildProcess.execRecover(cmd, args, this.configService.platform, seeds, password), true);
    }

    /* init (or init -r) on a new, empty folder: 4.1.0 refuses a folder that already holds an
       epic-wallet.toml, and writes its own default there, which registerWallet then replaces
       with 6.1's. A failed init lists nothing and removes the folder while it holds no
       wallet_data (configService.discardWalletDirs). */
    async initWallet(network, label, origin, run, recover){
        const cs = this.configService;
        const dirs = cs.newWalletDirs(network);
        let res;
        try{
          res = await run(cs.epicPath, initArgs({network: network, configDir: dirs.configDir, recover: recover}));
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

    /* check the wallet against the chain (scan) on the running owner API of the unlocked wallet,
       no extra process and no password prompt. onMessage gets the progress lines.
       Resolves {success, msg?}; once stopCheck() was called, {success:false, stopped:true}. */
    async check(delete_unconfirmed, onMessage = () => {}){

        this.checkStopped = false;

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
        const res = await window.nodeChildProcess.stopOwned(['scan'], {dir: this.configService.walletConfigDir});
        this.debug ? console.log('WalletService.stopCheck', JSON.stringify(res.stopped)) : null;

    }

}

export default WalletService
