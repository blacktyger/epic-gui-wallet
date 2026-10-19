/*
 * What the found screen (Found.vue, and its Modern reskin FoundView.vue) does with the user's
 * answer. Pure, no Vue and no settings, so tests/foundPlan.test.js checks it directly.
 *
 *   'use'    (Use selected wallets): import the ticked wallets; reuse the chain data when ticked;
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

/* the chain data to offer: mainnet first, then the largest */
export function pickChain(chains) {
  const list = (Array.isArray(chains) ? chains : []).slice();
  list.sort((a, b) => (a.network === 'mainnet' ? 0 : 1) - (b.network === 'mainnet' ? 0 : 1) || (b.bytes || 0) - (a.bytes || 0));
  return list[0] || null;
}

/* the primary button works: at least one wallet ticked (or, with no wallets, chain data to reuse) */
export function canUse({ wallets = [], checked = {}, chain = null } = {}) {
  if (wallets.length) return checkedKeys(wallets, checked).length > 0;
  return !!chain;
}

/*
 * action: 'use' | 'notNow'. Returns null when 'use' can't run (nothing ticked), else
 * {importKeys, reuseChain, chainDir: {network, dir} | null, markScanned: number | null}.
 */
export function foundPlan(action, { wallets = [], checked = {}, chain = null, reuseChain = false, firstRun = false } = {}) {
  const markScanned = firstRun ? wallets.length : null;
  if (action === 'notNow') {
    return { importKeys: [], reuseChain: false, chainDir: null, markScanned };
  }
  if (action !== 'use') throw new Error('unknown action: ' + action);
  if (!canUse({ wallets, checked, chain })) return null;
  const reuse = !!(chain && reuseChain);
  return {
    importKeys: checkedKeys(wallets, checked),
    reuseChain: reuse,
    chainDir: reuse ? { network: chain.network, dir: chain.dir } : null,
    markScanned,
  };
}

/* where Not now (and Continue with nothing imported) goes: back to Settings when it came from
   there, else Welcome when there is no wallet yet (or it came from Welcome), else Unlock */
export function backRoute(from, hasWallets) {
  if (from === 'settings') return 'account';
  if (from === 'new' || !hasWallets) return 'new';
  return 'login';
}
