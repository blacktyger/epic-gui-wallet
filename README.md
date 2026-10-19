# Epic Graphical UI Wallet

## Project setup
Needs Node.js 22 and npm 10 (tested).
```
npm install
```

### Compiles and hot-reloads for development
```
npm run electron:serve
```

### Compiles and minifies for production
```
npm run electron:build
```
Add `-- --linux dir` for an unpacked Linux build in `build/linux-unpacked`.

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).

### Bundled epic and epic-wallet
"resources/bin" contains pre-built epic node **4.1.0-1** and epic-wallet **4.1.0** for Linux and Windows. macOS (`mac`, `macsilicon`) still has older binaries, because 4.1.0 has no macOS release yet. To use another version, build the [CLI epic-wallet project](https://github.com/EpicCash/epic-wallet) and replace the pre-built one.

### Node requirement
Use an Epic node **4.1.0-1 or later**. Node 4.1.0 requires authentication on `GET /v1/status`, which the node panel and the Epicbox autostart need. With 4.1.0, the panel shows "node unreachable" and Epicbox must be started by hand on the Receive page.

### Wallet password and the pseudo-terminal (node-pty)
epic-wallet gets the wallet password in no command line. The owner API is opened over its encrypted API. The listeners (http, Epicbox) and `init` / `init -r` run on a pseudo-terminal ([node-pty](https://github.com/microsoft/node-pty), pinned to 1.1.0) in the Electron main process. The main process answers epic-wallet's `Password:` prompt itself. After an unlock it keeps the password in memory (a Buffer it zeroes) until lock, logout, wallet switch, quit, reload, a renderer crash or the window closing, and never sends it back to the window. It starts only the bundled epic-wallet, only with the listener and init commands, and listeners only for the unlocked wallet. Zeroing is best effort: the password reaches the main process as a string, and node-pty copies what it writes. If node-pty can't be loaded or can't start a process (or a password contains a control character), the app falls back to `--pass` and logs that once.

node-pty is a native module. It is copied to `resources/node-pty` in the build (see `vue.config.js`), not into app.asar:
- Linux: there is no prebuild, so `npm install` compiles it against the build machine's glibc. Build releases in an environment no newer than the oldest system you support, e.g. electron-builder's Docker image (Ubuntu 22.04, glibc 2.35):
  ```
  docker run --rm -ti -v "$PWD":/project -w /project electronuserland/builder:22 \
    bash -c "npm ci && npm run electron:build -- --linux AppImage"
  ```
  On a newer host (e.g. glibc 2.42), `pty.node` needs that glibc and won't load on older systems. The app still works there, but falls back to `--pass`.
- Windows: the x64 prebuild is used (about 1.4 MB, no `.pdb`). The `postinstall` step (`electron-builder install-app-deps`) still recompiles native modules, so `npm install` on Windows needs Python 3 and the Visual Studio Build Tools with "Desktop development with C++" and "MSVC v143 Spectre-mitigated libs".

The "Epicbox listener in background" option is gone. The app's listeners always stop at quit, lock and logout. A listener left running by an older version is stopped at login, and a new one starts.

# Ubuntu
```
apt install libgtk-3-0 libgbm-dev
```

# Troubleshooting

## Wallet can't authenticate to node API
- Error code: 0x1645779384 - Request failed with status code 401;
- Solution: Check if your Node API secret and path to file are correct;

## Node status is not accessible
- Error code: 0x1645779384 - Request failed with status code 401;
- Solution: Check if the node api is accessible via:
    - Mainnet: http://127.0.0.1:3413/v1/status
    - Usernet: http://127.0.0.1:23413/v1/status

If the node is not accessible, you may need to either:
- Start the server;

Or, alternatively:
- Open the `epic-server.toml` file located at your Epic home path (e.g., "C:\\Users\\\<username>\\.epic\\<main\floo\user>" in Windows) and update the `api_secret_path` variable to point to the `.api_secret` file located at the custom wallet directory;
- Restart the server;

# Credits
Created and developed by eccence.digital (https://epicfundme.com/135-eccence-digital)

# Donations
Vitex Wallet EPIC Address:

vite_aaac001cda9bd8e153789edefb6dc9a99ca6c37adc122692e9
