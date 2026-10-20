/*
 * The node address field's live check and My nodes (form/nodeserverField.vue, both interfaces):
 *  - the address is checked while it is typed (shared/nodeCheck.js createNodeChecker: ~600 ms after
 *    the last key, at once on paste), unless it is a node of the public list, which shows its own
 *    status; the address the field opens with is checked too, once the list has said it isn't one
 *    of its nodes;
 *  - My nodes (shared/myNodes.js, settings.json via configService.settings): the list under the
 *    field, the Add / Edit dialog, Use and Remove. Its entries are checked when the field opens and
 *    every few minutes while it stays open, a few at a time, with the field's cache.
 * Nothing here blocks typing or Save. Checks go through nodeService.probeNode (no api secret) and
 * only to what the user typed or saved; without it (tests, an old service) there is no live check.
 */
import { createNodeChecker, checkMany } from '@/shared/nodeCheck';
import { findNode } from '@/shared/nodeDirectory';
import { findMyNode } from '@/shared/myNodes';

//the list's entries are checked again this often while the field is open (results are cached a minute)
const LIST_EVERY_MS = 3 * 60 * 1000;
//the public list normally answers within 2.5 s (NodeDirectory); after this, check without it
const DIRECTORY_WAIT_MS = 3000;

let seq = 0;

export const myNodesField = {
  data() {
    return {
      fieldId: 'node-address-' + (++seq),
      check: { phase: 'idle', address: '', view: null },
      pasted: false,
      //the public node list: undefined until NodeDirectory has answered (null: none)
      dir: undefined,
      myNodes: [],
      myNodeViews: {},
      myNodesChecking: [],
      //{mode: 'add' | 'edit', address, label, was, error} while the dialog is open
      myNodeDialog: null,
    };
  },
  computed: {
    probe() {
      const ns = this.$nodeService;
      return ns && typeof ns.probeNode === 'function' ? (address, opts) => ns.probeNode(address, opts) : null;
    },
    checkCache() {
      return (this.$nodeService && this.$nodeService.checkCache) || null;
    },
    liveCheck() {
      return !!this.probe;
    },
    myNodesStore() {
      const s = this.configService && this.configService.settings;
      return s && typeof s.myNodes === 'function' && typeof s.addMyNode === 'function' ? s : null;
    },
    myNodesReady() {
      return !!this.myNodesStore;
    },
    myNodesNetwork() {
      return (this.configService && this.configService.defaultAccountNetwork) || 'mainnet';
    },
    inMyNodes() {
      return !!findMyNode(this.myNodes, String(this.input || ''));
    },
    canAddMyNode() {
      return !this.inMyNodes;
    },
  },
  watch: {
    input() {
      this.feedCheck();
    },
    select(v) {
      //external again: wait for the public list again (the field may be prefilled with one of its nodes)
      if (v == 'external' && this.checker) this.waitForDirectory();
      this.feedCheck();
      if (v == 'external') this.refreshMyNodes();
    },
  },
  mounted() {
    if (this.probe) {
      this.checker = createNodeChecker({
        probe: this.probe,
        ...(this.checkCache ? { cache: this.checkCache } : {}),
        onChange: (s) => {
          this.check = s;
          //a check of a saved address is that entry's status too
          if (s.phase == 'done' && s.view && findMyNode(this.myNodes, s.address)) {
            this.myNodeViews = { ...this.myNodeViews, [findMyNode(this.myNodes, s.address).address]: s.view };
          }
        },
      });
      this.waitForDirectory();
    }
    this.loadMyNodes();
    if (this.select == 'external') this.refreshMyNodes();
    this.listTimer = setInterval(() => {
      //App.vue's windowHidden(): minimized or hidden as the main process says (document.hidden isn't on every desktop)
      const root = this.$root;
      const hidden = root && typeof root.windowHidden == 'function' ? root.windowHidden() : (typeof document !== 'undefined' && document.hidden);
      if (this.select == 'external' && !hidden) this.refreshMyNodes();
    }, LIST_EVERY_MS);
  },
  beforeUnmount() {
    if (this.checker) this.checker.stop();
    if (this.listCheck) this.listCheck.abort();
    for (const c of this.oneChecks || []) c.abort();
    clearTimeout(this.dirTimer);
    clearInterval(this.listTimer);
  },
  methods: {
    /* the field's address to the checker: not while the public list may still name it, nothing for
       a node of that list (its own status shows) or the built-in node */
    feedCheck() {
      if (!this.checker) return;
      if (this.select != 'external') {
        this.checker.input('');
        return;
      }
      if (this.dir === undefined) return;
      const text = String(this.input || '');
      const immediate = this.pasted;
      this.pasted = false;
      this.checker.input(findNode(this.dir, text) ? '' : text, { immediate });
    },
    recheck() {
      if (this.checker) this.checker.recheck();
    },
    /* the check waits until NodeDirectory says which nodes are public, DIRECTORY_WAIT_MS at most */
    waitForDirectory() {
      clearTimeout(this.dirTimer);
      if (this.directoryFailed) {
        this.dir = null;
        return;
      }
      this.dir = undefined;
      this.dirTimer = setTimeout(() => this.directoryLoaded(this.dir === undefined ? null : this.dir), DIRECTORY_WAIT_MS);
    },
    directoryLoaded(dir) {
      clearTimeout(this.dirTimer);
      this.dir = dir || null;
      this.feedCheck();
    },

    loadMyNodes() {
      this.myNodes = this.myNodesStore ? this.myNodesStore.myNodes(this.myNodesNetwork) : [];
    },
    /* the entries' status, a few at a time; fresh results come from the cache */
    refreshMyNodes(only) {
      if (!this.probe || !this.myNodes.length) return;
      if (this.listCheck && !only) this.listCheck.abort();
      const ctrl = new AbortController();
      if (!only) this.listCheck = ctrl;
      else (this.oneChecks || (this.oneChecks = new Set())).add(ctrl);
      const addresses = only ? [only] : this.myNodes.map(n => n.address);
      this.myNodesChecking = [...new Set([...this.myNodesChecking, ...addresses.filter(a => !this.myNodeViews[a])])];
      checkMany(addresses, this.probe, {
        cache: this.checkCache,
        signal: ctrl.signal,
        onResult: (address, view) => {
          if (view) this.myNodeViews = { ...this.myNodeViews, [address]: view };
          this.myNodesChecking = this.myNodesChecking.filter(a => a !== address);
        },
      }).then(() => {
        if (this.oneChecks) this.oneChecks.delete(ctrl);
        if (ctrl.signal.aborted) this.myNodesChecking = this.myNodesChecking.filter(a => !addresses.includes(a));
      });
    },

    openAddMyNode() {
      //"In my nodes": nothing to add (the button stays focusable, so it isn't disabled)
      if (!this.canAddMyNode) return;
      this.myNodeDialog = { mode: 'add', address: String(this.input || '').trim(), label: '', was: '', error: '' };
    },
    openEditMyNode(n) {
      this.myNodeDialog = { mode: 'edit', address: n.address, label: n.label, was: n.address, error: '' };
    },
    saveMyNode({ address, label }) {
      const d = this.myNodeDialog;
      if (!d || !this.myNodesStore) return;
      const res = d.mode == 'edit'
        ? this.myNodesStore.updateMyNode(this.myNodesNetwork, d.was, { address, label })
        : this.myNodesStore.addMyNode(this.myNodesNetwork, { address, label });
      if (!res.ok) {
        this.myNodeDialog = { ...d, error: res.error || 'not_saved' };
        return;
      }
      this.myNodeDialog = null;
      this.loadMyNodes();
      if (!this.myNodeViews[res.entry.address]) this.refreshMyNodes(res.entry.address);
    },
    /* Use: the address goes into the field, as if typed; Save applies it, as before */
    useMyNode(n) {
      this.input = n.address;
      if (this.errors) this.errors.nodeaddress = null;
    },
    removeMyNode(n) {
      const res = this.myNodesStore ? this.myNodesStore.removeMyNode(this.myNodesNetwork, n.address) : { ok: false };
      if (res.ok) {
        this.loadMyNodes();
      } else if (this.$toast) {
        this.$toast.error(this.$t('msg.mynodes.error_not_saved'));
      }
    },
  },
};
