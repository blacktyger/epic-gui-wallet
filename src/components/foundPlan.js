/*
 * What the found screen (Found.vue, and its Modern reskin FoundView.vue) does with the user's
 * answer. Pure, no Vue and no settings, so tests/foundPlan.test.js checks it directly.
 *
 *   'use'    (Use selected wallets): import the ticked wallets (never chain data: that is node data,
 *            offered once in Settings when the built-in node is switched on, shared/chainOffer.js);
 *            the unticked ones are left undecided (no markFresh), so Settings › Add another
 *            wallet › Import from an older Epic Wallet lists them again.
 *   'notNow' (Not now): nothing is imported, marked or set; only the first-start scan is recorded.
 *
 * markScanned is the number of wallets found, and only on the first start (from Welcome or
 * Settings the scan was already recorded); null = don't call it.
 */

/* the keys of the ticked wallets, in the order the screen lists them */
export function checkedKeys(wallets, checked) {
  return (Array.isArray(wallets) ? wallets : []).filter(w => checked && checked[w.key] === true).map(w => w.key);
}

/* every wallet found starts ticked */
export function initialChecked(wallets) {
  const out = {};
  (Array.isArray(wallets) ? wallets : []).forEach(w => { out[w.key] = true; });
  return out;
}

/* the primary button works: at least one wallet ticked */
export function canUse({ wallets = [], checked = {} } = {}) {
  return checkedKeys(wallets, checked).length > 0;
}

/*
 * action: 'use' | 'notNow'. Returns null when 'use' can't run (nothing ticked), else
 * {importKeys, markScanned: number | null}.
 */
export function foundPlan(action, { wallets = [], checked = {}, firstRun = false } = {}) {
  const markScanned = firstRun ? wallets.length : null;
  if (action === 'notNow') {
    return { importKeys: [], markScanned };
  }
  if (action !== 'use') throw new Error('unknown action: ' + action);
  if (!canUse({ wallets, checked })) return null;
  return { importKeys: checkedKeys(wallets, checked), markScanned };
}

/* where Not now (and Continue with nothing imported) goes: back to Settings when it came from
   there, else Welcome when there is no wallet yet (or it came from Welcome), else Unlock */
export function backRoute(from, hasWallets) {
  if (from === 'settings') return 'account';
  if (from === 'new' || !hasWallets) return 'new';
  return 'login';
}
