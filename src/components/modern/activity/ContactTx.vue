<template>
  <!-- Contacts: the transactions with one contact (the Send screen links a send to the contact it
       went to, shared/contacts.js contactTransactions). A reskin of Transaction.vue like RecentTx. -->
  <section class="e-con-recent" :aria-labelledby="'con-tx-h'">
    <div class="e-con-recent-head">
      <h3 id="con-tx-h">{{ $t('msg.contacts.txs_title', { name }) }}</h3>
      <router-link v-if="mine.length" to="/activity" class="e-small e-right">{{ $t('msg.contacts.txs_all') }}</router-link>
    </div>
    <ul v-if="mine.length" class="e-txlist" :aria-label="$t('msg.contacts.txs_title', { name })">
      <li v-for="tx in mine.slice(0, 5)" :key="tx.id">
        <router-link to="/activity" class="e-tx e-compact e-tx-link">
          <span class="e-tx-ico" :class="tx.status == 'cancelled' ? 'e-off' : (isSent(tx) ? 'e-out' : 'e-in')"><EIcon :name="iconOf(tx)" /></span>
          <span class="e-tx-who">
            <b>{{ isSent(tx) ? $t('msg.contacts.tx_sent') : $t('msg.contacts.tx_received') }}</b>
            <small class="e-tx-meta">
              <TxRing v-if="statusOf(tx).ring" class="e-sm" :state="statusOf(tx).ring.state" :confirmations="statusOf(tx).ring.confirmations" />
              <EIcon v-else-if="statusOf(tx).icon" :name="statusOf(tx).icon" size="sm" />
              <span :class="statusOf(tx).tone ? 'e-' + statusOf(tx).tone : null">{{ statusOf(tx).text }}</span>
            </small>
          </span>
          <span class="e-tx-amt" :class="{ 'e-in': !isSent(tx) && tx.status != 'cancelled', 'e-off': tx.status == 'cancelled' }">
            <MoneyText :value="amountOf(tx)" :decimals="decFor(amountOf(tx))" :sign="'always'" />
            <small>{{ dayOf(tx) }}</small>
          </span>
        </router-link>
      </li>
    </ul>
    <p v-else class="e-small e-dim e-con-tx-none">{{ $t('msg.contacts.txs_none') }}</p>
  </section>
</template>

<script>
  import Transaction from '@/components/Transaction.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import MoneyText from '@/components/modern/ui/MoneyText.vue';
  import TxRing from '@/components/modern/activity/TxRing.vue';
  import txDisplay from '@/components/modern/activity/txDisplay';
  import { contactTransactions } from '@/shared/contacts.js';

  export default reskin(Transaction, {
    name: 'ContactTx',
    components: { EIcon, MoneyText, TxRing },
    mixins: [txDisplay],
    props: {
      contactId: { type: Number, default: 0 },
      name: { type: String, default: '' },
    },
    computed: {
      mine() {
        return contactTransactions(this.total_txs, this.contactId);
      },
    },
    methods: {
      dayOf(tx) {
        const d = new Date(tx.creation_ts);
        if (isNaN(d)) return '';
        const opts = { day: 'numeric', month: 'short' };
        if (d.getFullYear() != new Date().getFullYear()) opts.year = 'numeric';
        return new Intl.DateTimeFormat(this.locale, opts).format(d);
      },
    },
  });
</script>
