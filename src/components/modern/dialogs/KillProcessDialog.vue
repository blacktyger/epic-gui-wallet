<template>
  <!-- Shown by configService.killEpicProcess (through the emitter) when wallet or node processes
       from an earlier run are still alive. Cancel and Close answer through window.killRunningEpicPids. -->
  <EDialog
    :open="isModalActive"
    role="alertdialog"
    icon="alert"
    tone="warn"
    :title="$t('msg.modern.unlock.busy_title')"
    :description="$t('msg.modern.unlock.busy_desc')"
    :dismissible="!isLoading"
    @update:open="onOpenChange"
  >
    <ul class="e-proc-list" :aria-label="$t('msg.modern.unlock.busy_list')">
      <li v-for="proc in processList" :key="proc.pid">
        <EIcon :name="iconOf(proc)" size="sm" />
        <span><span translate="no">{{ proc.name }}</span> <span v-if="roleOf(proc)" class="e-faint">{{ roleOf(proc) }}</span></span>
        <span class="e-mono e-faint" translate="no">{{ $t('msg.modern.unlock.pid', { pid: proc.pid }) }}</span>
      </li>
    </ul>
    <p class="e-help e-busy-note">{{ $t('msg.modern.unlock.busy_note') }}</p>
    <template #foot>
      <button type="button" class="e-btn e-btn-ghost" :disabled="isLoading" @click="cancel">{{ $t('msg.cancel') }}</button>
      <button type="button" class="e-btn e-btn-danger" :aria-disabled="isLoading ? 'true' : null" @click="confirmOnce">
        <span v-if="isLoading" class="e-spinner" aria-hidden="true"></span>
        {{ isLoading ? $t('msg.modern.unlock.busy_closing') : $t('msg.modern.unlock.busy_close') }}
      </button>
    </template>
  </EDialog>
</template>

<script>
  import KillProcessModalBox from '@/components/layout/KillProcessModalBox.vue';
  import { reskin } from '@/components/modern/reskin';
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';

  export default reskin(KillProcessModalBox, {
    components: { EDialog, EIcon },
    methods: {
      //Esc and a click on the backdrop mean Cancel
      onOpenChange(open) {
        if (!open) this.cancel();
      },
      confirmOnce() {
        if (!this.isLoading) this.confirm();
      },
      //what a process is, from its command line (display only)
      roleOf(proc) {
        const cmd = (proc && proc.cmd) || '';
        if (/owner_api|listen|scan/.test(cmd) && /epic-wallet/.test(cmd)) return this.$t('msg.modern.unlock.role_wallet');
        if (/server/.test(cmd)) return this.$t('msg.modern.unlock.role_node');
        return '';
      },
      iconOf(proc) {
        const cmd = (proc && proc.cmd) || '';
        return /epic-wallet/.test(cmd) ? 'wallet' : 'server';
      },
    },
  });
</script>
