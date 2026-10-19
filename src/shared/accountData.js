/*
 * The app's own data of an account that is no longer in the wallet list: its User row (display
 * name, language, node choice, Epicbox domain) in IndexedDB, its contacts (Addressbook) and the
 * contacts linked to its transactions (AddressTransactions). Never wallet files.
 *
 * Product decision: when a wallet leaves the list, its contacts and settings go with it. Up to 6.1
 * nothing removed them, so a new wallet created under the same name took over the old display
 * name, node, Epicbox domain and contacts (matrix C2: a new "test" came up as "Tess").
 *
 * Callers must make sure the account is not in the wallet list. Never run this at startup for every
 * unlisted row: a lost or reset wallet list would then wipe all contacts.
 *
 * connection: a JsStore connection (or anything with the same select/remove calls)
 * returns the number of rows removed per table
 */
export async function removeAccountData(connection, account){
  const removed = { User: 0, Addressbook: 0, AddressTransactions: 0 };
  if(!account){
    return removed;
  }
  const users = await connection.select({ from: 'User', where: { account: account } });
  for(const user of users || []){
    if(user.id === undefined || user.id === null){
      continue;
    }
    removed.AddressTransactions += await connection.remove({ from: 'AddressTransactions', where: { user_id: user.id } }) || 0;
    removed.Addressbook += await connection.remove({ from: 'Addressbook', where: { user_id: user.id } }) || 0;
  }
  //rows last: if anything above fails the row stays, and the next attempt finds the contacts again
  removed.User = await connection.remove({ from: 'User', where: { account: account } }) || 0;
  return removed;
}

/* the account name is in the wallet list (account_dirs of ~/.epic/epic_3-0-0_config.json) */
export function isListedAccount(appConfig, account){
  return !!(appConfig && Array.isArray(appConfig.account_dirs) && appConfig.account_dirs.some(a => a && a.account == account));
}

/*
 * Before a new wallet is listed under a name (Create, Restore): drop what a removed wallet of that
 * name left behind. Does nothing when the name is still listed. Never throws: creating the wallet
 * matters more; on failure the new wallet just finds the old row, as before.
 */
export async function forgetLeftoverAccountData({ appConfig, userService, account, log = console }){
  try{
    //no readable wallet list: don't guess, delete nothing
    if(!account || !appConfig || !Array.isArray(appConfig.account_dirs) || isListedAccount(appConfig, account)){
      return null;
    }
    const removed = await userService.removeAccountData(account);
    if(removed && (removed.User || removed.Addressbook || removed.AddressTransactions)){
      log.log('account data of the removed wallet "' + account + '" deleted: ' + JSON.stringify(removed));
    }
    return removed;
  }catch(e){
    log.log('could not delete the old account data of "' + account + '": ' + (e && e.message));
    return null;
  }
}
