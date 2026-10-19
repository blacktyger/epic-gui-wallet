// Tests for src/components/foundPlan.js, the found screen's decisions: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as plan from '../src/components/foundPlan.js';

const { checkedKeys, initialChecked, canUse, foundPlan, backRoute } = plan;

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
  assert.equal(canUse({ wallets, checked }), false);
  assert.equal(foundPlan('use', { wallets, checked, firstRun: true }), null);
  assert.deepEqual(checkedKeys(wallets, checked), []);
});

test('Not now: no imports, only markScanned on the first start', () => {
  const checked = initialChecked(wallets);
  assert.deepEqual(foundPlan('notNow', { wallets, checked, firstRun: true }), { importKeys: [], markScanned: 2 });
  //from Settings or Welcome the scan was recorded already
  assert.equal(foundPlan('notNow', { wallets, checked, firstRun: false }).markScanned, null);
});

test('chain data is never part of the found screen: Use imports wallets only', () => {
  //chain data is node data, offered once in Settings (shared/chainOffer.js); an old app's chain_data
  //may be junk (a 44 KB ~/.epic/user/chain_data) or belong to a wallet that used an external node
  const checked = initialChecked(wallets);
  const p = foundPlan('use', { wallets, checked, chain, reuseChain: true, firstRun: true });
  assert.deepEqual(p, { importKeys: [alpha.key, beta.key], markScanned: 2 });
  assert.equal('pickChain' in plan, false);
});

test('only chain data found, no wallets: nothing to use', () => {
  assert.equal(canUse({ wallets: [], checked: {}, chain }), false);
  assert.equal(foundPlan('use', { wallets: [], checked: {}, chain, reuseChain: true, firstRun: true }), null);
});

test('checked keys keep the list order and ignore keys not listed', () => {
  assert.deepEqual(checkedKeys(wallets, { [beta.key]: true, [alpha.key]: true, '/other': true }), [alpha.key, beta.key]);
  assert.deepEqual(checkedKeys(null, null), []);
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
