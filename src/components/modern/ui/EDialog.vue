<template>
  <!-- A modal dialog on the native <dialog>: the page behind is inert, focus moves in and comes
       back to the opener on close, Esc closes unless it is not dismissible (e.g. while sending). -->
  <dialog
    ref="dlg"
    :class="drawer ? 'e-drawer' : 'e-dialog'"
    :role="role"
    :aria-labelledby="title ? uid + '-t' : null"
    :aria-describedby="description ? uid + '-d' : null"
    @cancel="onCancel"
    @click="onBackdrop"
  >
    <template v-if="drawer">
      <div class="e-drawer-head">
        <h2 :id="uid + '-t'" class="e-grow">{{ title }}</h2>
        <slot name="head-actions" />
        <button v-if="dismissible" type="button" class="e-icon-btn" :aria-label="$t('msg.modern.close')" @click="close"><EIcon name="close" /></button>
      </div>
      <div class="e-drawer-body"><slot /></div>
      <div v-if="$slots.foot" class="e-drawer-foot"><slot name="foot" /></div>
    </template>
    <template v-else>
      <div class="e-dialog-head" v-if="title || $slots.head">
        <div v-if="icon" class="e-glyph-sq" :class="tone ? 'e-' + tone : null"><EIcon :name="icon" /></div>
        <div class="e-grow">
          <h2 :id="uid + '-t'">{{ title }}</h2>
          <p v-if="description" :id="uid + '-d'">{{ description }}</p>
          <slot name="head" />
        </div>
      </div>
      <div class="e-dialog-body" v-if="$slots.default"><slot /></div>
      <div class="e-dialog-foot" v-if="$slots.foot"><slot name="foot" /></div>
    </template>
  </dialog>
</template>

<script>
  import EIcon from './EIcon.vue';
  let seq = 0;

  export default {
    name: 'EDialog',
    components: { EIcon },
    props: {
      open: { type: Boolean, default: false },
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      //'dialog' | 'alertdialog'
      role: { type: String, default: 'dialog' },
      dismissible: { type: Boolean, default: true },
      icon: { type: String, default: '' },
      //ok | warn | risk | gold, for the head icon
      tone: { type: String, default: '' },
      //slide in from the end edge instead of the centre
      drawer: { type: Boolean, default: false },
    },
    emits: ['update:open', 'close'],
    data() {
      return { uid: 'e-dlg-' + (++seq), opener: null };
    },
    watch: {
      open(v) { v ? this.show() : this.hide(); },
    },
    mounted() {
      if (this.open) this.show();
    },
    beforeUnmount() {
      this.hide();
    },
    methods: {
      show() {
        const d = this.$refs.dlg;
        if (!d || d.open) return;
        this.opener = document.activeElement;
        d.showModal();
      },
      hide() {
        const d = this.$refs.dlg;
        if (d && d.open) d.close();
        if (this.opener && this.opener.focus && document.contains(this.opener)) this.opener.focus();
        this.opener = null;
      },
      close() {
        this.$emit('update:open', false);
        this.$emit('close');
      },
      onCancel(e) {
        //Esc: the parent decides through v-model:open
        e.preventDefault();
        if (this.dismissible) this.close();
      },
      onBackdrop(e) {
        //a click on the backdrop lands on the <dialog> element itself
        if (e.target === this.$refs.dlg && this.dismissible) this.close();
      },
    },
  };
</script>
