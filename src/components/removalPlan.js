/*
 * Removing a wallet (msg.removal.*), the logic the Classic and the Modern dialogs share: which of
 * the three choices (shared/walletRemoval.js) this wallet allows and why not, the confirmation for
 * removing everything, then configService.removeWallet and userService.removeUser.
 *
 * A screen calls openRemoval(wallet, {name, folderMissing}) and gets removalDone(result) when a
 * removal ran (it refreshes its list). The choice starts at 'list'; 'everything' is never
 * pre-selected and needs the typed name and the checkbox.
 */
import { isLoggedIn } from '@/components/wallets';

export const removalDialog = {
  data() {
    return {
      //the wallet asked about: {id, name, dataDir, configDir, folderMissing}
      removeTarget: null,
      //walletRemoval.planRemoval for it, null while checking
      removePlan: null,
      removeMode: 'list',
      removeTyped: '',
      removeAck: false,
      removeBusy: false,
      //counts openRemoval calls, so a late plan for an earlier wallet is dropped
      removeSeq: 0,
    };
  },
  computed: {
    /* the choices as the dialog lists them: {mode, label, hint, disabled, reason} */
    removeChoices() {
      const t = this.removeTarget, p = this.removePlan;
      if (!t) return [];
      const checking = !p;
      const choices = [
        { mode: 'list', label: this.$t('msg.removal.list_label'), hint: this.$t('msg.removal.list_hint'),
          disabled: checking || !p.canList, reason: p && !p.canList ? this.removeReason(p.reasons.list || { key: 'open' }) : '' },
        { mode: 'app', label: this.$t('msg.removal.app_label'),
          hint: t.folderMissing ? this.$t('msg.removal.app_hint_missing', [t.configDir]) : this.$t('msg.removal.app_hint', [t.dataDir]),
          disabled: checking || !p.canAppFiles, reason: p && !p.canAppFiles ? this.removeReason(p.reasons.appFiles) : '' },
      ];
      //the data folder is gone: nothing more to delete, so no third choice
      if (!t.folderMissing) {
        choices.push({ mode: 'everything', label: this.$t('msg.removal.all_label'), hint: p && p.canEverything ? this.$t('msg.removal.all_hint', [t.configDir]) : this.$t('msg.removal.all_hint_off'),
          disabled: checking || !p.canEverything, reason: p && !p.canEverything ? this.removeReason(p.reasons.everything) : '' });
      }
      return choices;
    },
    removeNameOk() {
      return !!this.removeTarget && this.removeTyped.trim() === this.removeTarget.name;
    },
    /* something was typed that isn't the name (yet): said next to the field */
    removeNameWrong() {
      return !!this.removeTyped.trim() && !this.removeNameOk;
    },
    /* the status line above the choices: checking, then ready (kept, so a screen reader hears the change) */
    removeStatus() {
      return this.removePlan ? this.$t('msg.removal.ready') : this.$t('msg.removal.checking');
    },
    /* the button may be pressed */
    removeReady() {
      const c = this.removeChoices.find(x => x.mode === this.removeMode);
      if (this.removeBusy || !c || c.disabled) return false;
      return this.removeMode !== 'everything' || (this.removeNameOk && this.removeAck);
    },
    removeButton() {
      return this.$t(this.removeMode === 'everything' ? 'msg.removal.button_all' : this.removeMode === 'app' ? 'msg.removal.button_app' : 'msg.removal.button_list');
    },
  },
  watch: {
    removeMode() {
      this.removeTyped = '';
      this.removeAck = false;
    },
  },
  methods: {
    /* the wallet open in this window, if any: it can't be removed */
    removeOpenId() {
      return isLoggedIn(this.$store) ? (this.configService.walletId || '') : '';
    },
    async openRemoval(wallet, { name, folderMissing = false } = {}) {
      if (!wallet || this.removeBusy) return;
      this.removeMode = 'list';
      this.removeTyped = '';
      this.removeAck = false;
      this.removePlan = null;
      const target = { id: wallet.id, name: name || wallet.id, dataDir: wallet.dataDir || '', configDir: wallet.configDir || '', folderMissing };
      this.removeTarget = target;
      //which opening this is: this.removeTarget reads back as Vue's reactive proxy, never === target
      const seq = ++this.removeSeq;
      try {
        const plan = await this.configService.removalPlan(wallet.id, { openId: this.removeOpenId(), folderMissing });
        if (seq === this.removeSeq && this.removeTarget) this.removePlan = plan;
      } catch (e) {
        //no longer listed (another screen removed it)
        if (seq === this.removeSeq && this.removeTarget) this.removePlan = { canList: false, canAppFiles: false, canEverything: false, reasons: { list: { key: 'gone' }, appFiles: { key: 'gone' }, everything: { key: 'gone' } } };
      }
    },
    closeRemoval() {
      if (this.removeBusy) return;
      this.removeSeq++;
      this.removeTarget = null;
      this.removePlan = null;
    },
    removeReason(r) {
      const key = r && r.key || 'unknown';
      const known = ['open', 'running', 'notours', 'shared', 'legacy', 'imported', 'separate', 'chain', 'missing', 'gone', 'readonly'];
      return this.$t('msg.removal.reason_' + (known.includes(key) ? key : 'unknown'), [r && r.path || '']);
    },
    async confirmRemoval() {
      const target = this.removeTarget, mode = this.removeMode;
      if (!target || !this.removeReady) return;
      this.removeBusy = true;
      let result;
      try {
        result = await this.configService.removeWallet(target.id, mode, { openId: this.removeOpenId(), folderMissing: target.folderMissing });
      } catch (e) {
        result = { ok: false, reason: 'unknown', error: e && e.message ? e.message : String(e) };
      }
      //the contacts go with the list entry (ids are never reused, so this is tidying, not safety)
      if (result.entryRemoved && mode !== 'list') {
        try {
          await this.$userService.removeUser(target.id);
        } catch (e) {
          console.log('[removal] contacts of ' + target.id + ' not removed: ' + (e && e.message ? e.message : e));
          this.$toast.warning(this.$t('msg.removal.contacts_failed'));
        }
      }
      this.removeBusy = false;
      this.removeTarget = null;
      this.removePlan = null;
      this.removalToast(target, mode, result);
      await this.removalDone(result, target);
    },
    removalToast(target, mode, r) {
      const failed = r.failed || [];
      if (!r.plan || r.reason) {
        this.$toast.error(this.$t('msg.removal.failed', [r.error || this.removeReason({ key: r.reason, path: target.configDir })]));
      } else if (failed.length) {
        this.$toast.error(r.entryRemoved
          ? this.$t('msg.removal.partial_unlisted', [failed.length, failed[0].path, r.plan.dir])
          : this.$t('msg.removal.partial_listed', [failed.length, failed[0].path]), { duration: false });
      } else if (!r.entryRemoved) {
        this.$toast.error(this.$t('msg.removal.not_saved'));
      } else {
        if (mode === 'everything' && !r.dirRemoved) {
          //a file someone else put in the folder keeps it (the folder is removed only when empty)
          this.$toast.success(this.$t('msg.removal.done_all_kept', [target.name, r.plan.dir]), { duration: false });
          return;
        }
        this.$toast.success(this.$t(mode === 'everything' ? 'msg.removal.done_all' : mode === 'app' ? 'msg.removal.done_app' : 'msg.removal.done_list', [target.name]));
      }
    },
    //override in the screen
    async removalDone() {},
  },
};
