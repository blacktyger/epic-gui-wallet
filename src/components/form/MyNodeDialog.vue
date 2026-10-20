<template>
  <!-- Add to my nodes / Edit (Classic): a native modal <dialog>, so the page behind is inert and
       focus stays inside; Esc and the backdrop close it. Modern: modern/form/MyNodeDialog.vue -->
  <dialog ref="dlg" class="my-node-dialog" :aria-labelledby="uid + '-t'" :aria-describedby="uid + '-d'" @cancel.prevent="close" @click="onBackdrop">
    <form class="modal-card" novalidate @submit.prevent="save">
      <header class="modal-card-head"><p :id="uid + '-t'" class="modal-card-title">{{ title }}</p></header>
      <section class="modal-card-body">
        <p :id="uid + '-d'" class="help my-node-lead">{{ $t('msg.mynodes.dialog_desc') }}</p>
        <div class="field">
          <label class="label" :for="uid + '-a'">{{ $t('msg.mynodes.address') }}</label>
          <div class="control">
            <input :id="uid + '-a'" ref="addressInput" class="input" type="text" v-model="address" spellcheck="false" autocomplete="off" translate="no"
              :aria-invalid="addressProblem ? 'true' : null" :aria-describedby="addressProblem ? uid + '-e' : null" @paste="pasted = true" />
          </div>
          <p v-if="addressProblem" :id="uid + '-e'" class="help is-danger">{{ addressProblem }}</p>
          <NodeCheckStatus v-else :state="check" short />
        </div>
        <div class="field">
          <label class="label" :for="uid + '-l'">{{ $t('msg.mynodes.label') }} <span class="my-node-opt">{{ $t('msg.mynodes.label_optional') }}</span></label>
          <div class="control">
            <input :id="uid + '-l'" class="input" type="text" v-model="label" :maxlength="labelMax" autocomplete="off" :placeholder="$t('msg.mynodes.label_ph')" />
          </div>
        </div>
        <p v-if="saveProblem" class="help is-danger" role="alert">{{ saveProblem }}</p>
      </section>
      <footer class="modal-card-foot">
        <button type="button" class="button" @click="close">{{ $t('msg.cancel') }}</button>
        <button type="submit" class="button is-primary" :disabled="!canSave">{{ $t('msg.save') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<script>
  import NodeCheckStatus from '@/components/form/NodeCheckStatus.vue';
  import { createNodeChecker } from '@/shared/nodeCheck';
  import { nodeCheckAddress, nodeFieldAddress, nodeAddressKey } from '@/shared/nodeAddress';
  import { findMyNode, NODE_LABEL_MAX } from '@/shared/myNodes';

  let seq = 0;

  /*
   * mode 'add' | 'edit'; address, label: the prefilled values; was: the address of the entry being
   * edited; nodes: the list (for the duplicate note); error: why the last save was refused
   * ('duplicate' | 'invalid' | 'full' | 'not_saved', from settingsStore); probe(address, {signal}) and
   * cache: the live check (nodeService.probeNode / checkCache), none in tests that don't need it.
   * The check never blocks saving: an offline or wrong address can be saved.
   * Emits save({address, label}) and close.
   */
  export default {
    name: 'MyNodeDialog',
    components: { NodeCheckStatus },
    props: {
      mode: { type: String, default: 'add' },
      initialAddress: { type: String, default: '' },
      initialLabel: { type: String, default: '' },
      was: { type: String, default: '' },
      nodes: { type: Array, default: () => [] },
      error: { type: String, default: '' },
      probe: { type: Function, default: null },
      cache: { type: Object, default: null },
    },
    emits: ['save', 'close'],
    data() {
      return {
        uid: 'my-node-dlg-' + (++seq),
        address: this.initialAddress,
        label: this.initialLabel,
        check: { phase: 'idle', address: '', view: null },
        pasted: false,
        tried: false,
        labelMax: NODE_LABEL_MAX,
      };
    },
    computed: {
      title() {
        return this.mode === 'edit' ? this.$t('msg.mynodes.edit_title') : this.$t('msg.mynodes.add_title');
      },
      duplicate() {
        const hit = findMyNode(this.nodes, this.address);
        return hit && nodeAddressKey(hit.address) !== nodeAddressKey(this.was) ? hit : null;
      },
      valid() {
        return !!nodeCheckAddress(this.address);
      },
      addressProblem() {
        if (this.duplicate) {
          return this.duplicate.label
            ? this.$t('msg.mynodes.duplicate_named', { name: this.duplicate.label })
            : this.$t('msg.mynodes.duplicate');
        }
        //a half-typed address is not an error yet: only once Save was tried, or when it can't be one
        if (!this.valid && (this.tried || (this.address.trim() && /\s|@/.test(this.address.trim())))) {
          return this.$t('msg.mynodes.invalid');
        }
        return '';
      },
      saveProblem() {
        if (!this.error || this.error === 'duplicate' || this.error === 'invalid') return '';
        return this.$t('msg.mynodes.error_' + this.error, { n: 50 });
      },
      canSave() {
        return !this.duplicate && (this.valid || !this.tried);
      },
    },
    watch: {
      address(v) {
        const immediate = this.pasted;
        this.pasted = false;
        if (this.checker) this.checker.input(v, { immediate });
      },
    },
    mounted() {
      if (this.probe) {
        this.checker = createNodeChecker({
          probe: this.probe,
          ...(this.cache ? { cache: this.cache } : {}),
          onChange: (s) => { this.check = s; },
        });
        //prefilled: checked at once (usually a result the field already has)
        this.checker.input(this.address, { immediate: true });
      }
      this.showDialog();
    },
    beforeUnmount() {
      if (this.checker) this.checker.stop();
      const d = this.$refs.dlg;
      if (d && d.open) d.close();
    },
    methods: {
      showDialog() {
        const d = this.$refs.dlg;
        if (d && d.showModal && !d.open) d.showModal();
        this.$nextTick(() => { const el = this.$refs.addressInput; if (el && el.focus) el.focus(); });
      },
      save() {
        this.tried = true;
        if (!this.valid || this.duplicate) return;
        this.$emit('save', { address: nodeFieldAddress(this.address), label: this.label });
      },
      close() {
        this.$emit('close');
      },
      onBackdrop(e) {
        if (e.target === this.$refs.dlg) this.close();
      },
    },
  };
</script>

<style scoped>
  .my-node-dialog { padding: 0; border: 0; background: transparent; width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: visible; }
  .my-node-dialog::backdrop { background: rgba(10, 10, 10, 0.86); }
  .my-node-dialog .modal-card { width: 100%; max-height: calc(100vh - 32px); margin: 0; }
  .my-node-dialog .modal-card-title { flex-shrink: 1; overflow-wrap: anywhere; }
  .my-node-dialog .modal-card-foot { flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
  .my-node-dialog .modal-card-foot .button { margin: 0; }
  .my-node-lead { margin-bottom: 1rem; }
  .my-node-opt { font-weight: 400; opacity: 0.7; }
</style>
