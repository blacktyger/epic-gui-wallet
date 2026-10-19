// vue.config.js
const fs = require('fs');
const path = require('path');

/*
 * node-pty: the pseudo-terminal the main process runs epic-wallet's listeners and init on
 * (src/shared/ptyHost.js). A native module: not bundled by webpack and not put in app.asar, but
 * copied as plain files to resources/node-pty (background.js loads it from there), with only what
 * the target platform loads. Its lib/ loads build/Release first, then prebuilds/<platform>-<arch>.
 *   Linux:   no prebuild; compiled at `npm install` into build/Release/pty.node
 *   Windows: the x64 prebuild (conpty.node, conpty_console_list.node, and pty.node with winpty for
 *            Windows 10 before 1903), or build/Release when it was compiled on this machine.
 *            Not the bundled conpty.dll / OpenConsole.exe (useConptyDll is off), no .pdb
 *   macOS:   the darwin prebuilds (pty.node, spawn-helper)
 */
const PTY_LIB = ['package.json', 'LICENSE', 'lib/**/*.js', '!lib/**/*.test.js'];
const PTY_WIN_FILES = '{conpty.node,conpty_console_list.node,pty.node,winpty-agent.exe,winpty.dll}';
//compiled from source on this (Windows) machine: then build/Release is what it loads
const ptyWinBuilt = fs.existsSync(path.join(__dirname, 'node_modules/node-pty/build/Release/conpty.node'));
const ptyFiles = (to, filter) => ({ from: 'node_modules/node-pty', to, filter: [...PTY_LIB, ...filter] });
const ptyExtra = {
  linux: ptyFiles('resources/node-pty', ['build/Release/pty.node']),
  win: ptyFiles('resources/node-pty', [ptyWinBuilt ? 'build/Release/' + PTY_WIN_FILES : 'prebuilds/win32-x64/' + PTY_WIN_FILES]),
  mac: ptyFiles('Resources/node-pty', ['prebuilds/darwin-*/{pty.node,spawn-helper}', 'build/Release/{pty.node,spawn-helper}']),
};

/**
 * @type {import('@vue/cli-service').ProjectOptions}
 */

module.exports = {
  css: {
    loaderOptions: {
      sass: {
        sassOptions: {
          //Bulma 0.9 and our styles still use @import and global functions; moving to @use needs Bulma 1.0
          quietDeps: true,
          silenceDeprecations: ['import', 'global-builtin'],
        },
      },
    },
  },
  pluginOptions: {
    electronBuilder: {
      nodeIntegration: false,
      mainProcessFile: 'src/background.js',
      preload: 'src/preload.js',
      //node-pty is loaded at run time from resources/node-pty (ptyExtra), never bundled or copied
      //into app.asar with the rest of node_modules
      externals: ['!node-pty'],
      builderOptions: {
        //electron-builder also collects the project's node_modules into app.asar: not node-pty
        //(all platforms' prebuilds and .pdb files), it is in resources/node-pty
        files: ['**/*', '!**/node_modules/node-pty{,/**}'],
        "productName": "EpicWallet",
        "afterSign": "./build/notarize.js",
        "appId": "com.github.epiccash.epic-gui-wallet",
        directories: {
          output: "build",
        },
        "dmg": {
          "contents": [
            {
              "x": 410,
              "y": 150,
              "type": "link",
              "path": "/Applications"
            },
            {
              "x": 130,
              "y": 150,
              "type": "file",

            }
          ]
        },

        "mac": {
          "icon": "public/favicon_io/EpicCash_logo_gold_border1024x1024.png",
          "category": "public.app-category.finance",
          "provisioningProfile": "build/Epiccash_Wallet_Provisioning_Profile_2023.provisionprofile",
          "target": "default",
          "publish": {
            "provider": "github",
            "releaseType": "draft",
            "channel": "latest",
          },
          "extraFiles": [
            ptyExtra.mac,
            {
              "from": "resources/bin/mac",
              "to": "Resources/bin/mac",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/bin/macsilicon",
              "to": "Resources/bin/macsilicon",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/default.app.json",
              "to": "Resources/default.app.json",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/default.config.json",
              "to": "Resources/default.config.json",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/foundation.json",
              "to": "Resources/foundation.json",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/epic-server.toml",
              "to": "Resources/epic-server.toml",
              "filter": [
                "**/*"
              ]
            }
          ]
        },
        "win": {
          "icon": "public/favicon_io/EpicCash_logo_gold_border1024x1024.png",
          "target": "nsis",
          "extraFiles": [
            ptyExtra.win,
            {
              "from": "resources/bin/win",
              "to": "resources/bin/win",
              "filter": [
                "**/*"
              ]
            },

            {
              "from": "resources/default.app.json",
              "to": "Resources/default.app.json",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/default.config.json",
              "to": "Resources/default.config.json",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/foundation.json",
              "to": "Resources/foundation.json",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/epic-server.toml",
              "to": "Resources/epic-server.toml",
              "filter": [
                "**/*"
              ]
            }
          ]
        },
        "nsis": {
          "oneClick": false,
          "allowToChangeInstallationDirectory": false
        },
        "linux": {
          "category": "Utility",
          "executableName": "EpicWallet",
          "icon": "build/icon.icns",
          "packageCategory": "Utility",
          "maintainer": "Johannes Hahn <j.hahn@eccence.digital>",
          "synopsis": "P2P electronic cash wallet",
          "target": [
            "AppImage"
          ],
          "extraFiles": [
            ptyExtra.linux,
            {
              "from": "resources/bin/linux",
              "to": "resources/bin/linux",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/default.app.json",
              "to": "resources/default.app.json",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/default.config.json",
              "to": "resources/default.config.json",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/foundation.json",
              "to": "resources/foundation.json",
              "filter": [
                "**/*"
              ]
            },
            {
              "from": "resources/epic-server.toml",
              "to": "resources/epic-server.toml",
              "filter": [
                "**/*"
              ]
            }
          ],
          "desktop": {
            "entry": {
              "Name": "EpicWallet",
              "Encoding": "UTF-8",
              "Type": "Application",
              "Comment": "Epic Wallet, mind your Epic!",
              "StartupWMClass": "EpicWallet"
            }
          }
        }

      }


    }
  }
}
