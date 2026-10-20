// src/preload.js
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import os from 'os'
import { join } from 'path'
import path from 'path';
import * as secp256k1 from "@noble/secp256k1";
import isPortReachable from 'is-port-reachable';
import { createProcessRegistry, createPidCheck, describeSpawn, redactArgs } from './shared/processOwnership';
import { spawnCommand, plainBin, epicCwd } from './shared/spawnCommand';
import { parseListenerLine } from './shared/epicboxListener';
import { createScopedFs, isInside } from './shared/security';
import { checkSpawnArgs } from './shared/walletArgs';
import { pickedReadDirs } from './shared/walletFolder';

const moment = require('moment');
const crypto = require('crypto-browserify');
const qr = require("qrcode");
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
      //the tree: epic-wallet.exe (and a cmd.exe wrapper started by 6.0.0, an older version's tor.exe);
      //no cmd.exe, no console window. Processes on a pseudo-terminal are stopped this way too
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

/* only the app's own binaries in resources/bin/<platform> are started: epic (the node) or
   epic-wallet, by name, with the arguments the app gives them (walletArgs.checkSpawnArgs) and
   their toml in the app's folder. Whatever else the page asks for is not run */
const bundledBinDir = path.resolve(resourcePath, 'bin') + path.sep;
function allowedSpawn(cmd, args, role){
  if(!isBundledBin(cmd, [role === 'node' ? 'epic' : 'epic-wallet'])) return false;
  let given;
  try{ given = checkSpawnArgs(role, args); }catch(e){ return false; }
  return Object.values(given).every(p => isInside(p, appPaths.root, path));
}
function isBundledBin(cmd, names){
  const b = path.resolve(plainBin(cmd));
  const win = process.platform === 'win32';
  const inside = win ? b.toLowerCase().startsWith(bundledBinDir.toLowerCase()) : b.startsWith(bundledBinDir);
  return inside && names.includes(path.basename(win ? b.toLowerCase() : b).replace(/\.exe$/, ''));
}

/* start an epic binary without a shell (shared/spawnCommand.js), in the wallet's config dir or the
   node's folder: epic-wallet 4.1.0 reads an epic-wallet.toml in its working dir first */
function spawnEpic(cmd, args){
  const c = spawnCommand(cmd, args, {cwd: epicCwd(args)});
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

/*
 * Epicbox listeners started by this window: what their output says (shared/epicboxListener.js),
 * pid → {dir, check, url, address, state}. check: the short-lived listener on the old server
 * after a server change.
 */
const epicboxLive = new Map();
//the renderer's callbacks for listener events (App.vue, walletService)
const epicboxSubscribers = new Set();

function emitEpicbox(ev){
  for(const fn of epicboxSubscribers){
    try{ fn(ev); }catch(e){ /* a closed view */ }
  }
}

/* start an Epicbox listener on the main process's pseudo-terminal (spawnPty: it answers the
   password prompt with the session's); meta: {server: the wss:// url it is started with, check:
   the old-server check, timeoutMs} */
async function startEpicboxListener(cmd, args, meta = {}){

  //one Epicbox listener per wallet dir: a second one (a scan that missed ours, two starts at once) reuses it
  const desc = describeSpawn(cmd, args);
  const running = desc ? liveChildOf('epicbox', desc.dir) : 0;
  if(running){
    debug ? console.log('execEpicbox: already running', running) : null;
    return {success: true, msg: running, reused: true};
  }

  const check = !!meta.check;
  const listenProcess = await spawnPty(cmd, args, 'epicbox');
  if(!listenProcess.pid){
    return {success: false, pid: 0, state: 'off', msg: listenProcess.error || 'not started', noSession: !!listenProcess.noSession};
  }
  track(listenProcess, cmd, args, {server: meta.server});
  const pid = listenProcess.pid;
  const dir = desc ? desc.dir : '';
  const live = {dir, check, url: '', address: '', state: 'starting'};
  epicboxLive.set(pid, live);

  return new Promise(function(resolve) {

      let settled = false;
      //every answer names the pid and how far the listener got (state: its last event)
      const done = (res) => {
        if(settled) return;
        settled = true;
        resolve(Object.assign({pid, state: live.state}, res));
      };

      //whole lines (shared/ptyHost.js), stdout and stderr together
      listenProcess.stdout.on('data', (data) => {

          debug ? console.log('execEpicbox.stdout', data) : null;

          for(const line of data.split('\n')){
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
            done({success: false, msg: 'node not synced'});
          }

          //a wrong password, or another error that ends it
          if(data.includes('Wallet command failed') || data.includes('Error opening wallet')){
            done({success: false, msg: errorLines(data) || 'listener failed'});
          }

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

  });
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
    //in the wallet's config dir (-c), as spawnEpic: epic-wallet 4.1.0 reads an epic-wallet.toml in its working
    //dir first. init / init -r: walletService.initWallet made that dir (configService.newWalletDirs, 0700)
    //before the start; ptyHost refuses a dir that doesn't exist
    const cwd = epicCwd(args) || undefined;
    r = await ipcRenderer.invoke('pty-start', Object.assign({token, cmd: plainBin(cmd), args: (args || []).map(String), kind, cwd}, secrets || {}));
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
//a port another program holds: the listener's own words (shared/httpListener.js isAddrInUse reads them)
function errorLines(text){
  return String(text || '').split('\n').filter(l => /\bERROR\b|Wallet command failed|Error opening wallet|invalid|address already in use|addrinuse|only one usage of each socket address|os error (98|48|10048)\b/i.test(l)).join('\n').trim();
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

      if(!allowedSpawn(cmd, args, 'node')){
        log.warn('execNode: not the app\'s node or its arguments, not started');
        return false;
      }
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

      if(!allowedSpawn(cmd, args, 'owner_api')){
        log.warn('execStart: not the app\'s wallet or its arguments, not started');
        return false;
      }
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
    /* start wallet listen (--no_tor); the main process answers its password prompt with the session's */
    async execListen(cmd, args, platform){

      const listenProcess = await spawnPty(cmd, args, 'listen');
      if(!listenProcess.pid){
        return {success: false, msg: listenProcess.error || 'not started', noSession: !!listenProcess.noSession};
      }
      track(listenProcess, cmd, args);

      return new Promise(function(resolve) {

          let errors = [];
          listenProcess.stdout.on('data', (data) => {

              debug ? console.log('execListen.stdout', data) : null;

              if(data.includes('HTTP Foreign listener started.')){

                resolve({success: true, msg: listenProcess.pid});
              }
              if(data.includes('Failed to check node sync status')){

                resolve({success: false, msg: 'node not synced'});
              }
              const err = errorLines(data);
              if(err){
                errors.push(err);
              }
              //a wrong password: the same plain message epic-wallet gives
              if(data.includes('Wallet command failed') || data.includes('Error opening wallet')){
                resolve({success: false, msg: err || data});
              }

          });

          listenProcess.on('exit', (code) => {
            resolve({success: false, msg: errors.join('\n') || 'listener exited (' + code + ')'});
          });

      });
    },

    /* start wallet epicbox (no password: the main process answers its prompt); meta: {server:
       the wss:// url from its toml, check: the old-server check, timeoutMs} */
    async execEpicbox(cmd, args, platform, meta){
      //two starts at once (login after the node synced, the Receive page) share one listener
      return oncePerDir('epicbox', cmd, args, () => startEpicboxListener(cmd, args, meta || {}));
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

/*
 * What the page can reach of the file system (shared/security.js createScopedFs): the app's own
 * folders, read and write; its resources and an older GUI's folders, read only; and the folders and
 * files the user picked in a dialog or dropped on the page. No child_process, no plain fs: the
 * processes are started by nodeChildProcess above, only the app's own binaries.
 */
const legacy = appPaths.legacy || {};
const strings = (list) => list.filter(d => typeof d === 'string' && d);
const readDirs = new Set(strings([resourcePath, legacy.epicDir, legacy.appConfigFile && path.dirname(legacy.appConfigFile),
  ...(Array.isArray(legacy.profiles) ? legacy.profiles.map(p => p && p.dir) : [])]));
const writeDirs = new Set(strings([appPaths.root, appPaths.defaultRoot]));
const scopedFs = createScopedFs({ fs, pathMod: path, copyFrom: [resourcePath],
  dirs: () => ({ read: [...readDirs], write: [...writeDirs] }) });

contextBridge.exposeInMainWorld('nodeSecp256k1', secp256k1);
contextBridge.exposeInMainWorld('nodeAes256gcm', aes256gcm);
contextBridge.exposeInMainWorld('clipboard', {
  writeText: (text) => ipcRenderer.invoke('clipboard-write-text', text),
  copySecret: (text) => ipcRenderer.invoke('clipboard-copy-secret', text),
  wipeSecret: () => ipcRenderer.invoke('clipboard-wipe-secret'),
});
//File.path was removed in Electron 32. A file dropped on or picked in the page (a File the page
//can't make up for a path of its choice) may be read
contextBridge.exposeInMainWorld('nodeWebUtils', {
  getPathForFile: (file) => {
    const p = webUtils.getPathForFile(file);
    if(p) readDirs.add(p);
    return p;
  },
});
//the log functions only, not electron-log's transports (its file path, its writers)
contextBridge.exposeInMainWorld('log', Object.fromEntries(['log', 'error', 'warn', 'info', 'verbose', 'debug', 'silly']
  .map(level => [level, (...args) => log[level](...args)])));
contextBridge.exposeInMainWorld('debug', debug);
contextBridge.exposeInMainWorld('nodeFs', scopedFs);
//toCanvas only: qrcode's toFile writes to any path with Node's fs
contextBridge.exposeInMainWorld('nodeQr', { toCanvas: (...args) => qr.toCanvas(...args) });
contextBridge.exposeInMainWorld('nodePath', require('path'));
contextBridge.exposeInMainWorld('config', {

  async isPortReachable(host, port){
    return await isPortReachable(port, {host: host});
  },
  /* the public IP (api.ipify.org) and the EPIC price (CoinGecko): asked by the main process
     (background.js 'lookup'), which sends no Origin and no app name; the JSON reply, else false */
  getPublicIp(){
    return ipcRenderer.invoke('lookup', 'ip');
  },

  getPrice(){
    return ipcRenderer.invoke('lookup', 'price');
  },
  getResourcePath(){
    return resourcePath;
  },
  /* GUI 6.1's folders: {root, source, defaultRoot, settingsFile, walletsDir, userData, logsDir,
     processesFile, legacy: {epicDir, appConfigFile, profiles}} (shared/appPaths.js) */
  appPaths(){
    return JSON.parse(JSON.stringify(appPaths));
  },
  /* older GUIs' wallets and profiles (read only, background.js 'legacy-scan'); known: dirs to skip.
     The importer may read the wallets' folders it finds (their config.json) */
  async legacyScan(known, opts){
    //opts.chainsOnly: only the chain data ({chains}), for the built-in node in Settings
    const scan = await ipcRenderer.invoke('legacy-scan', { known, chainsOnly: !!(opts && opts.chainsOnly) });
    for(const w of (scan && Array.isArray(scan.wallets) ? scan.wallets : [])){
      for(const d of strings([w && w.key, w && w.dir])) readDirs.add(d);
    }
    return scan;
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

});

/* links and folders are opened by the main process, which checks them (background.js
   'open-external': http(s) only; 'open-folder': an app or wallet folder, never a file) */
contextBridge.exposeInMainWorld('explorer', {
  //a block height or a commit
  open(data){
    const d = String(data == null ? '' : data);
    if(/^[0-9a-fA-F]{1,66}$/.test(d)){
      ipcRenderer.invoke('open-external', 'https://explorer.epic.tech/blockdetail/' + d);
    }
  }
});

contextBridge.exposeInMainWorld('openlink', {
  open(url){
    return ipcRenderer.invoke('open-external', String(url == null ? '' : url));
  }
});

contextBridge.exposeInMainWorld('openepichidden', {

  //a wallet's folder, else the app folder
  open(dir = ''){
    return ipcRenderer.invoke('open-folder', String(dir || appPaths.root));
  }
});




// Adds an object 'api' to the global window object:
contextBridge.exposeInMainWorld('api', {
    //the file the user chose may then be written (window.nodeFs)
    showSaveDialog: async (title, message, defaultPath) => {
        const r = await ipcRenderer.invoke('show-save-dialog', title, message, defaultPath);
        if(r && !r.canceled && typeof r.filePath === 'string' && r.filePath) writeDirs.add(r.filePath);
        return r;
    },
    //a folder the user chose: a wallet folder to open, or another app folder (configService.setRoot)
    showOpenDialog: async () => {
        const r = await ipcRenderer.invoke('show-open-dialog');
        if(r && !r.canceled && Array.isArray(r.filePaths)) strings(r.filePaths).forEach(d => writeDirs.add(d));
        return r;
    },
    //Open a wallet folder: the dialog, and what was picked worked out to wallet folders (background.js);
    //only the wallets found from it may then be read (wallet.seed, epic-wallet.toml), not the picked folder
    pickWalletFolder: async (title) => {
        const r = await ipcRenderer.invoke('pick-wallet-folder', String(title || ''));
        if(r && !r.canceled){
          strings(pickedReadDirs(r)).forEach(d => readDirs.add(d));
        }
        return r;
    },
    //is another Epic program using this folder (background.js 'folder-lock')? kind 'wallet' | 'chain'
    //→ {state: 'free' | 'locked' | 'unknown', files, via}
    folderLock: (kind, dir) => ipcRenderer.invoke('folder-lock', String(kind || ''), String(dir || '')),
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
    //a node API call (shared/nodeFetch.js), sent by the main process: {url, method, headers, body,
    //redirect, timeoutMs} → {ok, status, text} | {error}
    nodeFetch: (req) => ipcRenderer.invoke('node-fetch', req),
    //the url of this version's GitHub release (or the releases page), checked by the main process
    releaseUrl: () => ipcRenderer.invoke('release-url'),
    //start the app again: after choosing another app folder (configService.setRoot), which is read at start
    relaunch: () => ipcRenderer.invoke('app-relaunch'),
    //the app menu (shared/appMenu.js): whether a wallet is unlocked, and its labels in the app's language
    menuState: (unlocked, labels) => {
      ipcRenderer.send('menu-state', { unlocked: unlocked === true, labels: { lock: String((labels && labels.lock) || ''), quit: String((labels && labels.quit) || '') } });
    },
    //Menu › Lock wallet was chosen: one listener (App.vue)
    onMenuLock: (func) => {
      ipcRenderer.removeAllListeners('menu-lock');
      ipcRenderer.on('menu-lock', () => func());
    },


});

