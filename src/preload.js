// src/preload.js
import { contextBridge, ipcRenderer, shell, webUtils } from 'electron'
import os from 'os'
import { join } from 'path'
import path from 'path';
import * as secp256k1 from "@noble/secp256k1";
import isPortReachable from 'is-port-reachable';
import { createProcessRegistry, createPidCheck, describeSpawn, redactArgs } from './shared/processOwnership';
import { spawnCommand, plainBin, epicCwd } from './shared/spawnCommand';

const moment = require('moment');
const base32 = require('rfc-3548-b32');
const crypto = require('crypto-browserify');
const qr = require("qrcode");
const sha3_256 = require('js-sha3').sha3_256;
const ps = require('ps-node');
const fs = require('fs');
const log = require('electron-log');
//no wallet password in any log line (src/logRedact.js)
require('./logRedact').installLogRedaction(log);
require('./logRedact').installConsoleRedaction(console);
const { EventEmitter } = require('events');

//GUI 6.1's folders (shared/appPaths.js), resolved once by the main process (background.js)
const appPaths = ipcRenderer.sendSync('app-paths');



const resourcePath =
  !process.env.NODE_ENV || process.env.NODE_ENV === "production"
    ? process.resourcesPath // Live Mode
    : path.join(__dirname, '../resources/'); // Dev Mode


let logFile = `${moment(new Date()).format('YYYY_MM_D')}.log`
let logPath = join(appPaths.logsDir, logFile);
log.transports.file.resolvePath = () => logPath
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}:{ms} [{level}] {text}';
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.file.level = 'debug';
log.transports.file.streamConfig = {flags: 'w'};
log.transports.console.format = '{y}-{m}-{d} {h}:{i}:{s}:{ms} [{level}] {text}'
log.transports.console.level = process.env.NODE_ENV === 'production' ? 'info' : 'debug'

//debug mode for production: the user creates a file "debug.log" in the app folder (<root>)
let debug = false;//process.env.NODE_ENV !== 'production';
if(fs.existsSync(path.join(appPaths.root, 'debug.log'))){
  debug = true;
  console.log = log.log;
}

const spawn = require('child_process').spawn;
const exec = require('child_process').exec;
const execFile = require('child_process').execFile;
const validChannels = ['firstscan-stdout', 'scan-stdout', 'scan-finish', 'scan-error', 'walletExisted', 'walletCreated', 'walletCreateFailed', 'nodeBackground'];

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
      //the tree: epic-wallet.exe and its tor.exe (and a cmd.exe wrapper started by 6.0.0); no
      //cmd.exe, no console window. Processes on a pseudo-terminal are stopped this way too
      execFile('taskkill', ['/pid', String(Number(pid)), '/f', '/t'], {windowsHide: true}, function( err ) {
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
  file: appPaths.processesFile,
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

/* start an epic binary without a shell (shared/spawnCommand.js), in the wallet's config dir or the
   node's folder: epic-wallet 4.1.0 reads an epic-wallet.toml in its working dir first */
function spawnEpic(cmd, args){
  const c = spawnCommand(cmd, args, {cwd: epicCwd(args)});
  return spawn(c.cmd, c.args, c.options);
}

function track(child, cmd, args){
  cmd = plainBin(cmd);
  debug ? console.log('spawn', cmd, redactArgs(args).join(' ')) : null;
  if(child.pid){
    const entry = ownProcesses.record(child.pid, cmd, args);
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

/*
 * The listeners and init/recover run on a pseudo-terminal in the main process (shared/ptyHost.js),
 * which answers their password prompt: neither the command line nor this preload has the password
 * of a listener. Their output comes back as lines (stdout and stderr together, prompts left out).
 * spawnPty resolves a child-like object {pid, id, mode, stdout ('data': text), on('exit', (code,
 * signal, fail))}; pid 0 with {error, noSession} when nothing was started. Events that arrive
 * before the caller attached its handlers are kept for it.
 */
const ptyChildren = new Map();
ipcRenderer.on('pty-data', (event, m) => {
  const c = m && ptyChildren.get(m.token);
  if(c) c.deliver('data', (m.lines || []).join('\n') + '\n');
});
ipcRenderer.on('pty-exit', (event, m) => {
  const c = m && ptyChildren.get(m.token);
  if(c){
    ptyChildren.delete(m.token);
    c.deliver('exit', m);
  }
});
let ptySeq = 0;

async function spawnPty(cmd, args, kind, secrets){
  const token = process.pid + '-' + (++ptySeq) + '-' + Date.now();
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  let queue = [];
  const emit = (what, v) => what === 'data' ? child.stdout.emit('data', v) : child.emit('exit', v.code, v.signal, v.fail);
  ptyChildren.set(token, {deliver: (what, v) => queue ? queue.push([what, v]) : emit(what, v)});
  let r;
  try{
    r = await ipcRenderer.invoke('pty-start', Object.assign({token, cmd: plainBin(cmd), args: (args || []).map(String), kind}, secrets || {}));
  }catch(e){
    r = {ok: false, error: e && e.message ? e.message : 'start failed'};
  }
  if(!r || !r.ok){
    ptyChildren.delete(token);
    child.pid = 0;
    child.error = r && r.error;
    child.noSession = !!(r && r.noSession);
    return child;
  }
  child.pid = r.pid;
  child.id = r.id;
  child.mode = r.mode;
  //the caller attaches its handlers right after this resolves
  setTimeout(() => {
    const q = queue;
    queue = null;
    q.forEach(([what, v]) => emit(what, v));
  }, 0);
  return child;
}

//the error lines of epic-wallet output, for a message
function errorLines(text){
  return String(text || '').split('\n').filter(l => /\bERROR\b|Wallet command failed|Error opening wallet|invalid/i.test(l)).join('\n').trim();
}

/* one start at a time per role and wallet dir: a second caller while the first one runs (the
   check above and the record of the new pid are an IPC round trip apart) gets its answer */
const startsInFlight = new Map();
function oncePerDir(role, cmd, args, start){
  const desc = describeSpawn(cmd, args);
  const key = desc ? role + '\n' + desc.dir : '';
  if(key && startsInFlight.has(key)){
    return startsInFlight.get(key);
  }
  const p = start();
  if(key){
    startsInFlight.set(key, p);
    const done = () => { if(startsInFlight.get(key) === p) startsInFlight.delete(key); };
    p.then(done, done);
  }
  return p;
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
    async spawn(cmd, args){
      const child = await spawn(cmd, args);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data',function(data){
        debug ? console.log('spawn.stdout', data) : null;
      });

      return child;

    },

    /* init: a new wallet; the password goes to the main process for this one process only and
       answers epic-wallet's prompts there (shared/ptyHost.js). Resolves {success, msg: phrase | error} */
    async execNew(cmd, args, platform, password){

      let output = [];
      const child = await spawnPty(cmd, args, 'init', {password: String(password)});
      if(!child.pid){
        return {success: false, msg: child.error || 'epic-wallet init not started'};
      }
      const done = await new Promise(function(resolve) {
        //not logged, not even in debug mode: it holds the new recovery phrase
        child.stdout.on('data', (data) => {
          output.push(data);
        });
        child.on('exit', (code) => {
          const text = output.join('');
          const phrase = parseRecoveryPhrase(text);
          if(code === 0 && phrase){
            resolve({success: true, msg: phrase});
          }else{
            resolve({success: false, msg: errorLines(text) || (code === 0 ? 'could not read the recovery phrase from epic-wallet output' : 'epic-wallet init failed (' + code + ')')});
          }
        });
      });
      output = [];
      return done;
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
    /* start wallet listen; the main process answers its password prompt with the session's */
    async execListen(cmd, args, platform){

      const listenProcess = await spawnPty(cmd, args, 'listen');
      if(!listenProcess.pid){
        return {success: false, msg: listenProcess.error || 'not started', noSession: !!listenProcess.noSession, tor: false};
      }
      track(listenProcess, cmd, args);

      return new Promise(function(resolve) {

          let isTorBooted = false;
          let errors = [];
          listenProcess.stdout.on('data', (data) => {

              debug ? console.log('execListen.stdout', data) : null;

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
              const err = errorLines(data);
              if(err){
                errors.push(err);
              }
              //a wrong password: the same plain message epic-wallet gives
              if(data.includes('Wallet command failed') || data.includes('Error opening wallet')){
                resolve({success: false, msg: err || data, tor: isTorBooted});
              }

          });

          listenProcess.on('exit', (code) => {
            resolve({success: false, msg: errors.join('\n') || 'listener exited (' + code + ')', tor: isTorBooted});
          });

      });
    },

    /* start wallet epicbox; the main process answers its password prompt with the session's */
    async execEpicbox(cmd, args, platform){
      //two starts at once (login after the node synced, the Receive page) share one listener
      return oncePerDir('epicbox', cmd, args, async () => {

        //one Epicbox listener per wallet dir: a second one (a scan that missed ours, two starts at once) reuses it
        const desc = describeSpawn(cmd, args);
        const running = desc ? liveChildOf('epicbox', desc.dir) : 0;
        if(running){
          debug ? console.log('execEpicbox: already running', running) : null;
          return {success: true, msg: running};
        }

        const listenProcess = await spawnPty(cmd, args, 'epicbox');
        if(!listenProcess.pid){
          return {success: false, msg: listenProcess.error || 'not started', noSession: !!listenProcess.noSession};
        }
        track(listenProcess, cmd, args);

        return new Promise(function(resolve) {

            let errors = [];
            listenProcess.stdout.on('data', (data) => {

                debug ? console.log('execEpicbox.stdout', data) : null;

                if(data.includes('Starting epicbox listener') || data.includes('Epicbox listener started.')){

                  resolve({success: true, msg: listenProcess.pid});
                }

                if(data.includes('Failed to check node sync status')){
                  resolve({success: false, msg: 'node not synced', tor: false});
                }
                const err = errorLines(data);
                if(err){
                  errors.push(err);
                }
                if(data.includes('Wallet command failed') || data.includes('Error opening wallet')){
                  resolve({success: false, msg: err || data});
                }

            });

            listenProcess.on('exit', (code) => {
              resolve({success: false, msg: errors.join('\n') || 'listener exited (' + code + ')'});
            });

        });
      });
    },

    /* init -r: the phrase and the new password go to the main process for this one process only
       and answer epic-wallet's prompts there. Resolves {success, msg: '' | error} */
    async execRecover(cmd, args, platform, seeds, password){

      let output = [];
      const recover = await spawnPty(cmd, args, 'recover', {password: String(password), phrase: String(seeds)});
      if(!recover.pid){
        return {success: false, msg: recover.error || 'epic-wallet init -r not started'};
      }
      const done = await new Promise(function(resolve) {
        //not logged, not even in debug mode: it holds the recovery phrase
        recover.stdout.on('data', (data) => {
          output.push(data);
        });
        recover.on('exit', (code, signal, fail) => {
          debug ? console.log('execRecover.exit', code) : null;
          const text = output.join('');
          if(fail === 'invalid_phrase' || text.includes('Recovery word phrase is invalid.')){
            resolve({success: false, msg: 'Recovery word phrase is invalid.'});
          }else if(code === 0 && (text.includes("Command 'init' completed successfully") || text.includes('Your recovery phrase is'))){
            //the phrase is not passed back: the form has it
            resolve({success: true, msg: ''});
          }else{
            resolve({success: false, msg: errorLines(text) || 'epic-wallet init -r failed (' + code + ')'});
          }
        });
      });
      output = [];
      return done;
    },

    /* the wallet password of this session goes to the main process, once after the unlock; it is
       never handed back. clear: lock, logout, wallet switch */
    setSessionPassword(password, dir){
      return ipcRenderer.invoke('session-password-set', String(password), String(dir || ''));
    },
    clearSessionPassword(){
      return ipcRenderer.invoke('session-password-clear');
    },
    hasSessionPassword(){
      return ipcRenderer.invoke('session-password-has');
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
  /* GUI 6.1's folders: {root, source, defaultRoot, settingsFile, walletsDir, userData, logsDir,
     processesFile, legacy: {epicDir, appConfigFile, profiles}} (shared/appPaths.js) */
  appPaths(){
    return JSON.parse(JSON.stringify(appPaths));
  },
  /* older GUIs' wallets and profiles (read only, background.js 'legacy-scan'); known: dirs to skip */
  legacyScan(known){
    return ipcRenderer.invoke('legacy-scan', { known });
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

  //a wallet's folder, else the app folder
  open(dir = ''){
      shell.openPath(dir || appPaths.root)
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
    //reload the renderer at index.html, after switching between the Modern and Classic interface
    reloadUi: () => {
      ipcRenderer.invoke('reload-ui');
    },
    //live public nodes from status.btlabs.uk, fetched by the main process (null when unavailable)
    nodeDirectory: (chain) => ipcRenderer.invoke('node-directory', chain),
    //start the app again: after choosing another app folder (configService.setRoot), which is read at start
    relaunch: () => ipcRenderer.invoke('app-relaunch'),
    

});

