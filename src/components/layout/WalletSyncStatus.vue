<template>
  <!-- after login: is the balance shown already checked against the node, and what still runs in the background -->
  <!-- always mounted: a live region that appears together with its text is often not announced -->
  <p class="wallet-sync-status is-size-7" :class="{'is-empty': !notes.length}" role="status" aria-live="polite">
    <span v-for="note in notes" :key="note.key" class="wallet-sync-note">
      <span v-if="note.busy" class="wallet-sync-spinner" aria-hidden="true"></span>
      <mdicon v-else name="information-outline" size="14" aria-hidden="true" />
      {{ note.text }}
    </span>
  </p>
</template>

<script>
  import { computed } from 'vue';
  import { useStore } from '@/store';
  import { useI18n } from 'vue-i18n';

  export default {
    name: 'WalletSyncStatus',
    setup(){
      const store = useStore();
      const { t } = useI18n();

      const notes = computed(() => {
        const list = [];
        const sync = store.state.walletSync;
        const node = store.state.nodeStatus || {};
        if(sync == 'loading'){
          list.push({key: 'balance', busy: true, text: node.sync_status == 'synced' ? t('msg.app.balance_updating') : t('msg.app.balance_loading')});
        }else if(sync == 'local'){
          //read from the wallet only: the node is unreachable or still syncing
          //node synced but the wallet's refresh still failed: the wallet can't use the node (e.g. its api secret)
          const text = node.error ? t('msg.app.balance_node_unreachable')
            : (node.sync_status == 'synced' ? t('msg.app.balance_wallet_no_node') : t('msg.app.balance_waiting_node'));
          list.push({key: 'balance', busy: !node.error && node.sync_status != 'synced', text: text});
        }else if(sync == 'error'){
          list.push({key: 'balance', busy: false, text: t('msg.app.wallet_api_unreachable')});
        }
        if(store.state.listenerStarting){
          list.push({key: 'listener', busy: true, text: t('msg.app.listener_starting')});
        }
        return list;
      });

      return { notes };
    },
  }
</script>

<style scoped>
  .wallet-sync-status {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin-top: 0.35rem;
    /* wrap the notes instead of widening the header, which would push the node panel off screen */
    max-width: 20rem;
    opacity: 0.85;
  }
  .wallet-sync-status.is-empty {
    margin: 0;
  }
  .wallet-sync-note {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .wallet-sync-spinner {
    width: 11px;
    height: 11px;
    border: 2px solid rgba(209, 153, 68, 0.3);
    border-top-color: #d19944;
    border-radius: 50%;
    animation: wallet-sync-spin 0.8s linear infinite;
    flex: none;
  }
  @keyframes wallet-sync-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .wallet-sync-spinner {
      animation: none;
      border-color: #d19944;
      border-style: dotted;
    }
  }
</style>
