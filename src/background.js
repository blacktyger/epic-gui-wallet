'use strict'

import { app, protocol, net, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } from 'electron'
import contextMenu from 'electron-context-menu'
import { exec } from 'child_process'
import { pathToFileURL } from 'url'
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer'


const isDevelopment = process.env.NODE_ENV !== 'production'
const path = require('path')
const ps = require('ps-node');
const findProcess = require('find-process');
const log = require('electron-log');
//no wallet password in any log line (src/logRedact.js)
require('./logRedact').installLogRedaction(log);
require('./logRedact').installConsoleRedaction(console);
const { migrateFromEpicWallet, pinUserDataDir } = require('./userDataMigration');
//before any window or session touches userData: freeze its folder name (a package rename must not
//move the profile again), then bring over the 5.x profile (address book, settings)
pinUserDataDir(app, log);
migrateFromEpicWallet(app, log);
const {autoUpdater} = require("electron-updater");
autoUpdater.channel = "latest";
//setting the channel turns on downgrades: an older release would be offered as an update
autoUpdater.allowDowngrade = false;
autoUpdater.allowPrerelease = false;
autoUpdater.autoDownload = false;
let win;
let noderuninbackground = false;
let epicboxruninbackground = false;


contextMenu({
	showSaveImageAs: true
});

//-------------------------------------------------------------------
// Logging
//
// THIS SECTION IS NOT REQUIRED
//
// This logging setup is not required for auto-updates to work,
// but it sure makes debugging easier :)
//-------------------------------------------------------------------
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'debug';
log.info('App starting...');


async function kill(pid){
  return new Promise(function(resolve, reject) {
    let iskilled;
    if (process.platform === 'win32') {
        exec(`taskkill /pid ${pid} /f /t`, function( err ) {
           if (err) {
             resolve(false);
           }
           else {

             resolve(true);
           }
       });

    }else{
      //check if 3 seconds for node server is to short and makes problems
      ps.kill(pid, {timeout: 3},function( err ) {
          if (err) {
            resolve(false);
          }
          else {

            resolve(true);
          }
      });
    }
  });
}


//[13088:0215/073859.040:ERROR:gpu_init.cc(454)] Passthrough is not supported, GL is disabled, ANGLE is
app.disableHardwareAcceleration();

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])


//serve the app files on app:// (replaces the plugin's createProtocol, which uses the deprecated registerBufferProtocol)
function createProtocol(scheme){
  protocol.handle(scheme, (req) => {
    let reqPath = path.normalize(new URL(req.url).pathname);
    if(reqPath === '/' || reqPath === '\\'){
      reqPath = '/index.html';
    }
    const filePath = path.join(__dirname, reqPath);
    if(!filePath.startsWith(__dirname + path.sep)){
      return new Response(null, {status: 404});
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

async function createWindow() {
  // Create the browser window.

  win = new BrowserWindow({
    width: 1044,
    height: 768,
    minWidth: 1044,
    maxWidth: 1600,
    title: "Epiccash Wallet",//fix in index.html
    webPreferences: {
      icon: path.join(__dirname, '../public/favicon.ico'),
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: false,
      contextIsolation: true,
      //the preload script uses Node.js (child processes, fs); renderers are sandboxed by default since Electron 20
      sandbox: false,
      //enableRemoteModule: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    }
  });

  //a link that would open a new app window (target=_blank, middle-click, window.open) opens in the
  //browser instead, http(s) only; the new window would have this window's preload and powers
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })


  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
    //a missing or unreadable feed means no update, without a notice
    autoUpdater.checkForUpdates().catch((err) => log.info('update check failed: ' + (err && err.message)));

  }



  if (!isDevelopment) {
    if(process.platform == 'darwin'){
      var menu = Menu.buildFromTemplate([
          {
              label: 'Menu',
              submenu: [
                  { label: "About Application", selector: "orderFrontStandardAboutPanel:" },
                  { label: "Source on GitHub", click ()
                    {
                      shell.openExternal('https://github.com/EpicCash/epic-gui-wallet');
                    }
                   },
                  { type: "separator" },
                  {
                      label:'Quit',
                      accelerator: "CmdOrCtrl+Q",
                      async click() {
                          let killPromise = [];
                          let killProcess = false;
                          let killPids = [];
                          let pEpicnodeList = [];

                          let pWalletList = await findProcess('name', /.*?epic-wallet.*(owner_api|listen|scan)/);
                          if(epicboxruninbackground){

                            for(let process of pWalletList) {

                              if((process.cmd.includes('owner_api') || process.cmd.includes("listen") || process.cmd.includes('scan')) && !process.cmd.includes("epicbox")){
                                console.log('process kill without epicbox background', process);
                                killPids.push(process);
                              }
                            }

                          }else{
                            for(let process of pWalletList) {

                              if(process.cmd.includes('owner_api') || process.cmd.includes("listen")  || process.cmd.includes('scan')){
                                console.log('process kill all background', process);
                                killPids.push(process);
                              }
                            }

                          }

                          if(noderuninbackground == false){
                            pEpicnodeList = await findProcess('name', /.*?epic.*server.*run/);
                          }


                          let pWalletTorList = await findProcess('name', /tor/);


                          for(let process of pEpicnodeList) {
                            if(process.cmd.includes('server')){
                              killPids.push(process);
                            }
                          }
                          for(let process of pWalletTorList) {
                            if(process.cmd.includes('tor/listener/torrc')){
                              killPids.push(process);
                            }
                          }
                          if(killPids.length){
                            for(let process of killPids) {

                              killPromise.push(kill(process.pid))
                            }
                            await Promise.all(killPromise);
                          }


                          app.quit()
                      }
                  },

              ],

          },
          {
            label: "Application",
            submenu: [

              {
                label: "Edit",
                submenu: [
                    { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
                    { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
                    { type: "separator" },
                    { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
                    { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
                    { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
                    { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
                ]
              }
            ]


          }

      ]);
    }else{
      menu = Menu.buildFromTemplate([
          {
              label: 'Menu',
              submenu: [

                  { label: "Source on GitHub", click ()
                    {
                      shell.openExternal('https://github.com/EpicCash/epic-gui-wallet');
                    }
                   },
                  { type: "separator" },
                  {
                      label:'Quit',
                      accelerator: "CmdOrCtrl+Q",
                      async click() {
                        let killPromise = [];
                        let killProcess = false;
                        let killPids = [];
                        let pEpicnodeList = [];

                        let pWalletList = await findProcess('name', /.*?epic-wallet.*(owner_api|listen|scan)/);
                        if(epicboxruninbackground){

                          for(let process of pWalletList) {

                            if((process.cmd.includes('owner_api') || process.cmd.includes("listen") || process.cmd.includes('scan')) && !process.cmd.includes("epicbox")){
                              console.log('process kill without epicbox background', process);
                              killPids.push(process);
                            }
                          }

                        }else{
                          for(let process of pWalletList) {

                            if(process.cmd.includes('owner_api') || process.cmd.includes("listen")  || process.cmd.includes('scan')){
                              console.log('process kill all background', process);
                              killPids.push(process);
                            }
                          }

                        }

                        if(noderuninbackground == false){
                          pEpicnodeList = await findProcess('name', /.*?epic.*server.*run/);
                        }

                        let pWalletTorList = await findProcess('name', /tor/);

                        for(let process of pEpicnodeList) {
                          if(process.cmd.includes('server')){
                            killPids.push(process);
                          }
                        }
                        for(let process of pWalletTorList) {
                          if(process.cmd.includes('tor/listener/torrc')){
                            killPids.push(process);
                          }
                        }
                        if(killPids.length){
                          for(let process of killPids) {

                            killPromise.push(kill(process.pid))
                          }
                          await Promise.all(killPromise);
                        }
                        app.quit()
                      }
                  },

              ],

          },
          {
            label: "Application",
            submenu: [

              {
                label: "Edit",
                submenu: [
                    { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
                    { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
                    { type: "separator" },
                    { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
                    { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
                    { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
                    { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
                ]
              }
            ]


          }

      ]);
    }

    Menu.setApplicationMenu(menu);
  }else{
    console.log(win);
  }
  return win;
}



// Quit when all windows are closed.
app.on('window-all-closed', async() => {

  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {

    let killPromise = [];
    let killProcess = false;
    let killPids = [];
    let pEpicnodeList = [];

    let pWalletList = await findProcess('name', /.*?epic-wallet.*(owner_api|listen|scan)/);

    if(epicboxruninbackground){

      for(let process of pWalletList) {

        if((process.cmd.includes('owner_api') || process.cmd.includes("listen") || process.cmd.includes('scan')) && !process.cmd.includes("epicbox")){
          console.log('process kill without epicbox background', process);
          killPids.push(process);
        }
      }

    }else{
      for(let process of pWalletList) {

        if(process.cmd.includes('owner_api') || process.cmd.includes("listen")  || process.cmd.includes('scan')){
          console.log('process kill all background', process);
          killPids.push(process);
        }
      }

    }

    if(noderuninbackground == false){
      pEpicnodeList = await findProcess('name', /.*?epic.*server.*run/);
    }


    for(let process of pEpicnodeList) {
      if(process.cmd.includes('server')){
        killPids.push(process);
      }
    }
    if(killPids.length){
      for(let process of killPids) {

        killPromise.push(kill(process.pid))
      }
      await Promise.all(killPromise);
    }


    app.quit()
  }

});

/*autoUpdater.on('checking-for-update', () => {

  sendStatusToWindow('Checking for update...');
})*/
autoUpdater.on('update-available', (info) => {

  const dialogOpts = {
        type: 'info',
        buttons: ['Ok'],
        title: 'Update available.',
        message: 'Version ' + info.version,
        detail: 'A New Version is available for download.\nhttps://github.com/EpicCash/epic-gui-wallet/releases/latest'
  }

  dialog.showMessageBox(dialogOpts);

  //sendStatusToWindow('Update available.');
})
autoUpdater.on('update-not-available', (info) => {
  console.log("no update available");
  //sendStatusToWindow('Update not available.');
})
autoUpdater.on('error', (err) => {
  log.info('update check error: ' + (err && err.message));
});
/*autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  sendStatusToWindow(log_message);
})*/
/*autoUpdater.on('update-downloaded', (info) => {

  const dialogOpts = {
        type: 'info',
        buttons: ['Restart', 'Not Now. On next Restart'],
        title: 'Update',
        message: process.platform === 'win32' ? releaseNotes : releaseName,
        detail: 'A New Version has been Downloaded. Restart Now to Complete the Update.'
    }

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall()
    })

  //sendStatusToWindow('Update downloaded');
});*/


app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async (event) => {
  //console.log('app', noderuninbackground);
  console.log('noderuninbackground', noderuninbackground);
  console.log('epicboxruninbackground', epicboxruninbackground);

  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    setTimeout(() => {
      try {

        installExtension(VUEJS3_DEVTOOLS) .then(name => {
          console.log(`Added Extension: ${name}`)
          // get main window
          const win = BrowserWindow.getFocusedWindow()
          if (win) {
            win.webContents.on('did-frame-finish-load', () => {
              win.webContents.once('devtools-opened', () => {
                win.webContents.focus()
              })
              // open electron debug
              console.log('Opening dev tools')
              win.webContents.openDevTools()
            })
          }
        })
        .catch(err => {
          console.log('An error occurred: ', err)
        })

      } catch (e) {
        console.error('Vue Devtools failed to install:', e.toString())
      }
    }, 250)
  }

  createWindow()
})


// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {

      app.quit()
    })
  }
}


ipcMain.handle('show-save-dialog', async (event, title, message, defaultPath) => {
    // do stuff
    let responce = await dialog.showSaveDialog({
      title: title,
      message: message,
      defaultPath: defaultPath
    });
    return responce;
});

ipcMain.handle('show-open-dialog', async (event, title, message, defaultPath) => {
    // do stuff
    let responce = await dialog.showOpenDialog({
      properties:["openDirectory", "showHiddenFiles", "createDirectory"]
    });
    return responce;
});

ipcMain.handle('locale', async() => {
  return await app.getLocale();
});
ipcMain.handle('version', () => {
  let currentVersion = '';
  if (process.env.NODE_ENV === 'development') {
     currentVersion = require('../package.json').version;
   } else {
     currentVersion = app.getVersion();
   }
   return currentVersion;

});



//the clipboard module is not available in renderer processes since Electron 44
ipcMain.handle('clipboard-write-text', (event, text) => {
  return clipboard.writeText(String(text));
});

ipcMain.handle('resize', (event, width, height) => {

  let browserWindow = BrowserWindow.fromWebContents(event.sender)
  browserWindow.setSize(width,height);
});

ipcMain.on('scan-stdout', (event, data) => {
  event.reply('scan-stdout', { data });
});

ipcMain.on('firstscan-stdout', (event, data) => {
  event.reply('firstscan-stdout', { data });
});

ipcMain.on('scan-finish', (event, data) => {
  event.reply('scan-finish', { data });
});
ipcMain.on('scan-error', (event, data) => {
  event.reply('scan-error', { data });
});

ipcMain.on('walletCreated', (event, data) => {
  event.reply('walletCreated', { data });
});

ipcMain.on('walletExisted', (event, data) => {
  event.reply('walletExisted', {  });
});

ipcMain.on('walletCreateFailed', (event, data) => {
  event.reply('walletCreateFailed', {  });
});

ipcMain.on('nodeBackground', (event, data) => {
  noderuninbackground = data;
});

ipcMain.on('epicboxBackground', (event, data) => {
  epicboxruninbackground = data;
});
