// src/preload.js
import { contextBridge, ipcRenderer, shell, webUtils } from 'electron'
import os from 'os'
import { join } from 'path'
import path from 'path';
import * as secp256k1 from "@noble/secp256k1";
import isPortReachable from 'is-port-reachable';
import { createProcessRegistry, createPidCheck, describeSpawn, redactArgs } from './shared/processOwnership';
import { spawnCommand, plainBin } from './shared/spawnCommand';
import { createLineSplitter, parseListenerLine } from './shared/epicboxListener';

const moment = require('moment');
const base32 = require('rfc-3548-b32');
const crypto = require('crypto-browserify');
const qr = require("qrcode");
const sha3_256 = require('js-sha3').sha3_256;
const ps = require('ps-node');
const fs = require('fs');
const log = require('electron-log');

const homedir = os.homedir();
const rootdir = require('app-root-dir');
export const ewalletPath = path.join(homedir, '.epic')
export const logDir = path.join(ewalletPath, 'log')



const resourcePath =
  !process.env.NODE_ENV || process.env.NODE_ENV === "production"
    ? process.resourcesPath // Live Mode
    : path.join(__dirname, '../resources/'); // Dev Mode


let logFile = `${moment(new Date()).format('YYYY_MM_D')}.log`
let logPath = join(logDir, logFile);
let processes = {};
log.transports.file.resolvePath = () => logPath
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}:{ms} [{level}] {text}';
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.file.level = 'debug';
log.transports.file.streamConfig = {flags: 'w'};
log.transports.console.format = '{y}-{m}-{d} {h}:{i}:{s}:{ms} [{level}] {text}'
log.transports.console.level = process.env.NODE_ENV === 'production' ? 'info' : 'debug'

//add debug mode for production
//user must create a file "debug" in ./epic folder
let debug = false;//process.env.NODE_ENV !== 'production';
if(fs.existsSync(path.join(ewalletPath, 'debug.log'))){
  debug = true;
  console.log = log.log;
}

const spawn = require('child_process').spawn;
const fork = require('child_process').fork;
const exec = require('child_process').exec;
const execFile = require('child_process').execFile;
const validChannels = ['firstscan-stdout', 'scan-stdout', 'scan-finish', 'scan-error', 'walletExisted', 'walletCreated', 'walletCreateFailed', 'nodeBackground', 'epicboxBackground'];

//extract the recovery phrase from epic-wallet init / init -r stdout (4.1 mixes log lines into stdout)
function parseRecoveryPhrase(stdout){
  const m = stdout.match(/Your recovery phrase is:\s*([\s\S]*?)\s*Please back-up these words/);
  if(!m){
    return '';
  }
  const words = m[1].split(/\s+/).filter(w => /^[a-z]+$/.test(w));
  return (words.length == 12 || words.length == 24) ? words.join(' ') : '';
}

function killPid(pid){
  return new Promise(function(resolve) {
    if (process.platform === 'win32') {
      //the tree: epic-wallet.exe and its tor.exe (and a cmd.exe wrapper started by 6.0.0)
      exec(`taskkill /pid ${Number(pid)} /f /t`, function( err ) {
        resolve(!err);
      });
    }else{
      //check if 3 seconds for node server is to short and makes problems
      ps.kill(pid, {timeout: 3},function( err ) {
        resolve(!err);
      });
    }
  });
}

//the processes this app started (see shared/processOwnership.js): only these are ever stopped or reused
const ownProcesses = createProcessRegistry({
  fs,
  file: path.join(ewalletPath, 'gui_processes.json'),
  findProcess: require('find-process'),
  kill: killPid,
  win: process.platform === 'win32',
  //a record missing from a scan is forgotten only once this says its pid is gone
  pidAlive: createPidCheck({win: process.platform === 'win32', processKill: process.kill.bind(process), execFile}),
  warn: (msg) => log.warn(msg),
  selfPid: process.pid,
});

//the children this window started that still run: pid → {role, dir}
const liveChildren = new Map();

/* start an epic binary without a shell (shared/spawnCommand.js) */
function spawnEpic(cmd, args){
  const c = spawnCommand(cmd, args);
  return spawn(c.cmd, c.args, c.options);
}

function track(child, cmd, args, extra){
  cmd = plainBin(cmd);
  debug ? console.log('spawn', cmd, redactArgs(args).join(' ')) : null;
  if(child.pid){
    const entry = ownProcesses.record(child.pid, cmd, args, extra);
    if(entry){
      liveChildren.set(child.pid, {role: entry.role, dir: entry.dir});
    }
    child.on('exit', () => {
      liveChildren.delete(child.pid);
      ownProcesses.forget(child.pid);
    });
  }
  return child;
}

//the pid of a child of ours with this role and dir that still runs, else 0
function liveChildOf(role, dir){
  for(const [pid, c] of liveChildren){
    if(c.role === role && c.dir === dir) return pid;
  }
  return 0;
}

//only the app's own binaries in resources/bin may be adopted
const bundledBinDir = path.resolve(resourcePath, 'bin') + path.sep;
function isBundled(bin){
  const b = path.resolve(String(bin || '').replace(/"/g, ''));
  return process.platform === 'win32' ? b.toLowerCase().startsWith(bundledBinDir.toLowerCase()) : b.startsWith(bundledBinDir);
}

/*
 * Epicbox listeners started by this window: what their output says (shared/epicboxListener.js),
 * pid → {dir, check, url, address, state}. check: the short-lived listener on the old server
 * after a server change.
 */
const epicboxLive = new Map();
//the renderer's callbacks for listener events (App.vue, walletService)
const epicboxSubscribers = new Set();
/*
 * How to start a wallet's Epicbox listener again after a server change: its spawn arguments,
 * password included, exactly as the listener running now got them. Kept in this preload's memory
 * only (never written, logged or handed to the renderer) while that session is unlocked; dropped
 * at lock (forgetEpicboxSpecs). wallet dir → {cmd, args, password}
 */
const epicboxSpecs = new Map();
//bumped at lock: a listener started before it does not put its spec (and password) back
let epicboxSpecGen = 0;

function emitEpicbox(ev){
  for(const fn of epicboxSubscribers){
    try{ fn(ev); }catch(e){ /* a closed view */ }
  }
}

//the args with the -c (config dir) value replaced: the old-server check reads its own toml
function withConfigDir(args, configDir){
  const out = args.slice();
  const i = out.indexOf('-c');
  if(i >= 0 && i + 1 < out.length) out[i + 1] = configDir;
  return out;
}

/* start an Epicbox listener; meta: {server: the wss:// url it is started with, check: the old-server check} */
function startEpicboxListener(cmd, args, password, meta = {}){

  //one Epicbox listener per wallet dir: a second one (a scan that missed ours, two starts at once) reuses it
  const desc = describeSpawn(cmd, args);
  const running = desc ? liveChildOf('epicbox', desc.dir) : 0;
  if(running){
    debug ? console.log('execEpicbox: already running', running) : null;
    return Promise.resolve({success: true, msg: running, reused: true});
  }

  return new Promise(function(resolve) {

      const check = !!meta.check;
      const specGen = epicboxSpecGen;
      let listenProcess = track(spawnEpic(cmd, args), cmd, args, {server: meta.server});
      const pid = listenProcess.pid;
      const dir = desc ? desc.dir : '';
      const live = {dir, check, url: '', address: '', state: 'starting'};
      if(pid) epicboxLive.set(pid, live);
      const split = createLineSplitter();
      let settled = false;
      //every answer names the pid and how far the listener got (state: its last event)
      const done = (res) => {
        if(settled) return;
        settled = true;
        //the wallet's own listener (not the check): it can be started again after a server change,
        //unless the session was locked since it was started
        if((res.success || res.pending) && !check && desc && specGen === epicboxSpecGen){
          epicboxSpecs.set(desc.dir, {cmd, args: args.slice(), password});
        }
        resolve(Object.assign({pid: pid || 0, state: live.state}, res));
      };

      listenProcess.stdout.setEncoding('utf8');
      listenProcess.stdout.on('data', (data) => {

          debug ? console.log('execEpicbox.stdout', data) : null;
          if(data.includes('Password:')){
            listenProcess.stdin.write(password+"\n");
          }

          for(const line of split(data)){
            const ev = parseListenerLine(line);
            if(!ev) continue;
            if(ev.type == 'connecting'){ live.url = ev.url; live.state = 'connecting'; }
            else if(ev.type == 'listening'){ live.address = ev.address; live.state = 'listening'; }
            else if(ev.type == 'subscribed'){ live.state = 'listening'; }
            else if(ev.type == 'paused'){ live.state = 'paused'; }
            else if(ev.type == 'disconnected'){ live.state = 'disconnected'; }
            emitEpicbox(Object.assign({pid, dir, check}, ev, {url: ev.url || live.url}));
          }

          if(data.includes('Starting epicbox listener') || data.includes('Epicbox listener started.')){

            done({success: true, msg: pid});
          }

          if(data.includes('Failed to check node sync status')){
            done({success: false, msg: 'node not synced', tor: false});
          }

      });

      listenProcess.stderr.setEncoding('utf8');
      listenProcess.stderr.on('data', (data) => {
          debug ? console.log('execEpicbox.stderr', data) : null;

          done({success: false, msg: data});
      });

      //no connection within timeoutMs: the check gives up; the wallet's listener keeps trying
      //(epic-wallet reconnects 5 times, 20 s apart) and its events say when it is on
      if(meta.timeoutMs > 0){
        setTimeout(() => done(check ? {success: false, msg: 'timeout'} : {success: false, pending: true, msg: pid}), meta.timeoutMs);
      }

      listenProcess.on('exit', (code) => {
        epicboxLive.delete(pid);
        emitEpicbox({type: 'exit', pid, dir, check, code});
        done({success: false, msg: 'exited', exited: true});
      });
      listenProcess.on('error', (e) => {
        done({success: false, msg: e && e.message ? e.message : 'spawn failed'});
      });

  });
}

contextBridge.exposeInMainWorld('nodeChildProcess', {

    /* stop a process by pid, only if the app started it; resolves false if it was not stopped */
    async kill(pid){
      const [stopped] = await ownProcesses.stopPids([pid]);
      return stopped;
    },
    /* our running processes of these roles (owner_api, listen, epicbox, scan, node), commands redacted;
       opts: {dir, network, tor, torDirs} */
    async ownedProcesses(roles, opts){
      return ownProcesses.list(roles, opts);
    },
    /* stop our running processes of these roles; resolves the stopped processes and whether all are gone */
    async stopOwned(roles, opts){
      const owned = await ownProcesses.list(roles, opts);
      const results = await ownProcesses.stop(owned);
      return {stopped: owned, allKilled: results.every(r => r)};
    },
    /* stop these pids, if they are (still) ours: one boolean per pid */
    async stopPids(pids){
      return ownProcesses.stopPids(pids);
    },
    /* first start of this version (no record file yet): record the previous version's processes
       that run the bundled binaries on this account (opts: {walletBin, nodeBin, dir, nodeConfig, network});
       resolves the adopted ones as {pid, role} */
    async adopt(opts){
      const o = Object.assign({}, opts);
      if(!isBundled(o.walletBin)) delete o.walletBin;
      if(!isBundled(o.nodeBin)) delete o.nodeBin;
      const adopted = await ownProcesses.adopt(o);
      return adopted.map(e => ({pid: e.pid, role: e.role}));
    },
    async spawn(cmd, args){
      const child = await spawn(cmd, args);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data',function(data){
        debug ? console.log('spawn.stdout', data) : null;
      });

      return child;

    },

    async execNew(cmd, args, platform, password){

      return new Promise(function(resolve, reject) {

          let createProcess = spawnEpic(cmd, args);

          let newSeedData = '';
          let errorData = '';

          createProcess.stdout.setEncoding('utf8');
          createProcess.stdout.on('data', (data) => {

            debug ? console.log('execNew.stdout', data) : null;

            if(data.includes('Password:')){
              createProcess.stdin.write( password+"\n");
            }
            newSeedData += data;

          });

          createProcess.stderr.setEncoding('utf8');
          createProcess.stderr.on('data', (data) => {
            debug ? console.log('execNew.stderr', data) : null;
            errorData += data;
          });

          createProcess.stdout.on('end', function () {

            if(errorData != ''){
              resolve({success: false, msg: errorData});
            }else if(newSeedData != ''){

              let phrase = parseRecoveryPhrase(newSeedData);
              if(phrase){
                resolve({success: true, msg: phrase});
              }else{
                resolve({success: false, msg: 'could not read the recovery phrase from epic-wallet output'});
              }
            }else{
              resolve({success: false, msg: 'unknow error'})
            }

          });

      });
    },
    async execScan(cmd, args, platform, password){

      return new Promise(function(resolve, reject) {


          let scanProcess = track(spawnEpic(cmd, args), cmd, args);

          //scan process is self closing
          scanProcess.stdout.setEncoding('utf8');
          scanProcess.stdout.on('data', function(data){
            debug ? console.log('execScan.stdout', data) : null;

            if(data.includes('Password:')){
              scanProcess.stdin.write(password+"\n");
            }

            ipcRenderer.send('scan-stdout', data);
          })

          scanProcess.stderr.setEncoding('utf8');
          scanProcess.stderr.on('data', function(data){
            debug ? console.log('execScan.stderr', data) : null;
            ipcRenderer.send('scan-stdout', data);
          })
          scanProcess.on('close', function(code){
            debug ? console.log('execScan.close', code) : null;


            if(code==0){ipcRenderer.send('scan-finish')}
            if(code==1){ipcRenderer.send('scan-error')}
          });

      });

    },

    on:(channel, func) => {
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, data) => func(data));
      }
    },

    /* start node api */
    async execNode(cmd, args, platform){

      return new Promise(function(resolve, reject) {



          let node_server = track(spawnEpic(cmd, args), cmd, args);

          node_server.stdout.setEncoding('utf8');
          node_server.stdout.on('data', (data) => {
              debug ? console.log('execNode.stdout', data) : null;

            //Epic server started.
            if(data.includes('Epic node server started.')){
              resolve(node_server.pid);
            }

          });


          node_server.stderr.setEncoding('utf8');
          node_server.stderr.on('data', (data) => {
            debug ? console.log('execNode.stderr', data) : null;

            reject(false);

          });

      });
    },
    /* start wallet api */
    async execStart(cmd, args, platform, emitOutput){

      return new Promise(function(resolve, reject) {

          let ownerAPI = track(spawnEpic(cmd, args), cmd, args);


          ownerAPI.stdout.setEncoding('utf8');
          ownerAPI.stdout.on('data', (data) => {
            debug ? console.log('execStart.stdout', data) : null;

            if(emitOutput){
              ipcRenderer.send('firstscan-stdout', data);
            }
            if(data.includes('HTTP Owner listener started') || data.includes('Owner API started')){

              resolve(ownerAPI.pid);
            }
            
            //epic-wallet 4.1 with a wrong password: "Lifecycle Error: Error opening wallet (is password correct?)"
            if(data.includes('is password correct')){
              resolve(-1);
            }
            if(data.includes('Error opening wallet')){
              resolve(0);
            }

          });

          ownerAPI.stderr.setEncoding('utf8');
          ownerAPI.stderr.on('data', (data) => {
            debug ? console.log('execStart.stderr', data) : null;


            if(emitOutput){
              ipcRenderer.send('firstscan-stdout', data);
            }
            if(data.includes('is password correct')){
              //wrong password (see stdout above); still a failed start for the caller
              resolve(-1);
            }else if(data.includes('Address already in use')){
              //we have unknow process id
              resolve(0);
            }else{

              resolve(false);

            }

          });
      });
    },
    /* start wallet listen */
    async execListen(cmd, args, platform, password){

      return new Promise(function(resolve, reject) {

          let listenProcess = track(spawnEpic(cmd, args), cmd, args);
          let isTorBooted = false;
          listenProcess.stdout.setEncoding('utf8');
          listenProcess.stdout.on('data', (data) => {

              debug ? console.log('execListen.stdout', data) : null;
              if(data.includes('Password:')){
                listenProcess.stdin.write(password+"\n");
              }

              /* todo check why tor is not Bootstrapped on Linux */
              if(data.includes('[notice] Bootstrapped 100% (done): Done')){
                isTorBooted = true;
              }
              if(data.includes('Unable to start TOR listener') || data.includes('Tor Error: Tor Process Error: Timeout')){
                isTorBooted = false;
              }
              if(data.includes('HTTP Foreign listener started.')){

                resolve({success: true, msg: listenProcess.pid, tor: isTorBooted});
              }
              if(data.includes('Failed to check node sync status')){

                resolve({success: false, msg: 'node not synced', tor: isTorBooted});
              }

              

          });

          listenProcess.stderr.setEncoding('utf8');
          listenProcess.stderr.on('data', (data) => {
              debug ? console.log('execListen.stderr', data) : null;

              resolve({success: false, msg: data, tor: isTorBooted});
          })

      });
    },

    /* start wallet epicbox; meta: {server: the wss:// url from its toml, check: the old-server check} */
    async execEpicbox(cmd, args, platform, password, meta){
      return startEpicboxListener(cmd, args, password, meta || {});
    },

    /* start the wallet's Epicbox listener again as it was started last in this session (its
       password stays here); meta.configDir: read the toml from there (the old-server check).
       {success: false, noSpec: true} when this session started none */
    async respawnEpicbox(dir, meta){
      const spec = epicboxSpecs.get(dir);
      if(!spec){
        return {success: false, noSpec: true};
      }
      const m = meta || {};
      const args = m.configDir ? withConfigDir(spec.args, m.configDir) : spec.args;
      return startEpicboxListener(spec.cmd, args, spec.password, m);
    },
    /* can respawnEpicbox start this wallet's listener without asking for the password */
    hasEpicboxSpec(dir){
      return epicboxSpecs.has(dir);
    },
    /* a listener of ours runs already (reused at login): keep how it is started, for a server change */
    rememberEpicboxSpec(cmd, args, password){
      const desc = describeSpawn(cmd, args);
      if(desc && desc.role == 'epicbox'){
        epicboxSpecs.set(desc.dir, {cmd, args: args.slice(), password});
      }
    },
    /* lock: no password is kept */
    forgetEpicboxSpecs(){
      epicboxSpecGen++;
      epicboxSpecs.clear();
    },
    /* the wallet's Epicbox listener started by this window, if it runs: {pid, url (the server it
       connected to), address, state}; null otherwise (e.g. one left running by an earlier start) */
    liveEpicbox(dir){
      for(const [pid, l] of epicboxLive){
        if(l.dir === dir && !l.check && liveChildren.has(pid)){
          return {pid, url: l.url, address: l.address, state: l.state};
        }
      }
      return null;
    },
    /* listener events (shared/epicboxListener.js parseListenerLine, plus {type: 'exit'}), with
       {pid, dir, check}; resolves nothing */
    onEpicboxEvent(fn){
      if(typeof fn === 'function'){
        epicboxSubscribers.add(fn);
      }
    },

    async execRecover(cmd, args, platform, seeds, password){

      return new Promise(function(resolve, reject) {

          let recover = spawnEpic(cmd, args);


          let newSeedData = '';
          let errorData = '';

          recover.stdout.setEncoding('utf8');
          recover.stdout.on('data', (data) => {
            debug ? console.log('execRecover.stdout', data) : null;

            if(data.includes('Password:')){
              recover.stdin.write(password+"\n");
            }

            if(data.includes('Please enter your recovery phrase')){
              recover.stdin.write(seeds+"\n");
            }

            newSeedData += data;

          });


          recover.stderr.setEncoding('utf8');
          recover.stderr.on('data', (data) => {

            debug ? console.log('execRecover.stderr', data) : null;

            errorData += data;

            if(data.includes('Recovery word phrase is invalid.')){
              recover.stdin.pause();
              recover.kill();
              resolve({success: false, msg: errorData});
            }

          });

          recover.stdout.on('end', function () {

            debug ? console.log('execRecover.stdout.end') : null;

            if(errorData != ''){

              resolve({success: false, msg: errorData});

            }else if(newSeedData != ''){

              let phrase = parseRecoveryPhrase(newSeedData);
              if(phrase){
                resolve({success: true, msg: phrase});
              }else{
                resolve({success: false, msg: 'could not read the recovery phrase from epic-wallet output'});
              }
            }else{
              resolve({success: false, msg: 'unknow error'})
            }

          });

      });
    },

});

const aes256gcm = (shared_secret) => {
  const ALGO = 'aes-256-gcm';

  // encrypt returns base64-encoded ciphertext
  const encrypt = (str, nonce) => {
    let key = Buffer.from(shared_secret, 'hex')
    const cipher = crypto.createCipheriv(ALGO, key, nonce)
    const enc = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([enc, tag]).toString('base64')
  };

  // decrypt decodes base64-encoded ciphertext into a utf8-encoded string
  const decrypt = (enc, nonce) => {
    //key,nonce is all buffer type; data is base64-encoded string
    let key = Buffer.from(shared_secret, 'hex')
    const data_ = Buffer.from(enc, 'base64')
    const decipher = crypto.createDecipheriv(ALGO, key, nonce)
    const len = data_.length
    const tag = data_.slice(len-16, len)
    const text = data_.slice(0, len-16)
    decipher.setAuthTag(tag)
    const dec = decipher.update(text, 'binary', 'utf8') + decipher.final('utf8');
    return dec
  };

  return {
    encrypt,
    decrypt,
  };
};

//contextBridge.exposeInMainWorld('nodeFetch', useFetch);
contextBridge.exposeInMainWorld('nodeCrypto', require('crypto'));
contextBridge.exposeInMainWorld('nodeSecp256k1', secp256k1);
contextBridge.exposeInMainWorld('nodeAes256gcm', aes256gcm);
contextBridge.exposeInMainWorld('nodeSpawnSync', require('child_process').spawnSync);
contextBridge.exposeInMainWorld('nodeSpawn', require('child_process').spawn);
contextBridge.exposeInMainWorld('nodeExec', require('child_process').exec);
contextBridge.exposeInMainWorld('nodeExecSync', require('child_process').execSync);
contextBridge.exposeInMainWorld('nodeExecFile', require('child_process').execFile);
contextBridge.exposeInMainWorld('clipboard', {
  writeText: (text) => ipcRenderer.invoke('clipboard-write-text', text),
});
//File.path was removed in Electron 32
contextBridge.exposeInMainWorld('nodeWebUtils', {
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
contextBridge.exposeInMainWorld('log', log);
contextBridge.exposeInMainWorld('debug', debug);
contextBridge.exposeInMainWorld('nodeFs', fs);
contextBridge.exposeInMainWorld('nodeFsExtra', require('fs-extra'));
contextBridge.exposeInMainWorld('nodeQr', qr);
contextBridge.exposeInMainWorld('nodePath', require('path'));
contextBridge.exposeInMainWorld('config', {

  async isPortReachable(host, port){
    return await isPortReachable(port, {host: host});
  },
  async getPublicIp(){
    let response = await fetch('https://api.ipify.org?format=json', {
      method:'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }).then(function(res){

      if (!res.ok) { throw Error(res) }
      return res.json();
    }).catch(function(error){

      let msg = 'Error connecting api.ipify.org ';
      return false;
    });
    return response;
  },

  async getPrice(){

    let response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=epic-cash', {
      method:'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }).then(function(res){

      if (!res.ok) { throw Error(res) }
      return res.json();
    }).catch(function(error){

      let msg = 'Error connecting coingecko ';
      return false;
    });
    return response;
  },
  getResourcePath(){
    return resourcePath;
  },
  getUserHomedir () {
    return homedir;
  },
  getPlatform(){
    switch (os.platform()) {
      case 'aix':
      case 'freebsd':
      case 'linux':
      case 'openbsd':
      case 'android':
        return 'linux';
      case 'darwin':
      case 'sunos':
        return 'mac';
      case 'win32':
        return 'win';
    }
  },
  getArch(){
    return os.arch();
  },
  getOnionV3(address){

    const chekcsumstr = Buffer.from(".onion checksum","utf8");
    const onion_version = Buffer.from("03","hex");

    let pubKey = Buffer.from(address, 'hex');

    let checksum = Buffer.from(sha3_256.create().update(Buffer.concat([chekcsumstr, pubKey, onion_version])).digest()).slice(0,2);
    return base32.encode(Buffer.concat([pubKey, checksum, onion_version])).toLowerCase();

  },

});

contextBridge.exposeInMainWorld('explorer', {
  //can be block height or commit
  open(data){
      shell.openExternal('https://explorer.epic.tech/blockdetail/' + data);
  }
});

contextBridge.exposeInMainWorld('openlink', {
  //can be block height or commit
  open(url){
      shell.openExternal(url);
  }
});

contextBridge.exposeInMainWorld('openepichidden', {

  open(user_homedir = ''){
      let dir = path.join(homedir, ".epic");
      if(user_homedir != ''){
        dir = user_homedir;
      }
      shell.openPath(dir)
  }
});




// Adds an object 'api' to the global window object:
contextBridge.exposeInMainWorld('api', {
    showSaveDialog: async (title, message, defaultPath) => {
        return await ipcRenderer.invoke('show-save-dialog', title, message, defaultPath);
    },
    showOpenDialog: async () => {
        return await ipcRenderer.invoke('show-open-dialog');
    },
    quit: () => {
      ipcRenderer.invoke('quit');
    },
    resize: (width, height) => {
      ipcRenderer.invoke('resize', width, height);
    },
    locale: async() => {
      return await ipcRenderer.invoke('locale');
    },
    version: async() => {
      return await ipcRenderer.invoke('version');
    },
    nodebackground:(nodebackground) => {
      ipcRenderer.send('nodeBackground', nodebackground);
    },
    epicboxbackground:(epicboxbackground) => {
      ipcRenderer.send('epicboxBackground', epicboxbackground);
    },
    //reload the renderer at index.html, after switching between the Modern and Classic interface
    reloadUi: () => {
      ipcRenderer.invoke('reload-ui');
    },
    //live public nodes from status.btlabs.uk, fetched by the main process (null when unavailable)
    nodeDirectory: (chain) => ipcRenderer.invoke('node-directory', chain),
    

});

