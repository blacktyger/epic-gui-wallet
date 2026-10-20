<template>
  <div class="e-act-pane">
    <!-- the search sits in the page header (searchTo), the rest of this list below it -->
    <Teleport v-if="searchTo" :to="searchTo" defer :disabled="!active">
      <form class="e-input-wrap e-has-lead e-act-search" :class="{ 'e-is-searched': searched }" role="search" @submit.prevent="search">
        <span class="e-lead"><EIcon name="search" size="sm" /></span>
        <label class="e-sr-only" :for="uid">{{ $t('msg.modern.overview.search_tx') }}</label>
        <input
          :id="uid"
          ref="q"
          v-model="keyword"
          class="e-input"
          type="text"
          autocomplete="off"
          :placeholder="total_txs.length ? $t('msg.modern.overview.search_tx_ph') : $t('msg.modern.overview.search_none')"
          :disabled="searched || !total_txs.length"
        >
        <span v-if="searched" class="e-trail">
          <button type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.modern.overview.search_clear')" @click="onClear"><EIcon name="close" size="sm" /></button>
        </span>
      </form>
    </Teleport>

    <div v-if="total_txs.length" class="e-act-toolbar">
      <div class="e-seg" role="group" :aria-label="$t('msg.modern.overview.filter_tx')">
        <button type="button" :aria-pressed="currentFilter == '' ? 'true' : 'false'" @click="setFilter('')">{{ $t('msg.modern.overview.f_all') }} <span class="e-n">{{ counts.all }}</span></button>
        <button type="button" :aria-pressed="currentFilter == 'received' ? 'true' : 'false'" @click="setFilter('received')">{{ $t('msg.modern.overview.f_received') }} <span class="e-n">{{ counts.received }}</span></button>
        <button type="button" :aria-pressed="currentFilter == 'send' ? 'true' : 'false'" @click="setFilter('send')">{{ $t('msg.modern.overview.f_sent') }} <span class="e-n">{{ counts.sent }}</span></button>
      </div>
    </div>

    <div v-if="current_txs.length" class="e-panel">
      <div class="e-listhead e-act-grid" aria-hidden="true">
        <span></span><span>{{ $t('msg.modern.overview.col_who') }}</span><span>{{ $t('msg.modern.overview.col_status') }}</span><span>{{ $t('msg.modern.overview.col_time') }}</span><span>{{ $t('msg.modern.overview.col_amount') }}</span>
      </div>
      <ul class="e-txlist" :aria-label="$t('msg.modern.overview.list_label')">
        <template v-for="row in rows" :key="row.key">
          <li v-if="row.day" class="e-daysep">{{ row.label }}</li>
          <li v-else class="e-act-row e-act-grid" :class="{ 'e-is-off': row.tx.status == 'cancelled' }">
            <span class="e-tx-ico" :class="row.tx.status == 'cancelled' ? 'e-off' : (isSent(row.tx) ? 'e-out' : 'e-in')"><EIcon :name="iconOf(row.tx)" /></span>
            <span class="e-tx-who">
              <b :class="{ 'e-addr-inline': whoOf(row.tx).addr, 'e-hide': whoOf(row.tx).addr }" translate="no">{{ whoOf(row.tx).text }}</b>
              <small class="e-tx-meta">
                <template v-if="methodOf(row.tx)">{{ methodOf(row.tx) }}</template>
                <template v-if="messageOf(row.tx)"><span v-if="methodOf(row.tx)" class="e-sep">·</span><EIcon name="note" size="sm" /><span class="e-truncate">{{ messageOf(row.tx) }}</span></template>
                <template v-else-if="row.tx.payment_proof"><span v-if="methodOf(row.tx)" class="e-sep">·</span><EIcon name="proof" size="sm" />{{ $t('msg.modern.overview.has_proof') }}</template>
              </small>
            </span>
            <span class="e-tx-state">
              <router-link v-if="finalizable(row.tx)" to="/finalizeTransaction" class="e-btn e-btn-sm e-act-fin"><EIcon name="filedown" />{{ $t('msg.modern.overview.finalize') }}</router-link>
              <TxRing v-if="statusOf(row.tx).ring && !finalizable(row.tx)" :state="statusOf(row.tx).ring.state" :confirmations="statusOf(row.tx).ring.confirmations" />
              <EIcon v-else-if="statusOf(row.tx).icon && !finalizable(row.tx)" :name="statusOf(row.tx).icon" size="sm" />
              <span :class="[statusOf(row.tx).tone ? 'e-' + statusOf(row.tx).tone : null, { 'e-sr-only': finalizable(row.tx) }]">{{ statusOf(row.tx).text }}</span>
            </span>
            <time class="e-act-time e-mono" :datetime="row.tx.creation_ts">{{ timeOf(row.tx) }}</time>
            <span class="e-tx-amt" :class="{ 'e-in': !isSent(row.tx) && row.tx.status != 'cancelled', 'e-off': row.tx.status == 'cancelled' }">
              <MoneyText :value="amountOf(row.tx)" :decimals="decFor(amountOf(row.tx))" sign="always" />
              <small v-if="isSent(row.tx) && feeOf(row.tx)">{{ $t('msg.modern.overview.fee_label') }} <MoneyText :value="feeOf(row.tx)" :decimals="decFor(feeOf(row.tx))" :mono="false" /></small>
            </span>
            <button
              type="button"
              class="e-tx e-act-hit"
              :class="{ 'e-is-selected': drawerOpen && selectedId == row.tx.id }"
              :aria-label="rowLabel(row.tx)"
              @click="openTx(row.tx)"
            ></button>
          </li>
        </template>
      </ul>
    </div>

    <div v-else-if="store.state.walletSync == 'loading'" class="e-panel">
      <p class="e-ov-loading" role="status"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.app.loading_wallet_data') }}</p>
    </div>

    <!-- nothing yet, node ready: teach the three stages -->
    <div v-else-if="!total_txs.length && store.state.nodeStatus.sync_status == 'synced'" class="e-panel e-act-empty-panel">
      <div class="e-empty e-act-empty">
        <div class="e-glyph"><EIcon name="activity" /></div>
        <h2 class="e-empty-h">{{ $t('msg.modern.overview.none_title') }}</h2>
        <p>{{ $t('msg.modern.overview.act_empty_text') }}</p>
        <ol class="e-act-learn">
          <li><TxRing state="waiting" /><div><b>{{ $t('msg.modern.overview.learn_waiting') }}</b><span>{{ $t('msg.modern.overview.learn_waiting_text') }}</span></div></li>
          <li><TxRing state="confirming" :confirmations="2" /><div><b>{{ $t('msg.modern.overview.learn_confirming') }}</b><span>{{ $t('msg.modern.overview.learn_confirming_text') }}</span></div></li>
          <li><TxRing state="confirmed" /><div><b>{{ $t('msg.modern.overview.learn_spendable') }}</b><span>{{ $t('msg.modern.overview.learn_spendable_text', { n: minConfirmations }) }}</span></div></li>
        </ol>
        <div class="e-row">
          <router-link to="/httpReceive" class="e-btn e-btn-primary"><EIcon name="receive" />{{ $t('msg.modern.overview.show_address') }}</router-link>
          <router-link to="/importTransaction" class="e-btn e-btn-ghost">{{ $t('msg.modern.overview.receive_file') }}</router-link>
        </div>
      </div>
    </div>

    <div v-else-if="!total_txs.length" class="e-panel">
      <p class="e-ov-loading" role="status"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.modern.overview.waiting_node') }}</p>
    </div>

    <div v-else class="e-panel">
      <div class="e-empty">
        <div class="e-glyph"><EIcon name="search" /></div>
        <h3>{{ $t('msg.modern.overview.no_match') }}</h3>
        <p>{{ $t('msg.modern.overview.no_match_text') }}</p>
      </div>
    </div>

    <Pager :pages="pages_count" :current="current_page_index" :max-buttons="maxButtons" @prev="prev" @next="next" @page="page" />

    <!-- one transaction: the fields of Classic's expanded row -->
    <EDialog v-model:open="drawerOpen" drawer :title="selected ? $t(isSent(selected) ? 'msg.modern.overview.d_title_sent' : 'msg.modern.overview.d_title_received') : ''">
      <template v-if="selected">
        <div class="e-act-hero">
          <span class="e-tx-ico" :class="selected.status == 'cancelled' ? 'e-off' : (isSent(selected) ? 'e-out' : 'e-in')"><EIcon :name="iconOf(selected)" /></span>
          <div class="e-grow">
            <div class="e-act-big"><MoneyText :value="amountOf(selected)" :decimals="decFor(amountOf(selected))" unit :mono="false" /></div>
            <p class="e-small e-dim">{{ $t(isSent(selected) ? 'msg.modern.overview.d_to' : 'msg.modern.overview.d_from') }} <span class="e-mono e-hide" translate="no">{{ whoOf(selected).text }}</span></p>
          </div>
        </div>
        <p class="e-act-now" role="status">
          <TxRing v-if="statusOf(selected).ring" :state="statusOf(selected).ring.state" :confirmations="statusOf(selected).ring.confirmations" />
          <EIcon v-else :name="statusOf(selected).icon || 'info'" size="sm" />
          <span>{{ nowText(selected) }}</span>
        </p>

        <template v-if="selected.status != 'cancelled'">
          <h3 class="e-act-sub">{{ $t('msg.modern.overview.d_progress') }}</h3>
          <ol class="e-timeline">
            <li v-for="step in drawerSteps" :key="step.key" :class="'e-is-' + step.state" :aria-current="step.state == 'now' ? 'step' : null">
              <span class="e-m">
                <EIcon v-if="step.state == 'done'" name="check" />
                <span v-else-if="step.state == 'now'" class="e-spinner e-act-stepspin" aria-hidden="true"></span>
              </span>
              <div><b>{{ step.title }}</b><small v-if="step.sub">{{ step.sub }}</small></div>
              <time>{{ step.time }}</time>
            </li>
          </ol>
        </template>

        <h3 class="e-act-sub">{{ $t('msg.modern.overview.d_details') }}</h3>
        <dl class="e-facts e-act-facts">
          <dt>{{ $t('msg.modern.overview.f_date') }}</dt><dd>{{ formatDateTime(selected.creation_ts, locale) }}</dd>
          <template v-if="selected.public_addr">
            <dt>{{ $t(isSent(selected) ? 'msg.modern.overview.f_to' : 'msg.modern.overview.f_from') }}</dt>
            <dd><span class="e-mono e-truncate e-hide" translate="no" :title="selected.public_addr">{{ selected.public_addr }}</span><button type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.modern.overview.copy_field', { what: $t('msg.transaction.receiver') })" @click="copy(selected.public_addr)"><EIcon name="copy" size="sm" /></button></dd>
          </template>
          <template v-if="methodOf(selected)"><dt>{{ $t('msg.modern.overview.f_method') }}</dt><dd>{{ methodOf(selected) }}</dd></template>
          <dt>{{ $t('msg.modern.overview.f_amount') }}</dt><dd><MoneyText :value="Math.abs(amountOf(selected))" :decimals="decFor(amountOf(selected))" unit /></dd>
          <template v-if="isSent(selected)">
            <dt>{{ $t('msg.transaction.fee') }}</dt><dd><MoneyText :value="feeOf(selected)" :decimals="decFor(feeOf(selected))" unit /></dd>
            <dt>{{ $t('msg.modern.overview.f_total') }}</dt><dd><b><MoneyText :value="Math.abs(amountOf(selected)) + feeOf(selected)" :decimals="decFor(Math.abs(amountOf(selected)) + feeOf(selected))" unit /></b></dd>
          </template>
          <template v-if="selected.messages && selected.messages.messages">
            <template v-for="message in selected.messages.messages" :key="message.id">
              <dt>{{ $t('msg.transaction.message') }} {{ message.id }}</dt><dd>{{ message.message }}</dd>
            </template>
          </template>
        </dl>

        <TxProof :proof="selected.payment_proof" @copy="copy" />

        <details class="e-tech e-act-tech">
          <summary><EIcon name="chevr" size="sm" />{{ $t('msg.modern.overview.d_tech') }}</summary>
          <div class="e-tech-body">
            <dl class="e-facts e-act-facts">
              <dt>{{ $t('msg.transaction.id') }}</dt><dd class="e-mono" translate="no">{{ selected.id }}</dd>
              <dt>{{ $t('msg.transaction.slate_id') }}</dt>
              <dd><span class="e-mono" translate="no">{{ selected.tx_slate_id || $t('msg.modern.overview.d_no_value') }}</span><button v-if="selected.tx_slate_id" type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.modern.overview.copy_field', { what: $t('msg.transaction.slate_id') })" @click="copy(selected.tx_slate_id)"><EIcon name="copy" size="sm" /></button></dd>
              <dt>{{ $t('msg.transaction.confirmation_date') }}</dt><dd>{{ selected.confirmation_ts ? formatDateTime(selected.confirmation_ts, locale) : $t('msg.modern.overview.d_no_value') }}</dd>
              <dt>{{ $t('msg.transaction.amount_credited') }}</dt><dd><MoneyText :value="selected.amount_credited / 100000000" :decimals="decFor(selected.amount_credited / 100000000)" /></dd>
              <dt>{{ $t('msg.transaction.amount_debited') }}</dt><dd><MoneyText :value="selected.amount_debited / 100000000" :decimals="decFor(selected.amount_debited / 100000000)" /></dd>
              <dt>{{ $t('msg.transaction.status') }}</dt><dd class="e-mono" translate="no">{{ selected.status }}</dd>
              <dt>{{ $t('msg.transaction.type') }}</dt><dd class="e-mono" translate="no">{{ selected.tx_type }}</dd>
            </dl>
          </div>
        </details>
      </template>
      <template v-if="selected && (selected.cancelable || finalizable(selected))" #foot>
        <button v-if="selected.cancelable" type="button" class="e-btn e-btn-danger" :class="{ 'e-is-busy': isLoading }" :disabled="isLoading" @click="cancel(`${selected.tx_slate_id}`)">
          <EIcon name="cancel" />{{ isLoading ? $t('msg.modern.overview.d_cancelling') : $t('msg.modern.overview.d_cancel') }}
        </button>
        <router-link v-if="finalizable(selected)" to="/finalizeTransaction" class="e-btn e-btn-primary e-right"><EIcon name="filedown" />{{ $t('msg.modern.overview.d_finalize') }}</router-link>
      </template>
    </EDialog>
  </div>
</template>

<script>
  import Transaction from '@/components/Transaction.vue';
  import { reskin } from '@/components/modern/reskin';
  import { MIN_CONFIRMATIONS } from '@/shared/confirmations';
  import { formatDateTime } from '@/components/modern/format';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import MoneyText from '@/components/modern/ui/MoneyText.vue';
  import TxRing from '@/components/modern/activity/TxRing.vue';
  import Pager from '@/components/modern/activity/Pager.vue';
  import TxProof from '@/components/modern/activity/TxProof.vue';
  import txDisplay from '@/components/modern/activity/txDisplay';

  const RECEIVED = ['TxReceived', 'TxReceivedCancelled'];
  const SENT = ['TxSent', 'TxSentCancelled', 'TxSentCreated'];
  let seq = 0;

  /* The Transactions tab of Activity: Transaction.vue's list, filter, search, paging, copy and
     cancel, in the Modern look; a row opens a drawer with what Classic's expanded row shows. */
  export default reskin(Transaction, {
    name: 'TxList',
    components: { EIcon, EDialog, MoneyText, TxRing, Pager, TxProof },
    mixins: [txDisplay],
    props: {
      //the tab is showing: only then does its search sit in the page header
      active: { type: Boolean, default: true },
      //selector of the header slot the search form is moved to
      searchTo: { type: String, default: '' },
    },
    data() {
      return { drawerOpen: false, selectedId: null, uid: 'act-q-tx-' + (++seq) };
    },
    computed: {
      minConfirmations() {
        return MIN_CONFIRMATIONS;
      },
      //the counts next to the filters: the same tests filter() applies
      counts() {
        let received = 0;
        let sent = 0;
        for (const tx of this.total_txs) {
          if (RECEIVED.includes(tx.tx_type)) received++;
          else if (SENT.includes(tx.tx_type)) sent++;
        }
        return { all: this.total_txs.length, received, sent };
      },
      //the page's txs under a heading per day
      rows() {
        const out = [];
        let last = null;
        for (const tx of this.current_txs) {
          const key = this.dayKey(tx);
          if (key !== last) {
            out.push({ key: 'd' + out.length + key, day: true, label: this.dayLabel(tx) });
            last = key;
          }
          out.push({ key: 't' + tx.id, tx });
        }
        return out;
      },
      selected() {
        return this.selectedId === null ? null : (this.total_txs.find(tx => tx.id === this.selectedId) || null);
      },
      /* where the selected tx is on its way: derived from the same state as the ring */
      drawerSteps() {
        const tx = this.selected;
        if (!tx) return [];
        const t = k => this.$t('msg.modern.overview.' + k);
        const s = this.txState(tx);
        const sent = this.isSent(tx);
        const posted = s.state != 'waiting' || tx.tx_type == 'TxSentMempool';
        const confirming = s.state == 'confirming' || (s.state == 'waiting' && tx.tx_type == 'TxSentMempool');
        return [
          { key: 'created', state: 'done', title: t('p_created'), sub: t(sent ? 'p_created_sent' : 'p_created_received'), time: this.timeOf(tx) },
          {
            key: 'posted',
            state: posted ? 'done' : 'now',
            title: t(sent ? 'p_finalized_sent' : 'p_finalized_received'),
            sub: t(sent ? 'p_finalized_sent_sub' : 'p_finalized_received_sub'),
            time: posted ? '' : t('p_now'),
          },
          {
            key: 'confirmations',
            state: s.state == 'confirmed' || s.state == 'immature' ? 'done' : (confirming ? 'now' : 'todo'),
            title: this.$t('msg.modern.overview.p_confirmations', { n: MIN_CONFIRMATIONS }),
            sub: this.$t('msg.modern.overview.p_confirmations_sub', { n: MIN_CONFIRMATIONS }),
            time: s.state == 'confirming' ? s.confirmations + ' / ' + MIN_CONFIRMATIONS : '',
          },
        ];
      },
    },
    watch: {
      //the tx is gone after a refresh: nothing left to show
      selected(tx) {
        if (!tx) this.drawerOpen = false;
      },
    },
    methods: {
      formatDateTime,
      /* a filter button: picking the active one again changes nothing */
      setFilter(type) {
        if (type === this.currentFilter) return;
        this.filter(type, 0, false);
      },
      openTx(tx) {
        this.selectedId = tx.id;
        this.drawerOpen = true;
      },
      onClear() {
        this.clearup();
        this.$nextTick(() => { if (this.$refs.q) this.$refs.q.focus(); });
      },
      rowLabel(tx) {
        const st = this.statusOf(tx);
        const what = this.$t(this.isSent(tx) ? 'msg.modern.overview.row_sent' : 'msg.modern.overview.row_received', {
          amount: this.amountLabel(this.amountOf(tx)),
          who: this.whoOf(tx).text,
          status: st.text,
        });
        return this.$t('msg.modern.overview.open_row', { what });
      },
      /* the sentence in the drawer about where the tx stands */
      nowText(tx) {
        const t = (k, p) => this.$t('msg.modern.overview.' + k, p || {});
        const s = this.txState(tx);
        switch (s.state) {
          case 'waiting':
            if (tx.tx_type == 'TxReceived') return t('d_now_wait_finalize');
            if (tx.tx_type == 'TxSentMempool') return t('d_now_wait_mined');
            return t(this.finalizable(tx) ? 'd_now_wait_file' : 'd_now_wait_sign');
          case 'confirming':
            return t('d_now_confirming', { n: s.confirmations, total: MIN_CONFIRMATIONS });
          case 'immature':
            return t('d_now_immature');
          case 'confirmed':
            return s.confirmations > 0 ? t('d_now_confirmed_n', { n: s.confirmations }) : t('d_now_confirmed');
          default:
            return t('d_now_cancelled');
        }
      },
    },
  });
</script>
