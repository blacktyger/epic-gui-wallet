/*
 * Display helpers for a wallet tx, shared by the Modern transaction views (a mixin for the
 * reskins of Transaction.vue). They only read the tx and the Classic component's own state
 * (txState(), locale); nothing here changes a tx or calls the wallet.
 */
import { MIN_CONFIRMATIONS } from '@/shared/confirmations';
import { formatEpic, truncateMid } from '@/components/modern/format';

const NANO = 100000000;
//the send types, as Transaction.vue lists them
const SENT = ['TxSent', 'TxSentCancelled', 'TxSentCreated', 'TxSentMempool'];

export default {
  methods: {
    isSent(tx) {
      return SENT.includes(tx.tx_type);
    },
    /* the same test as Classic's Finalize button */
    finalizable(tx) {
      return !!(tx.address && tx.address.type == 'file' && tx.status == 'unconfirmed');
    },
    isFile(tx) {
      return !!(tx.address && tx.address.type == 'file');
    },
    iconOf(tx) {
      if (this.isFile(tx)) return 'file';
      return this.isSent(tx) ? 'send' : 'receive';
    },
    /* signed EPIC: what the other side gets for a send (fee apart), what arrives for a receive */
    amountOf(tx) {
      if (this.isSent(tx)) return -((tx.amount_debited - tx.amount_credited - tx.fee) / NANO);
      return tx.amount_credited / NANO;
    },
    feeOf(tx) {
      return (Number(tx.fee) || 0) / NANO;
    },
    /* decimals to show: 4 as in the design, more only when the amount has them */
    decFor(value) {
      const n = Math.abs(Number(value)) || 0;
      for (let d = 4; d < 8; d++) {
        const x = n * Math.pow(10, d);
        if (Math.abs(x - Math.round(x)) < 1e-6) return d;
      }
      return 8;
    },
    /* "esQ7nW…x3Rd@epicbox.epiccash.com": keeps both ends of the key, which is what people compare */
    shortAddr(addr) {
      const a = String(addr || '');
      const at = a.indexOf('@');
      if (at > 0) return truncateMid(a.slice(0, at), 6) + a.slice(at);
      return /^https?:/i.test(a) ? a : truncateMid(a, 12);
    },
    /* who the tx was with: the contact's name, the address, or what kind of tx it was */
    whoOf(tx) {
      if (tx.address && tx.address.name) return { text: tx.address.name, addr: false };
      if (tx.public_addr) return { text: this.shortAddr(tx.public_addr), addr: true };
      if (this.isFile(tx)) return { text: this.$t('msg.modern.overview.file_tx'), addr: false };
      if (tx.tx_type == 'ConfirmedCoinbase') return { text: this.$t('msg.modern.overview.mining_reward'), addr: false };
      return { text: this.$t(this.isSent(tx) ? 'msg.modern.overview.unknown_recipient' : 'msg.modern.overview.unknown_sender'), addr: false };
    },
    methodOf(tx) {
      if (this.isFile(tx)) return this.$t('msg.modern.overview.m_file');
      const a = String(tx.public_addr || '');
      if (a.includes('@')) return this.$t('msg.modern.overview.m_epicbox');
      if (/^https?:/i.test(a)) return this.$t('msg.modern.overview.m_http');
      return '';
    },
    messageOf(tx) {
      const list = tx.messages && tx.messages.messages;
      const m = Array.isArray(list) ? list.find(x => x && x.message) : null;
      return m ? m.message : '';
    },
    /* where the tx stands: text, ring (null for none), icon for states without a ring, tone */
    statusOf(tx) {
      const t = k => this.$t('msg.modern.overview.' + k);
      const s = this.txState(tx);
      switch (s.state) {
        case 'waiting': {
          let text = t('st_wait_sign');
          if (tx.waitingReply) text = t('st_wait_reply');
          else if (tx.tx_type == 'TxReceived') text = t('st_wait_finalize');
          else if (tx.tx_type == 'TxSentMempool') text = t('st_wait_mined');
          else if (this.finalizable(tx)) text = t('st_wait_file');
          return { state: 'waiting', ring: { state: 'waiting', confirmations: null }, icon: '', tone: '', text };
        }
        case 'confirming':
          return {
            state: 'confirming',
            ring: { state: 'confirming', confirmations: s.confirmations },
            icon: '',
            tone: 'warn',
            text: this.$t('msg.modern.overview.st_confirming', { n: s.confirmations, total: MIN_CONFIRMATIONS }),
          };
        case 'immature':
          return { state: 'immature', ring: null, icon: 'sand', tone: 'warn', text: t('st_immature') };
        case 'confirmed':
          return {
            state: 'confirmed',
            ring: { state: 'confirmed', confirmations: s.confirmations },
            icon: '',
            tone: '',
            //a send-all the node found in a block stays TxSentMempool in the wallet (shared/sendAllKernel.js)
            text: this.isSent(tx) ? t('st_sent') : t('st_received'),
          };
        default:
          return { state: 'cancelled', ring: null, icon: 'cancel', tone: '', text: t('st_cancelled') };
      }
    },
    timeOf(tx) {
      const d = new Date(tx.creation_ts);
      if (isNaN(d)) return '';
      return new Intl.DateTimeFormat(this.locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    },
    dayKey(tx) {
      const d = new Date(tx.creation_ts);
      return isNaN(d) ? '' : d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    },
    /* "Today · Sunday 18 October", "Yesterday · Saturday 17 October", "Friday 16 October" */
    dayLabel(tx) {
      const d = new Date(tx.creation_ts);
      if (isNaN(d)) return '';
      const full = new Intl.DateTimeFormat(this.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
      const now = new Date();
      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const same = (a, b) => a.getFullYear() == b.getFullYear() && a.getMonth() == b.getMonth() && a.getDate() == b.getDate();
      if (same(d, now)) return this.$t('msg.modern.overview.today') + ' · ' + full;
      if (same(d, yest)) return this.$t('msg.modern.overview.yesterday') + ' · ' + full;
      return full;
    },
    /* the amount for a screen reader: not read out while amounts are hidden */
    amountLabel(value) {
      if (this.store.state.hideValues) return this.$t('msg.modern.hidden_amount');
      return formatEpic(Math.abs(value), { decimals: this.decFor(value), locale: this.locale }) + ' EPIC';
    },
  },
};
