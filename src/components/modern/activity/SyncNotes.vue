<template>
  <!-- After login: is the balance already checked against the node, and what still runs in the
       background. Always mounted: a live region that appears together with its text is often not
       announced. -->
  <p class="e-sync-notes" :class="{ 'e-is-empty': !notes.length }" role="status" aria-live="polite">
    <span v-for="note in notes" :key="note.key" class="e-sync-note">
      <span v-if="note.busy" class="e-spinner" aria-hidden="true"></span>
      <EIcon v-else name="info" size="sm" />
      {{ note.text }}
    </span>
  </p>
</template>

<script>
  import WalletSyncStatus from '@/components/layout/WalletSyncStatus.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';

  //the notes come from WalletSyncStatus's setup()
  export default reskin(WalletSyncStatus, { name: 'SyncNotes', components: { EIcon } });
</script>
