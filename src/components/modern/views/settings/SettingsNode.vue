<template>
  <SettingsFrame>
    <!-- ============================================================ node (#57: its own page) -->
    <section id="stg-sec-node" class="e-set-group" aria-labelledby="stg-node-h">
      <h2 id="stg-node-h" tabindex="-1">{{ $t('msg.modern.settings.node') }}</h2>
      <div class="e-set-list">
        <!-- the node as one combobox field (mockups direction 2), its status under it -->
        <div class="e-set-row e-wide e-srv" data-test="node-row">
          <div>
            <label class="e-srv-label" for="stg-node-in">{{ $t('msg.modern.settings.node_server') }}</label>
            <!-- Settings.vue's form reads the node field through this ref -->
            <NodeCombo
              ref="nodeserverField"
              input-id="stg-node-in"
              describedby="stg-node-st"
              :saved-address="savedAddress"
              :saved-internal="savedInternal"
              :current-glyph="glyph"
              :busy="saving"
              @apply="applyNode"
            />
            <NodeStatus id="stg-node-st" @glyph="(g) => { glyph = g; }" />
          </div>
        </div>
        <!-- the built-in node uses chain data of an older app (Settings.vue resetChainData) -->
        <div v-if="chainDirInUse" class="e-set-row">
          <div>
            <b id="stg-chain-l">{{ $t('msg.chaindata.in_use_label') }}</b>
            <p>{{ $t('msg.chaindata.in_use_hint') }}</p>
            <div class="e-stg-v"><code translate="no" :title="chainDirInUse">{{ chainDirInUse }}</code></div>
          </div>
          <div v-if="!chainResetAsk" class="e-ctl">
            <button ref="chainResetButton" type="button" class="e-btn" :disabled="saving" aria-describedby="stg-chain-l" @click="askChainReset"><EIcon name="download" />{{ $t('msg.chaindata.reset') }}</button>
          </div>
          <div v-else class="e-notice e-gold e-wide-cell" role="group" aria-labelledby="stg-chain-ask">
            <EIcon name="info" />
            <div>
              <p id="stg-chain-ask">{{ $t('msg.chaindata.reset_confirm') }}</p>
              <div class="e-row e-notice-actions">
                <button type="button" class="e-btn e-btn-sm e-btn-ghost" :disabled="saving" @click="cancelChainReset">{{ $t('msg.cancel') }}</button>
                <button ref="chainResetGo" type="button" class="e-btn e-btn-sm e-btn-primary" :disabled="saving" @click="resetChainData">{{ $t('msg.chaindata.reset_go') }}</button>
              </div>
            </div>
          </div>
        </div>
        <!-- only for the built-in node: a remote node syncs on its own -->
        <div v-if="savedInternal" class="e-set-row">
          <div>
            <b id="stg-bg-l">{{ $t('msg.modern.settings.node_bg_label') }}</b>
            <p id="stg-bg-h">{{ $t('msg.modern.settings.node_bg_text') }}</p>
          </div>
          <div class="e-ctl">
            <label class="e-switch">
              <input type="checkbox" :checked="!!node_background" aria-labelledby="stg-bg-l" aria-describedby="stg-bg-h" @change="(e) => saveNodeBackground(e.target.checked)" />
              <span class="e-track"></span>
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- the built-in node switched on: older chain data found, asked once (Settings.vue offerChainData) -->
    <EDialog
      :open="!!chainOffer"
      icon="node"
      tone="gold"
      :title="$t('msg.chaindata.offer_title')"
      :description="$t('msg.chaindata.offer_lead')"
      @update:open="(v) => { if (!v) answerChainOffer('cancel'); }"
    >
      <template v-if="chainOffer">
        <dl class="e-facts e-chain-facts">
          <dt>{{ $t('msg.chaindata.offer_folder') }}</dt><dd><span class="e-mono e-chain-dir" translate="no">{{ chainOffer.chain.dir }}</span></dd>
          <dt>{{ $t('msg.chaindata.offer_size') }}</dt><dd>{{ chainOfferSize }}</dd>
          <template v-if="chainOfferDate"><dt>{{ $t('msg.chaindata.offer_modified') }}</dt><dd>{{ chainOfferDate }}</dd></template>
        </dl>
        <p v-if="chainOffer.others" class="e-chain-p e-dim">{{ $t('msg.chaindata.offer_others', [chainOffer.others]) }}</p>
        <!-- another node is running on it (shared/folderLock.js): not usable now, asked again later -->
        <p v-if="chainOffer.inUse" class="e-chain-p" role="status"><b>{{ $t('msg.chaindata.offer_in_use') }}</b></p>
        <p v-else class="e-chain-p"><b>{{ $t('msg.chaindata.offer_question') }}</b></p>
        <p class="e-chain-p e-small e-dim">{{ $t('msg.chaindata.offer_older_app') }}</p>
      </template>
      <template #foot>
        <button type="button" class="e-btn e-btn-ghost" @click="answerChainOffer('declined')">{{ $t('msg.chaindata.offer_fresh') }}</button>
        <button v-if="chainOffer && chainOffer.inUse" ref="chainOfferClose" type="button" class="e-btn e-btn-ghost" @click="answerChainOffer('cancel')">{{ $t('msg.close') }}</button>
        <button ref="chainOfferUse" type="button" class="e-btn e-btn-primary" :disabled="!!(chainOffer && chainOffer.inUse)" @click="answerChainOffer('used')"><EIcon name="check" />{{ $t('msg.chaindata.offer_use') }}</button>
      </template>
    </EDialog>
  </SettingsFrame>
</template>

<script>
  import Settings from '@/components/Settings.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import NodeCombo from '@/components/modern/form/NodeCombo.vue';
  import NodeStatus from '@/components/modern/form/NodeStatus.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';
  import { jumpTo, JUMP_EVENT } from '@/components/modern/settings/jump';

  /* Settings › Node: the node as one combobox field; a pick is saved at once (Settings.vue save: the
     node check, the chain data offer for the built-in node, the restart).
     Receiving and Appearance are their own pages (#57), so this page has no Save bar. */
  export default reskin(Settings, {
    components: { EIcon, EDialog, NodeCombo, NodeStatus, SettingsFrame },
    data() {
      return {
        glyph: 'busy',
        savedAddress: String((this.configService.config || {}).check_node_api_http_addr || ''),
        savedInternal: !!(this.store.state.user && this.store.state.user.nodeInternal),
      };
    },
    computed: {
      chain() {
        return this.configService.defaultAccountNetwork || 'mainnet';
      },
    },
    mounted() {
      //Settings.vue fills the form in its own mounted, which runs first
      this.$nextTick(() => this.jump());
      this.onJump = () => this.jump();
      window.addEventListener(JUMP_EVENT, this.onJump);
    },
    beforeUnmount() {
      window.removeEventListener(JUMP_EVENT, this.onJump);
    },
    watch: {
      '$route.hash'() { this.$nextTick(() => this.jump()); },
    },
    methods: {
      /* a sidebar link (#node): flash the section, focus its heading */
      jump() {
        if (this.$route && this.$route.hash) jumpTo(this.$route.hash);
      },
      /* a node picked in the field: saved like Settings › Save; a remote node that didn't answer keeps
         its address in the field with the reason under it */
      async applyNode() {
        const internal = this.nodeserverField.select == 'internal';
        const ok = await this.save();
        //the page is gone (Lock while the node was checked): Settings.vue saved nothing, no field to update
        if (this.leaving) return;
        if (ok !== false) {
          this.savedInternal = internal;
          this.savedAddress = String((this.configService.config || {}).check_node_api_http_addr || '');
        } else {
          //picking a remote node turned it off in the form (Settings.vue changeNodeBackgroundSetting): back to what is saved
          this.nodeInternal = this.savedInternal;
          this.node_background = !!(this.configService.config || {}).node_background;
        }
        this.$nextTick(() => this.$refs.nodeserverField.done(ok !== false));
      },
      /* Sync in background: saved at once */
      saveNodeBackground(on) {
        this.node_background = !!on;
        if (this.configService.updateConfig({ node_background: !!on }) === false) this.$toast.error(this.$t('msg.settings.error_save'));
      },
    },
  });
</script>

<style scoped>
  .e-chain-facts { font-size: var(--fs-sm); }
  .e-chain-dir { user-select: text; }
  .e-chain-p { margin-top: var(--sp-3); }
  .e-wide-cell { grid-column: 1 / -1; }
</style>
