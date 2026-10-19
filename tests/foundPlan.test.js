// Tests for src/components/foundPlan.js, the found screen's decisions: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkedKeys, initialChecked, pickChain, canUse, foundPlan, backRoute } from '../src/components/foundPlan.js';

const alpha = { key: '/h/.epic/alpha/main', network: 'mainnet' };
const beta = { key: '/h/My Wallets/beta/floo', network: 'floonet' };
const wallets = [alpha, beta];
const chain = { dir: '/h/.epic/alpha/main/chain_data', network: 'mainnet', bytes: 10 };

test('every wallet found starts ticked, and Use imports all of them', () => {
  const checked = initialChecked(wallets);
  assert.deepEqual(checked, { [alpha.key]: true, [beta.key]: true });
  assert.equal(canUse({ wallets, checked }), true);
  const plan = foundPlan('use', { wallets, checked, firstRun: true });
  assert.deepEqual(plan.importKeys, [alpha.key, beta.key]);
  assert.equal(plan.markScanned, 2);
});

test('unticking one imports only the ticked ones; the unticked one is untouched (no fresh mark)', () => {
  const checked = { ...initialChecked(wallets), [beta.key]: false };
  const plan = foundPlan('use', { wallets, checked, firstRun: true });
  assert.deepEqual(plan.importKeys, [alpha.key]);
  assert.equal('markFresh' in plan, false);
  //the screen still counts both as found, so it doesn't come back at the next start
  assert.equal(plan.markScanned, 2);
});

test('nothing ticked: the button is disabled and Use does nothing', () => {
  const checked = { [alpha.key]: false, [beta.key]: false };
  assert.equal(canUse({ wallets, checked, chain }), false);
  assert.equal(foundPlan('use', { wallets, checked, chain, reuseChain: true, firstRun: true }), null);
  assert.deepEqual(checkedKeys(wallets, checked), []);
});

test('Not now: no imports, no chain data, only markScanned on the first start', () => {
  const checked = initialChecked(wallets);
  assert.deepEqual(foundPlan('notNow', { wallets, checked, chain, reuseChain: true, firstRun: true }),
    { importKeys: [], reuseChain: false, chainDir: null, markScanned: 2 });
  //from Settings or Welcome the scan was recorded already
  assert.equal(foundPlan('notNow', { wallets, checked, chain, reuseChain: true, firstRun: false }).markScanned, null);
});

test('chain reuse applies only with Use, and only when ticked', () => {
  const checked = initialChecked(wallets);
  const on = foundPlan('use', { wallets, checked, chain, reuseChain: true });
  assert.equal(on.reuseChain, true);
  assert.deepEqual(on.chainDir, { network: 'mainnet', dir: chain.dir });
  const off = foundPlan('use', { wallets, checked, chain, reuseChain: false });
  assert.equal(off.reuseChain, false);
  assert.equal(off.chainDir, null);
  const none = foundPlan('use', { wallets, checked, chain: null, reuseChain: true });
  assert.equal(none.reuseChain, false);
  assert.equal(foundPlan('notNow', { wallets, checked, chain, reuseChain: true }).chainDir, null);
});

test('only chain data found: Use reuses it, with nothing to import', () => {
  assert.equal(canUse({ wallets: [], checked: {}, chain }), true);
  const plan = foundPlan('use', { wallets: [], checked: {}, chain, reuseChain: true, firstRun: true });
  assert.deepEqual(plan.importKeys, []);
  assert.deepEqual(plan.chainDir, { network: 'mainnet', dir: chain.dir });
  assert.equal(plan.markScanned, 0);
});

test('checked keys keep the list order and ignore keys not listed', () => {
  assert.deepEqual(checkedKeys(wallets, { [beta.key]: true, [alpha.key]: true, '/other': true }), [alpha.key, beta.key]);
  assert.deepEqual(checkedKeys(null, null), []);
});

test('the chain offered: mainnet first, then the largest', () => {
  assert.equal(pickChain([]), null);
  const floo = { dir: '/f', network: 'floonet', bytes: 99 };
  const small = { dir: '/s', network: 'mainnet', bytes: 1 };
  const big = { dir: '/b', network: 'mainnet', bytes: 5 };
  assert.equal(pickChain([floo, small, big]).dir, '/b');
  assert.equal(pickChain([floo]).dir, '/f');
});

test('Not now goes back to Settings when it came from there, else Welcome', () => {
  assert.equal(backRoute('settings', true), 'account');
  assert.equal(backRoute('', false), 'new');
  assert.equal(backRoute('new', true), 'new');
  assert.equal(backRoute('', true), 'login');
});

test('an unknown action throws', () => {
  assert.throws(() => foundPlan('fresh', { wallets }), /unknown action/);
});
