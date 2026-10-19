<template>
  <!-- Open a wallet folder, when the picked folder isn't exactly one wallet (components/wallets.js
       walletFolder): several wallets to choose from, chain data instead of a wallet, or nothing.
       One component for both interfaces (modern: the Modern notice and wallet list). -->
  <div ref="box" :class="modern ? 'e-notice e-gold e-fpick' : 'notification is-light fpick'" role="group" :aria-labelledby="uid + '-h'" tabindex="-1">
    <EIcon v-if="modern" name="info" />
    <div :class="{ 'e-grow': modern }">
      <div class="fpick-head">
        <p :id="uid + '-h'" :class="modern ? 'e-fpick-h' : 'has-text-weight-semibold'">{{ heading }}</p>
        <!-- no wallet: what a wallet folder looks like and where older apps keep them, behind an info
             button (a toggletip: click or Enter/Space opens it, Escape or a click elsewhere closes it;
             the text is read out through the status region) -->
        <span v-if="noWallet" ref="tip" class="fpick-tip">
          <button type="button" :class="modern ? 'e-icon-btn e-sm fpick-tip-btn' : 'button is-small is-white fpick-tip-btn'"
            :aria-label="$t('msg.chaindata.folder_none_more')" :aria-expanded="tipOpen ? 'true' : 'false'" :aria-controls="uid + '-tip'"
            @click="tipOpen = !tipOpen" @keydown.esc.stop="closeTip(true)">
            <EIcon v-if="modern" name="info" size="sm" /><mdicon v-else name="information-outline" size="18" aria-hidden="true" />
          </button>
          <span :id="uid + '-tip'" role="status" :class="modern ? 'e-fpick-bubble' : 'fpick-bubble'" :hidden="!tipOpen">
            <template v-if="tipOpen">
              <span class="fpick-tip-p">{{ $t('msg.chaindata.folder_none_what') }}</span>
              <span class="fpick-tip-p">{{ $t('msg.chaindata.folder_none_where', [usualPlace]) }}</span>
            </template>
          </span>
        </span>
      </div>
      <p v-if="pick.chainOnly && pick.wallets.length">{{ $t('msg.chaindata.folder_chain_wallet') }}</p>

      <template v-if="pick.wallets.length">
        <fieldset :class="modern ? 'e-wpick e-fpick-list' : 'fpick-list'">
          <legend :class="modern ? 'e-sr-only' : 'is-sr-only'">{{ $t('msg.chaindata.folder_wallets') }}</legend>
          <div :class="{ 'e-wpick-list': modern }">
            <label v-for="w in pick.wallets" :key="w.dir" :class="{ 'radio fpick-row': !modern }" :title="w.dir">
              <input type="radio" :name="uid" :value="w.dir" v-model="choice" :aria-describedby="badge(w.network) ? uid + '-n-' + idx(w) : null" />
              <span v-if="modern" class="e-dot" aria-hidden="true"></span>
              <span :class="modern ? 'e-wpick-text' : 'fpick-text'">
                <span :class="modern ? 'e-wpick-name e-mono' : 'is-family-monospace'" translate="no">{{ w.dir }}</span>
              </span>
              <span v-if="badge(w.network)" :id="uid + '-n-' + idx(w)" :class="modern ? 'e-tag e-warn' : 'tag is-warning is-light'">{{ badge(w.network) }}</span>
            </label>
          </div>
        </fieldset>
        <div :class="modern ? 'e-row e-notice-actions e-fpick-actions' : 'buttons fpick-actions'">
          <button type="button" :class="modern ? 'e-btn e-btn-sm e-btn-primary' : 'button is-small is-primary'" :disabled="busy || !choice" @click="openChosen">{{ $t('msg.chaindata.folder_open') }}</button>
          <button type="button" :class="modern ? 'e-btn e-btn-sm' : 'button is-small'" :disabled="busy" @click="$emit('again')">{{ $t('msg.chaindata.folder_try_again') }}</button>
          <button type="button" :class="modern ? 'e-btn e-btn-sm e-btn-ghost' : 'button is-small is-text'" :disabled="busy" @click="$emit('cancel')">{{ $t('msg.cancel') }}</button>
        </div>
      </template>

      <template v-else>
        <div :class="modern ? 'e-row e-notice-actions e-fpick-actions' : 'buttons fpick-actions'">
          <button type="button" :class="modern ? 'e-btn e-btn-sm e-btn-primary' : 'button is-small is-primary'" :disabled="busy" @click="$emit('again')">{{ $t('msg.chaindata.folder_try_again') }}</button>
          <button type="button" :class="modern ? 'e-btn e-btn-sm e-btn-ghost' : 'button is-small is-text'" :disabled="busy" @click="$emit('cancel')">{{ $t('msg.cancel') }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
  import EIcon from '@/components/modern/ui/EIcon.vue';
  let seq = 0;

  export default {
    name: 'WalletFolderPick',
    components: { EIcon },
    props: {
      //{picked, wallets: [{dir, network}], chainOnly} (background.js 'pick-wallet-folder')
      pick: { type: Object, required: true },
      busy: { type: Boolean, default: false },
      modern: { type: Boolean, default: false },
    },
    emits: ['open', 'again', 'cancel'],
    data() {
      return { uid: 'fpick-' + (++seq), choice: '', tipOpen: false };
    },
    computed: {
      noWallet() {
        return !this.pick.chainOnly && !this.pick.wallets.length;
      },
      heading() {
        if (this.pick.chainOnly) return this.$t('msg.chaindata.folder_chain_only');
        if (this.pick.wallets.length) return this.$t('msg.chaindata.folder_several');
        return this.$t('msg.chaindata.folder_none', [this.pick.picked]);
      },
      /* where older apps keep wallets on this machine: ~/.epic/main, C:\Users\<you>\.epic\main */
      usualPlace() {
        const cs = this.configService;
        const epicDir = cs && cs.paths && cs.paths.legacy && cs.paths.legacy.epicDir;
        if (!epicDir) return '.epic/main';
        return cs.path ? cs.path.join(epicDir, 'main') : epicDir + '/main';
      },
    },
    watch: {
      pick: { immediate: true, handler(p) { this.choice = p && p.wallets && p.wallets[0] ? p.wallets[0].dir : ''; this.tipOpen = false; } },
    },
    mounted() {
      //the answer to the folder dialog appears here: read from its heading on
      this.$nextTick(() => { if (this.$refs.box) this.$refs.box.focus(); });
      document.addEventListener('pointerdown', this.outside, true);
      document.addEventListener('keydown', this.escape, true);
    },
    beforeUnmount() {
      document.removeEventListener('pointerdown', this.outside, true);
      document.removeEventListener('keydown', this.escape, true);
    },
    methods: {
      closeTip(refocus) {
        if (!this.tipOpen) return;
        this.tipOpen = false;
        if (refocus && this.$refs.tip) { const b = this.$refs.tip.querySelector('button'); if (b) b.focus(); }
      },
      outside(e) {
        if (this.tipOpen && this.$refs.tip && !this.$refs.tip.contains(e.target)) this.closeTip(false);
      },
      //Escape anywhere closes the open tip first (and nothing else, e.g. a dialog around it)
      escape(e) {
        if (e.key === 'Escape' && this.tipOpen) { e.stopPropagation(); this.closeTip(this.$refs.tip && this.$refs.tip.contains(document.activeElement)); }
      },
      //the network as a badge, nothing for mainnet (as wallets.js networkBadge; imported there, so not from it)
      badge(network) { return network && network !== 'mainnet' ? network.charAt(0).toUpperCase() + network.slice(1) : ''; },
      idx(w) { return this.pick.wallets.indexOf(w); },
      openChosen() {
        const w = this.pick.wallets.find(x => x.dir === this.choice);
        if (w) this.$emit('open', w);
      },
    },
  };
</script>

<style scoped>
  .fpick { margin-top: 0.75rem; }
  .fpick:focus { outline: none; }
  .fpick p { overflow-wrap: anywhere; }
  .fpick-list { border: 0; margin: 0.5rem 0; padding: 0; }
  .fpick-row { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.35rem; min-height: 32px; }
  .radio + .radio.fpick-row { margin-left: 0; }
  .fpick-text { min-width: 0; overflow-wrap: anywhere; }
  .fpick-actions { margin-top: 0.5rem; }
  .e-fpick { margin-top: var(--sp-3); }
  .e-fpick:focus { outline: none; }
  .e-fpick p { overflow-wrap: anywhere; }
  .e-fpick-h { color: var(--text); }
  .e-fpick-list { margin: var(--sp-3) 0 0; }
  .e-fpick-list .e-wpick-name { font-weight: 500; font-size: var(--fs-sm); white-space: normal; overflow-wrap: anywhere; }
  .e-fpick-actions { flex-wrap: wrap; gap: var(--sp-2); }
  .fpick-head { display: flex; align-items: flex-start; gap: 0.25rem; }
  .fpick-head > p { min-width: 0; flex: 0 1 auto; }
  .fpick-tip { position: relative; flex: none; display: inline-flex; margin-top: -4px; }
  .fpick-tip-btn { min-width: 28px; height: 28px; padding: 0 4px; }
  .fpick-tip-p { display: block; }
  .fpick-tip-p + .fpick-tip-p { margin-top: 0.4rem; }
  .fpick-bubble, .e-fpick-bubble {
    position: absolute; z-index: 20; top: calc(100% + 6px); right: -8px;
    width: max-content; max-width: min(22rem, 70vw);
    padding: 0.6rem 0.75rem; font-size: 0.8125rem; line-height: 1.4; text-align: left;
    white-space: normal; overflow-wrap: anywhere; word-break: break-word;
  }
  .fpick-bubble[hidden], .e-fpick-bubble[hidden] { display: none; }
  .fpick-bubble { background: #1b1b1f; color: #f2f2f2; border: 1px solid #3a3a40; border-radius: 6px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); }
  .e-fpick-bubble { background: var(--s3); color: var(--text); border: 1px solid var(--line-strong); border-radius: var(--r-sm); box-shadow: var(--shadow-pop); }
</style>
