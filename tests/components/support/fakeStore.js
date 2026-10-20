/*
 * Stands in for src/store (vi.mock in setup.js): a small Vuex store per test with the state the
 * screens read and a plain setter mutation for each key, so a component's commit('x', v) shows up
 * as store.state.x. makeStore() replaces the store useStore() returns.
 */
import { createStore } from 'vuex';

let current = null;

export function baseState() {
  return {
    user: { id: 1, account: 'w1' },
    summary: { spendable: 0, unconfirmed: 0, total: 0 },
    nodeStatus: { sync_status: 'synced', tip: { height: 1000 } },
    walletSync: 'synced',
    walletListenerService: false,
    walletEpicboxService: false,
    httpListener: { state: 'off', port: 0, reason: '' },
    epicbox: { state: '', server: '', address: '', checking: '', pid: 0 },
    loginStage: '',
    nodeType: '',
    hideValues: false,
    ui: 'classic',
    scheme: 'dark',
    kernelHeights: {},
    updates: [],
  };
}

export function makeStore(state = {}) {
  const s = { ...baseState(), ...state };
  const mutations = {};
  for (const key of Object.keys(s)) mutations[key] = (st, value) => { st[key] = value; };
  //the app's "updates" list (the bell): kept, so a test can read what was added
  mutations.updates = (st, value) => { st.updates = [...st.updates, value]; };
  current = createStore({ state: s, mutations });
  return current;
}

export function useStore() {
  return current;
}

export const store = new Proxy({}, { get: (_, key) => current && current[key] });
