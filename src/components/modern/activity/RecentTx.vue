<template>
  <!-- Overview: the five newest transactions. A reskin of Transaction.vue for its state and
       helpers (txState, locale, heights); the list on this page is display only. -->
  <section aria-labelledby="ov-recent-h">
    <div class="e-section-head">
      <h2 id="ov-recent-h">{{ $t('msg.modern.overview.recent') }}</h2>
      <div class="e-right">
        <router-link v-if="total_txs.length" to="/activity" class="e-small">{{ $t('msg.modern.overview.view_all', { n: total_txs.length }) }}</router-link>
      </div>
    </div>

    <div v-if="recent.length" class="e-panel">
      <ul class="e-txlist" :aria-label="$t('msg.modern.overview.recent_label')">
        <li v-for="tx in recent" :key="tx.id">
          <router-link to="/activity" class="e-tx e-compact e-tx-link">
            <span class="e-tx-ico" :class="tx.status == 'cancelled' ? 'e-off' : (isSent(tx) ? 'e-out' : 'e-in')"><EIcon :name="iconOf(tx)" /></span>
            <span class="e-tx-who">
              <b :class="{ 'e-addr-inline': whoOf(tx).addr, 'e-hide': whoOf(tx).addr }" translate="no">{{ whoOf(tx).text }}</b>
              <small class="e-tx-meta">
                <TxRing v-if="statusOf(tx).ring" class="e-sm" :state="statusOf(tx).ring.state" :confirmations="statusOf(tx).ring.confirmations" />
                <EIcon v-else-if="statusOf(tx).icon" :name="statusOf(tx).icon" size="sm" />
                <span :class="statusOf(tx).tone ? 'e-' + statusOf(tx).tone : null">{{ statusOf(tx).text }}</span>
              </small>
            </span>
            <span class="e-tx-amt" :class="{ 'e-in': !isSent(tx) && tx.status != 'cancelled', 'e-off': tx.status == 'cancelled' }">
              <MoneyText :value="amountOf(tx)" :decimals="decFor(amountOf(tx))" :sign="'always'" />
              <small>{{ compactTime(tx) }}</small>
            </span>
          </router-link>
        </li>
      </ul>
    </div>

    <div v-else-if="store.state.walletSync == 'loading'" class="e-panel">
      <p class="e-ov-loading" role="status"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.modern.overview.loading') }}</p>
    </div>

    <div v-else class="e-panel">
      <div class="e-empty">
        <div class="e-glyph"><EIcon name="receive" /></div>
        <h3>{{ $t('msg.modern.overview.none_title') }}</h3>
        <p>{{ $t('msg.modern.overview.none_text', { n: minConfirmations }) }}</p>
        <div class="e-row">
          <router-link to="/httpReceive" class="e-btn e-btn-primary">{{ $t('msg.modern.overview.show_address') }}</router-link>
          <router-link to="/importTransaction" class="e-btn e-btn-ghost">{{ $t('msg.modern.overview.receive_file') }}</router-link>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
  import Transaction from '@/components/Transaction.vue';
  import { reskin } from '@/components/modern/reskin';
  import { MIN_CONFIRMATIONS } from '@/shared/confirmations';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import MoneyText from '@/components/modern/ui/MoneyText.vue';
  import TxRing from '@/components/modern/activity/TxRing.vue';
  import txDisplay from '@/components/modern/activity/txDisplay';

  export default reskin(Transaction, {
    name: 'RecentTx',
    components: { EIcon, MoneyText, TxRing },
    mixins: [txDisplay],
    computed: {
      //display only: the store lists the newest first
      recent() {
        return this.total_txs.slice(0, 5);
      },
      minConfirmations() {
        return MIN_CONFIRMATIONS;
      },
    },
    methods: {
      /* "Today 16:58", "16 Oct 09:15" */
      compactTime(tx) {
        const d = new Date(tx.creation_ts);
        if (isNaN(d)) return '';
        const now = new Date();
        const today = d.getFullYear() == now.getFullYear() && d.getMonth() == now.getMonth() && d.getDate() == now.getDate();
        const day = today
          ? this.$t('msg.modern.overview.today')
          : new Intl.DateTimeFormat(this.locale, { day: 'numeric', month: 'short' }).format(d);
        return day + ' ' + this.timeOf(tx);
      },
    },
  });
</script>
