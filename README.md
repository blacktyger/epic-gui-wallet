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
Use an Epic node **4.1.0-1 or later** (recommended). Older nodes work too as long as their public API answers: when `GET /v1/status` needs authentication (node 4.1.0, or 4.0.x with an api secret), the GUI reads the status from `POST /v2/owner get_status`, or the tip from `POST /v2/foreign get_tip` (the API epic-wallet uses), and compares that tip with a public node's to tell whether the node is synced. Only a node that answers none of these gets the "This node's version isn't compatible with this wallet." notice. The api secret is only ever sent to a node on this computer.

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
