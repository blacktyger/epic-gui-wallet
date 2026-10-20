/*
 * A stand-in Epic node for the e2e gate: answers what the GUI and the real epic-wallet ask a node
 * for, on 127.0.0.1 inside the test sandbox (no network). Port of the RC harness' mock.py.
 *
 *   GET  /v1/status, /v1/version                 node status / version (the GUI's node checks)
 *   POST /v2/owner, /v2/foreign  (JSON-RPC 2.0)  get_status, get_tip, get_version, get_header,
 *                                                get_pmmr_indices, get_unspent_outputs, get_outputs,
 *                                                get_kernel (never found), push_transaction (refused)
 * Anything else is answered 404 / "method not found" and logged as unknown, so a new call the wallet
 * makes shows up in the run's stub-node.log instead of failing silently.
 *
 *   const node = await startStubNode({ port: 13413, height: 3100000, log: (line) => ... });
 *   node.unknown   [{path, method}] calls it had no answer for
 *   await node.close();
 *
 * Standalone: node tests/e2e/stub-node.js [port]
 */
'use strict';
const http = require('http');

const HASH = '2eb72db9505c31aac4d344c7ce4cad426e060f4f4034954187b5f77e8e4fa156';

function startStubNode({ port = 13413, host = '127.0.0.1', height = 3100000, connections = 8, log = () => {} } = {}) {
  const unknown = [];
  const counts = {};
  const tip = () => ({ height, last_block_pushed: HASH, prev_block_to_last: HASH,
    total_difficulty: { cuckatoo: 1, randomx: 1, progpow: 1, cuckaroo: 1 } });
  const status = () => ({ protocol_version: 2, user_agent: 'MW/Epic 4.1.0', connections, tip: tip(),
    sync_status: 'no_sync', supply: 0, max_supply: 21000000, blocks_to_next_halving: 480960 });
  const version = { node_version: '4.1.0', block_header_version: 6 };
  const header = () => ({ height, hash: HASH, previous: HASH, prev_root: HASH, timestamp: new Date().toISOString(),
    output_root: HASH, range_proof_root: HASH, kernel_root: HASH, nonce: 0, edge_bits: 0, cuckoo_solution: [],
    total_difficulty: 1, secondary_scaling: 0, total_kernel_offset: HASH });
  //JSON-RPC methods: (params) => result for {"Ok": result}, or {err} for {"Err": err}
  const RPC = {
    get_status: status,
    get_tip: tip,
    get_version: () => version,
    get_header: header,
    get_block: () => ({ err: 'NotFound' }),
    get_pmmr_indices: () => ({ highest_index: 0, last_retrieved_index: 0, outputs: [] }),
    get_unspent_outputs: () => ({ highest_index: 0, last_retrieved_index: 0, outputs: [] }),
    get_outputs: () => [],
    get_kernel: () => ({ err: 'NotFound' }),
    push_transaction: () => ({ err: { Internal: 'stub node: no transactions in the e2e gate' } }),
    //the node is synced and takes transactions (epic api::types::ReadyForTxs)
    ready_for_txs: () => ({ ready_for_txs: true }),
    get_peers_connected: () => [],
    get_connected_peers: () => [],
  };

  const server = http.createServer((req, res) => {
    const reply = (code, body) => {
      const data = Buffer.from(JSON.stringify(body));
      res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': data.length,
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
      res.end(data);
    };
    const path = (req.url || '').split('?')[0];
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }); return res.end(); }
    if (req.method === 'GET') {
      counts['GET ' + path] = (counts['GET ' + path] || 0) + 1;
      log(`GET ${path}`);
      if (path === '/v1/status') return reply(200, status());
      if (path === '/v1/version') return reply(200, version);
      if (path === '/v1/chain') return reply(200, { height, last_block_pushed: HASH, prev_block_to_last: HASH, total_difficulty: 1 });
      unknown.push({ path, method: 'GET' }); log(`UNKNOWN GET ${path}`);
      return reply(404, {});
    }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let rpc = {};
      try { rpc = JSON.parse(body || '{}'); } catch (e) { /* answered as unknown below */ }
      const m = rpc.method; const id = rpc.id === undefined ? 1 : rpc.id;
      counts[`POST ${path} ${m}`] = (counts[`POST ${path} ${m}`] || 0) + 1;
      log(`POST ${path} ${m}`);
      if ((path === '/v2/foreign' || path === '/v2/owner') && Object.prototype.hasOwnProperty.call(RPC, m)) {
        const r = RPC[m](rpc.params);
        if (r && typeof r === 'object' && !Array.isArray(r) && 'err' in r) return reply(200, { id, jsonrpc: '2.0', result: { Err: r.err } });
        return reply(200, { id, jsonrpc: '2.0', result: { Ok: r } });
      }
      unknown.push({ path, method: m || null }); log(`UNKNOWN POST ${path} ${m}`);
      return reply(200, { id, jsonrpc: '2.0', error: { code: -32601, message: 'stub node: no ' + m } });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve({
      port, host, url: `http://${host}:${port}`, unknown, counts,
      close: () => new Promise((r) => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); }),
    }));
  });
}

module.exports = { startStubNode };

if (require.main === module) {
  const port = Number(process.argv[2] || 13413);
  startStubNode({ port, log: (l) => console.log(new Date().toISOString().slice(11, 19), l) })
    .then((n) => console.log('stub node on ' + n.url), (e) => { console.error(e.message); process.exit(1); });
}
