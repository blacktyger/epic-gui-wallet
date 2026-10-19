/*
 * What the Setup Assistant shows first for an account, from its saved config.json and its
 * app-database row. Older GUIs left values the assistant used to get wrong (matrix runs):
 *  - locale 'ru' or 'zh' (no longer offered): the language list showed blank and saving failed
 *    with "Null value is not allowed for column 'language'"
 *  - a remote node saved in config.json but no row (or no nodeInternal in it): the node step
 *    preselected the built-in node, and the saved address showed only after switching
 *  - no epicbox_domain key (configs up to 4.0.x): the field was empty, and saving it turned
 *    Epicbox off without the user ever choosing that
 * Pure functions, no window access, so they are unit-tested (tests/setupDefaults.test.js).
 */

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

export function isLocalNodeAddress(address){
  const a = String(address || '').trim();
  if(!a){
    return true;
  }
  try{
    return LOCAL_HOSTS.includes(new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(a) ? a : 'http://' + a).hostname);
  }catch(e){
    return false;
  }
}

/* a locale the app offers, else English */
export function supportedLocale(locale, langs){
  return locale && Object.prototype.hasOwnProperty.call(langs || {}, locale) ? locale : 'en';
}

/* {select: 'internal'|'external', input: address shown for external} */
export function initialNodeChoice({ user, address } = {}){
  const saved = String(address || '').trim();
  //the row says what the user chose, when it says it at all
  if(user && typeof user.nodeInternal === 'boolean'){
    return user.nodeInternal ? { select: 'internal', input: '' } : { select: 'external', input: saved };
  }
  return isLocalNodeAddress(saved) ? { select: 'internal', input: '' } : { select: 'external', input: saved };
}

//Epicbox domains of older GUIs that are gone; the wallet toml is already rewritten to the current one
const RETIRED_EPICBOX_DOMAINS = ['epicbox.epic.tech'];

/* a saved Epicbox domain, with a retired one replaced by the default */
export function currentEpicboxDomain(domain, defaultDomain){
  return typeof domain === 'string' && RETIRED_EPICBOX_DOMAINS.includes(domain.trim().toLowerCase()) ? defaultDomain : domain;
}

/* the Epicbox domain to prefill: a saved one, '' only when the user turned it off, else the default */
export function initialEpicboxDomain({ config, defaultDomain } = {}){
  const saved = config ? currentEpicboxDomain(config.epicbox_domain, defaultDomain) : undefined;
  if(typeof saved === 'string' && saved.trim()){
    return saved.trim();
  }
  //'' is only ever written by a Setup Assistant the user went through with config version 5.0.4 or later
  if(saved === '' && config && config.firstTime === false && config.version && !isOlderThan(config.version, '5.0.4')){
    return '';
  }
  return defaultDomain;
}

function isOlderThan(version, than){
  const a = String(version).split('.').map(n => parseInt(n, 10) || 0);
  const b = String(than).split('.').map(n => parseInt(n, 10) || 0);
  for(let i = 0; i < Math.max(a.length, b.length); i++){
    if((a[i] || 0) != (b[i] || 0)){
      return (a[i] || 0) < (b[i] || 0);
    }
  }
  return false;
}
