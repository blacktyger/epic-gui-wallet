/*
 * epic-wallet.toml and epic-server.toml as GUI 6.1 writes them: rendered from the templates in
 * resources/ (epic-wallet.toml: epic-wallet 4.1.0's own default for mainnet; epic-server.toml) on
 * every wallet start, never patched from an old file. Plain ESM without app imports, so it runs
 * under `node --test` (tests/walletToml.test.js).
 *
 * Every value is written as a whole TOML line, `key = <value>`; strings as JSON.stringify gives
 * them, which is a valid TOML basic string ("…" with \\ \" \n \uXXXX escapes): Windows backslashes,
 * spaces, quotes and $& in a path need no special case. A key the template lacks is added to the
 * end of its section, so an edited template can't silently leave an old path in place.
 */

/* per network: what epic and epic-wallet 4.1.0 generate themselves (`epic --floonet server config`,
   `epic-wallet --usernet init`): chain_type and the default ports */
export const NETWORK_TOML = Object.freeze({
  mainnet: { walletChain: 'Mainnet', nodeChain: 'Mainnet', base: 3413, seeding: 'DNSSeed' },
  floonet: { walletChain: 'Floonet', nodeChain: 'Floonet', base: 13413, seeding: 'DNSSeed' },
  usernet: { walletChain: 'UserTesting', nodeChain: 'UserTesting', base: 23413, seeding: 'None' },
});

function net(network) {
  const n = NETWORK_TOML[network];
  if (!n) throw new Error('unknown network ' + network);
  return n;
}

/* the ports of a network: node api, node p2p, wallet listener, stratum */
export function networkPorts(network) {
  const b = net(network).base;
  return { nodeApi: b, nodeP2p: b + 1, walletListener: b + 2, stratum: b + 3 };
}

/* chain_type as epic-wallet writes it (Mainnet, Floonet, UserTesting; Usernet in some older
   tomls) → 'mainnet' | 'floonet' | 'usernet', '' when unknown */
const CHAIN_TYPES = { mainnet: 'mainnet', floonet: 'floonet', usertesting: 'usernet', usernet: 'usernet' };
export function chainTypeToNetwork(chainType) {
  return typeof chainType === 'string' && CHAIN_TYPES[chainType.trim().toLowerCase()] || '';
}

/* the network of an epic-wallet.toml's text (its chain_type), '' when none or unknown */
export function tomlNetwork(text) {
  const m = /^\s*chain_type\s*=\s*"([^"]*)"/m.exec(String(text == null ? '' : text));
  return m ? chainTypeToNetwork(m[1]) : '';
}

/* the built-in node's local API address of a network: http://127.0.0.1:<nodeApi> */
export function localNodeUrl(network) {
  return 'http://127.0.0.1:' + networkPorts(network).nodeApi;
}

/* is this node address on this machine (127.0.0.1, localhost, ::1)? Only then may a wallet send it
   the built-in node's secret */
export function isLocalNodeUrl(url) {
  try {
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(new URL(String(url)).hostname.toLowerCase());
  } catch (e) {
    return false;
  }
}

/* a value as TOML: strings through JSON.stringify, numbers and booleans as they are */
export function tomlValue(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  throw new Error('no TOML value for ' + typeof v);
}

/* dir + name with the dir's own separator (Windows paths are rendered on Windows only, but the
   tests render them on Linux) */
export function joinPath(dir, name) {
  const d = String(dir);
  const sep = /^[a-z]:\\|^\\\\/i.test(d) || (d.includes('\\') && !d.includes('/')) ? '\\' : '/';
  return d.replace(/[\\/]+$/, '') + sep + name;
}

/*
 * Set key = value in [section] of a TOML text (sections as `[name]` header lines, '' = before
 * the first header). Only real assignments count: a commented `#key = …` is left alone.
 */
export function setTomlKeys(text, section, values) {
  const lines = String(text).split(/\r?\n/);
  const header = /^\s*\[([^\]]+)\]\s*(#.*)?$/;
  let current = '', start = section === '' ? 0 : -1, end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const m = header.exec(lines[i]);
    if (!m) continue;
    if (start >= 0 && current === section) { end = i; break; }
    current = m[1].trim();
    if (current === section) start = i + 1;
  }
  if (start < 0) {
    //no such section: append it
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push('[' + section + ']');
    start = end = lines.length;
  }
  const missing = [];
  for (const [key, value] of Object.entries(values)) {
    const re = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=');
    const line = key + ' = ' + tomlValue(value);
    const i = lines.slice(start, end).findIndex(l => re.test(l));
    if (i >= 0) lines[start + i] = line;
    else missing.push(line);
  }
  if (missing.length) {
    //after the section's last non-empty line
    let at = end;
    while (at > start && lines[at - 1].trim() === '') at--;
    lines.splice(at, 0, ...missing);
  }
  return lines.join('\n');
}

/*
 * The wallet's epic-wallet.toml.
 *   configDir: 6.1's folder of this wallet (secrets, log, Tor send config)
 *   dataDir: the folder holding wallet_data (== configDir for wallets made in 6.1)
 *   nodeUrl: check_node_api_http_addr; nodeApiSecretPath: the built-in node's .api_secret, or
 *   empty for none (no node_api_secret_path in the toml)
 */
export function renderWalletToml({ template, network, configDir, dataDir, nodeUrl, nodeApiSecretPath, epicboxDomain }) {
  const n = net(network);
  if (!configDir || !dataDir) throw new Error('wallet toml needs configDir and dataDir');
  const ports = networkPorts(network);
  let t = setTomlKeys(template, 'wallet', {
    chain_type: n.walletChain,
    api_listen_port: ports.walletListener,
    api_secret_path: joinPath(configDir, '.owner_api_secret'),
    check_node_api_http_addr: nodeUrl || 'http://127.0.0.1:' + ports.nodeApi,
    //the GUI reaches the foreign API (receive_tx) through the owner API's port
    owner_api_include_foreign: true,
    data_file_dir: joinPath(dataDir, 'wallet_data'),
  });
  //only the built-in node has a secret. With the key absent epic-wallet reads node_api_secret_path
  //as None and sends no Authorization header (a path is sent as Basic auth on every node call)
  if (nodeApiSecretPath) t = setTomlKeys(t, 'wallet', { node_api_secret_path: nodeApiSecretPath });
  else t = t.replace(/^[ \t]*node_api_secret_path[ \t]*=.*(\r?\n|$)/gm, '');
  t = setTomlKeys(t, 'tor', { send_config_dir: configDir });
  t = setTomlKeys(t, 'epicbox', { epicbox_domain: epicboxDomain || 'epicbox.epiccash.com', epicbox_port: 443 });
  //the GUI reads the wallet's stdout (start, listener and Epicbox messages)
  t = setTomlKeys(t, 'logging', { stdout_log_level: 'Debug', log_file_path: joinPath(configDir, 'epic-wallet.log') });
  return t;
}

/*
 * The built-in node's epic-server.toml, all paths absolute: node 4.1.0-1 does not create a
 * relative .api_secret, and db_root may be an older wallet's chain_data reused in place.
 */
export function renderNodeToml({ template, network, nodeDir, chainDir, foundationPath, apiSecretPath }) {
  const n = net(network);
  if (!nodeDir) throw new Error('node toml needs nodeDir');
  const ports = networkPorts(network);
  let t = setTomlKeys(template, 'server', {
    db_root: chainDir || joinPath(nodeDir, 'chain_data'),
    api_http_addr: '127.0.0.1:' + ports.nodeApi,
    api_secret_path: apiSecretPath || joinPath(nodeDir, '.api_secret'),
    foundation_path: foundationPath || joinPath(nodeDir, 'foundation.json'),
    chain_type: n.nodeChain,
    skip_pow_validation: true,
    run_tui: false,
  });
  t = setTomlKeys(t, 'server.p2p_config', { port: ports.nodeP2p, seeding_type: n.seeding });
  t = setTomlKeys(t, 'server.stratum_mining_config', {
    stratum_server_addr: '127.0.0.1:' + ports.stratum,
    wallet_listener_url: 'http://127.0.0.1:' + ports.walletListener,
  });
  t = setTomlKeys(t, 'logging', { stdout_log_level: 'Debug', log_file_path: joinPath(nodeDir, 'epic-server.log') });
  return t;
}

/*
 * WALLET.txt in a wallet's 6.1 folder (<root>/wallets/<id>): tells someone browsing the folders
 * which wallet wN is. Informational only; the app never reads it. eol: '\r\n' on Windows, so
 * any editor shows the lines.
 */
export const WALLET_MARKER = 'WALLET.txt';

export function walletMarkerText({ id, label, network, createdAt, dataDir, configDir, importedFrom }, eol = '\n') {
  const day = typeof createdAt === 'string' && /^\d{4}-\d\d-\d\d/.test(createdAt) ? createdAt.slice(0, 10) : '';
  //one line: no line breaks from a label can make it look like more
  const one = (s) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ');
  const lines = [
    'Epic Wallet: ' + (one(label) || '(no label)') + ' · ' + one(network) + (day ? ' · created ' + day : '') + ' · data: ' + one(dataDir),
    '',
    'Wallet id: ' + one(id),
    'Wallet data (the seed is in wallet_data): ' + one(dataDir),
    ...(configDir && configDir !== dataDir ? ['Settings of this wallet in Epic Wallet 6.1: ' + one(configDir)] : []),
    ...(importedFrom && importedFrom.dir ? ['Imported from an older Epic Wallet' + (importedFrom.app ? ' (' + one(importedFrom.app) + ')' : '') + '.'] : []),
    '',
    'This file is only for you: Epic Wallet writes it and never reads it.',
  ];
  return lines.join(eol) + eol;
}
