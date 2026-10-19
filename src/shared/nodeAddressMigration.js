/*
 * Runs the node address cleanup (shared/nodeAddress.js) once per account, on its config.json object.
 * No window or file access: the caller saves the config when `updated` is true.
 */
import { cleanNodeAddress, probeNodeAddress } from './nodeAddress.js';

//set in config.json once the saved address was cleaned up (the version of this cleanup)
export const NODE_ADDRESS_FLAG = 'node_address_checked';

/*
 * config: the account's config (changed in place); network: the account's network
 * returns {updated, change}
 *   updated  config was changed (the flag at least): save it
 *   change   {from, to, reason} when the address was changed in a way worth telling the user, else null.
 *            reason: a cleanNodeAddress reason, or 'answered' (http -> https or :3413, because only that answered)
 */
export async function migrateNodeAddress(config, {network = 'mainnet', fetch, timeoutMs = 5000} = {}){

  if(!config || typeof config !== 'object' || config[NODE_ADDRESS_FLAG]){
    return {updated: false, change: null};
  }

  const from = config.check_node_api_http_addr;
  const clean = cleanNodeAddress(from, {network});
  let to = clean.url;
  let reason = clean.reason;

  if(clean.suggest.length){
    const probe = await probeNodeAddress(clean.url, clean.suggest, {fetch, timeoutMs});
    if(probe.changed){
      to = probe.url;
      reason = 'answered';
    }
  }

  if(to !== from && typeof from === 'string'){
    config.check_node_api_http_addr = to;
  }
  config[NODE_ADDRESS_FLAG] = 1;

  //spaces, a trailing slash or letter case only: not worth a message
  const notify = typeof from === 'string' && to !== from && reason !== 'format';
  return {updated: true, change: notify ? {from, to, reason} : null};
}
