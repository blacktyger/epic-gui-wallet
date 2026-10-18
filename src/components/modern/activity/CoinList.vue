<template>
  <div class="e-act-pane">
    <Teleport v-if="searchTo" :to="searchTo" defer :disabled="!active">
      <form class="e-input-wrap e-has-lead e-act-search" :class="{ 'e-is-searched': searched }" role="search" @submit.prevent="search">
        <span class="e-lead"><EIcon name="search" size="sm" /></span>
        <label class="e-sr-only" :for="uid">{{ $t('msg.modern.overview.search_out') }}</label>
        <input
          :id="uid"
          ref="q"
          v-model="keyword"
          class="e-input"
          type="text"
          autocomplete="off"
          :placeholder="total_commits.length ? $t('msg.modern.overview.search_out_ph') : $t('msg.modern.overview.search_none')"
          :disabled="searched || !total_commits.length"
        >
        <span v-if="searched" class="e-trail">
          <button type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.modern.overview.search_clear')" @click="onClear"><EIcon name="close" size="sm" /></button>
        </span>
      </form>
    </Teleport>

    <p class="e-act-explain">{{ $t('msg.modern.overview.outputs_explain') }}</p>

    <div v-if="total_commits.length" class="e-act-toolbar">
      <div class="e-seg" role="group" :aria-label="$t('msg.modern.overview.filter_out')">
        <button type="button" :aria-pressed="currentFilter == '' ? 'true' : 'false'" @click="setFilter('')">{{ $t('msg.modern.overview.f_all') }} <span class="e-n">{{ counts.all }}</span></button>
        <button type="button" :aria-pressed="currentFilter == 'unspent' ? 'true' : 'false'" @click="setFilter('unspent')">{{ $t('msg.modern.overview.f_unspent') }} <span class="e-n">{{ counts.unspent }}</span></button>
        <button type="button" :aria-pressed="currentFilter == 'unconfirmed' ? 'true' : 'false'" @click="setFilter('unconfirmed')">{{ $t('msg.modern.overview.f_unconfirmed') }} <span class="e-n">{{ counts.unconfirmed }}</span></button>
      </div>
    </div>

    <div v-if="current_commits.length" class="e-panel e-act-table-wrap">
      <table class="e-act-table">
        <caption class="e-sr-only">{{ $t('msg.modern.overview.out_caption') }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ $t('msg.modern.overview.out_commitment') }}</th>
            <th scope="col" class="e-act-c-h">{{ $t('msg.modern.overview.out_height') }}</th>
            <th scope="col" class="e-r e-act-c-v">{{ $t('msg.modern.overview.out_value') }}</th>
            <th scope="col" class="e-act-c-s">{{ $t('msg.modern.overview.out_status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(ct, index) in current_commits" :key="ct.commit" :class="{ 'e-is-off': ct.status == 'Spent' }">
            <td>
              <span class="e-act-cmt">
                <code class="e-mono" translate="no" :title="ct.commit">{{ truncateMid(ct.commit, 10) }}</code>
                <button type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.modern.overview.copy_commitment', { c: truncateMid(ct.commit, 8) })" @click="copy(index)"><EIcon name="copy" size="sm" /></button>
              </span>
            </td>
            <td class="e-mono" translate="no">{{ Number(ct.height).toLocaleString(locale) }}</td>
            <td class="e-r e-mono"><MoneyText :value="ct.value / 100000000" :decimals="decFor(ct.value / 100000000)" /></td>
            <td>
              <span class="e-act-st">
                <TxRing v-if="ringShown(ct)" :state="ringState(ct)" :confirmations="coinState(ct).confirmations" />
                <EIcon v-else :name="statusOf2(ct).icon" size="sm" :class="statusOf2(ct).tone ? 'e-' + statusOf2(ct).tone : null" />
                <span :class="statusOf2(ct).tone ? 'e-' + statusOf2(ct).tone : null">{{ statusOf2(ct).text }}<span v-if="statusOf2(ct).note" class="e-faint"> · {{ statusOf2(ct).note }}</span></span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="store.state.walletSync == 'loading'" class="e-panel">
      <p class="e-ov-loading" role="status"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.app.loading_wallet_data') }}</p>
    </div>

    <div v-else-if="!total_commits.length && store.state.nodeStatus.sync_status != 'synced'" class="e-panel">
      <p class="e-ov-loading" role="status"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.modern.overview.waiting_node') }}</p>
    </div>

    <div v-else class="e-panel">
      <div class="e-empty">
        <div class="e-glyph"><EIcon name="coins" /></div>
        <template v-if="!total_commits.length">
          <h3>{{ $t('msg.modern.overview.out_empty') }}</h3>
          <p>{{ $t('msg.modern.overview.out_empty_text') }}</p>
        </template>
        <template v-else>
          <h3>{{ $t('msg.modern.overview.no_out_match') }}</h3>
          <p>{{ $t('msg.modern.overview.no_out_match_text') }}</p>
        </template>
      </div>
    </div>

    <Pager :pages="pages_count" :current="current_page_index" :max-buttons="maxButtons" @prev="prev" @next="next" @page="page" />
  </div>
</template>

<script>
  import Commit from '@/components/Commit.vue';
  import { reskin } from '@/components/modern/reskin';
  import { MIN_CONFIRMATIONS } from '@/shared/confirmations';
  import { truncateMid } from '@/components/modern/format';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import MoneyText from '@/components/modern/ui/MoneyText.vue';
  import TxRing from '@/components/modern/activity/TxRing.vue';
  import Pager from '@/components/modern/activity/Pager.vue';
  import txDisplay from '@/components/modern/activity/txDisplay';

  let seq = 0;

  /* The Outputs tab of Activity: Commit.vue's list, filter, search, paging and copy, in the
     Modern look. */
  export default reskin(Commit, {
    name: 'CoinList',
    components: { EIcon, MoneyText, TxRing, Pager },
    mixins: [txDisplay],
    props: {
      active: { type: Boolean, default: true },
      searchTo: { type: String, default: '' },
    },
    data() {
      return { uid: 'act-q-out-' + (++seq) };
    },
    computed: {
      counts() {
        let unspent = 0;
        let unconfirmed = 0;
        for (const ct of this.total_commits) {
          if (ct.status == 'Unspent') unspent++;
          else if (ct.status == 'Unconfirmed') unconfirmed++;
        }
        return { all: this.total_commits.length, unspent, unconfirmed };
      },
    },
    methods: {
      truncateMid,
      //a ring while a coin waits or confirms; a confirmed coin gets the plain Unspent mark
      ringShown(ct) {
        const r = this.ringState(ct);
        return r == 'waiting' || r == 'confirming';
      },
      setFilter(type) {
        if (type === this.currentFilter) return;
        this.filter(type, 0, false);
      },
      onClear() {
        this.clearup();
        this.$nextTick(() => { if (this.$refs.q) this.$refs.q.focus(); });
      },
      /* the status of a coin where it has no ring: icon, tone, text (and blocks to go) */
      statusOf2(ct) {
        const t = k => this.$t('msg.modern.overview.' + k);
        const s = this.coinState(ct);
        switch (s.state) {
          case 'confirming':
            return { icon: '', tone: 'warn', text: this.$t('msg.modern.overview.st_confirming', { n: s.confirmations, total: MIN_CONFIRMATIONS }) };
          case 'immature': {
            const left = Number(ct.lock_height) - this.store.getters.tipHeight;
            return { icon: 'sand', tone: 'warn', text: t('st_immature'), note: left > 0 ? this.$t('msg.modern.overview.blocks_to_go', { n: left.toLocaleString(this.locale) }) : '' };
          }
          case 'confirmed':
            return { icon: 'okc', tone: 'ok', text: t('st_unspent') };
          case 'waiting':
            return { icon: '', tone: '', text: t('st_unconfirmed') };
          case 'locked':
            return { icon: 'lock', tone: '', text: t('st_locked') };
          default:
            return { icon: 'minusc', tone: '', text: t('st_spent') };
        }
      },
    },
  });
</script>
