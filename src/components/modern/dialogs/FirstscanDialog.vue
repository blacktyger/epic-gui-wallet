<template>
  <!-- The first wallet scan and its output (Classic: layout/FirstsyncModalBox.vue) -->
  <EDialog
    class="e-stg-dlg"
    :open="isActive"
    :title="$t('msg.modern.settings.firstscan_title')"
    :description="$t('msg.modern.settings.firstscan_desc')"
    @close="cancel"
  >
    <pre class="e-mono e-stg-scanout" role="log" tabindex="0" :aria-label="$t('msg.modern.settings.firstscan_log')"><span v-for="(line, i) in lines" :key="i" class="e-stg-line">{{ line }}</span></pre>
    <template #foot>
      <button type="button" class="e-btn" @click="cancel">{{ $t('msg.modern.close') }}</button>
    </template>
  </EDialog>
</template>

<script>
  import EDialog from '@/components/modern/ui/EDialog.vue';

  export default {
    name: 'FirstscanDialog',
    components: { EDialog },
    props: {
      isActive: Boolean,
      outputData: { type: Array, default: null },
    },
    emits: ['cancel', 'confirm'],
    computed: {
      lines() { return (this.outputData || []).map(line => String(line).trim()).filter(Boolean); },
    },
    methods: {
      confirm() { this.$emit('confirm'); },
      cancel() { this.$emit('cancel'); },
    },
  };
</script>
