/*
 * Runs the node address cleanup (shared/nodeAddress.js) once per account, on its config.json object.
 * No window or file access: the caller saves the config when `updated` is true.
 */
import { cleanNodeAddress, probeNodeAddress } from './nodeAddress.js';

//set in config.json once the saved address was cleaned up (the version of this cleanup)
export const NODE_ADDRESS_FLAG = 'node_address_checked';
//logins on which nothing answered (offline?): the network step is tried again, at most this often
export const NODE_ADDRESS_TRIES = 'node_address_tries';
export const MAX_TRIES = 3;

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

  let done = true;
  if(clean.suggest.length){
    const probe = await probeNodeAddress(clean.url, clean.suggest, {fetch, timeoutMs});
    if(probe.changed){
      to = probe.url;
      reason = 'answered';
    }else if(probe.reason == 'no_answer'){
      //nothing answered, not even the saved address (offline, or the node is down): keep exactly
      //what the user had, not a scheme we guessed, and try again at the next login, a few times
      if(clean.reason == 'scheme_added'){
        to = from;
        reason = '';
      }
      const tries = (parseInt(config[NODE_ADDRESS_TRIES], 10) || 0) + 1;
      config[NODE_ADDRESS_TRIES] = tries;
      done = tries >= MAX_TRIES;
    }
  }

  if(to !== from && typeof from === 'string'){
    config.check_node_api_http_addr = to;
  }
  if(done){
    config[NODE_ADDRESS_FLAG] = 1;
    delete config[NODE_ADDRESS_TRIES];
  }

  //spaces, a trailing slash or letter case only: not worth a message
  const notify = typeof from === 'string' && to !== from && reason !== 'format';
  return {updated: true, change: notify ? {from, to, reason} : null};
}
