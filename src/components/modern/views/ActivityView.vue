<template>
  <!-- Activity (route activity): Dashboard.vue's Transactions and Coins tabs as Transactions and
       Outputs. The tabs, search, hide-amounts and refresh sit in the page header. -->
  <header class="e-topbar">
    <h1>{{ $t('msg.modern.activity') }}</h1>
    <nav class="e-act-tabs" :aria-label="$t('msg.modern.overview.tabs_label')">
      <button type="button" :aria-current="transactionTab ? 'page' : null" @click="openTab('transactionTab')">{{ $t('msg.modern.overview.tab_tx') }}</button>
      <button type="button" :aria-current="commitTab ? 'page' : null" @click="openTab('commitTab')">{{ $t('msg.modern.overview.tab_outputs') }}</button>
    </nav>
    <div class="e-topbar-actions">
      <!-- the active tab's search form is moved here -->
      <div id="e-act-search-slot" class="e-act-search-slot"></div>
      <button
        type="button"
        class="e-icon-btn"
        :aria-pressed="store.state.hideValues ? 'true' : 'false'"
        :aria-label="$t('msg.modern.overview.hide_amounts')"
        :title="$t('msg.modern.overview.hide_amounts')"
        @click="store.commit('hideValues')"
      ><EIcon :name="store.state.hideValues ? 'eyeoff' : 'eye'" /></button>
      <button
        type="button"
        class="e-icon-btn"
        :aria-busy="refreshing ? 'true' : null"
        :aria-label="$t('msg.modern.overview.refresh_now')"
        :title="$t('msg.modern.overview.refresh_now')"
        @click="refresh"
      ><span v-if="refreshing" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="refresh" /></button>
    </div>
  </header>

  <div class="e-content">
    <div v-show="transactionTab">
      <SyncNotes class="e-act-notes" />
      <TxList ref="tx" :active="transactionTab" search-to="#e-act-search-slot" />
    </div>
    <div v-show="commitTab">
      <OutputSummary />
      <CoinList ref="coins" :active="commitTab" search-to="#e-act-search-slot" />
    </div>
  </div>
</template>

<script>
  import Dashboard from '@/components/Dashboard.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import TxList from '@/components/modern/activity/TxList.vue';
  import CoinList from '@/components/modern/activity/CoinList.vue';
  import OutputSummary from '@/components/modern/activity/OutputSummary.vue';
  import SyncNotes from '@/components/modern/activity/SyncNotes.vue';

  export default reskin(Dashboard, {
    name: 'ActivityView',
    components: { EIcon, TxList, CoinList, OutputSummary, SyncNotes },
    data() {
      return { refreshing: false };
    },
    watch: {
      //a refresh has landed
      'store.state.txs'() {
        this.refreshing = false;
      },
      'store.state.commits'() {
        this.refreshing = false;
      },
    },
    beforeUnmount() {
      clearTimeout(this.refreshTimer);
    },
    methods: {
      /* the refresh button of the tab that shows: the full refresh in App.vue */
      refresh() {
        if (this.refreshing) return;
        this.refreshing = true;
        if (this.transactionTab && this.$refs.tx) this.$refs.tx.getTxs();
        else if (this.$refs.coins) this.$refs.coins.getCommits();
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => { this.refreshing = false; }, 15000);
      },
    },
  });
</script>
