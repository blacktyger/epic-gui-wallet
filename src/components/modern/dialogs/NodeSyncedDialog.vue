<template>
  <!-- The internal node finished syncing: offer to restart the app (Classic: layout/NodesyncedModalBox.vue) -->
  <EDialog
    :open="isActive"
    role="alertdialog"
    icon="server"
    tone="ok"
    :title="$t('msg.modern.settings.synced_title')"
    :description="$t('msg.modern.settings.synced_text')"
    @close="cancel"
  >
    <template #foot>
      <button type="button" class="e-btn e-btn-ghost" @click="cancel">{{ $t('msg.modern.settings.synced_later') }}</button>
      <button type="button" class="e-btn e-btn-primary" @click="confirm"><EIcon name="restart" />{{ $t('msg.modern.settings.synced_restart') }}</button>
    </template>
  </EDialog>
</template>

<script>
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';

  export default {
    name: 'NodeSyncedDialog',
    components: { EDialog, EIcon },
    props: {
      isActive: Boolean,
    },
    emits: ['cancel', 'confirm'],
    methods: {
      confirm() { this.$emit('confirm'); },
      cancel() { this.$emit('cancel'); },
    },
  };
</script>
