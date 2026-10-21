<template>
  <!-- Overview (route dashboard): balance, recent activity and connection status. Same logic as
       HeaderBar.vue (balance, fiat price, node info, hide amounts, restart node); Dashboard's
       lists live on the Activity page. -->
  <header class="e-topbar">
    <h1>{{ $t('msg.modern.overview.title') }}</h1>
    <div class="e-topbar-actions">
      <button
        type="button"
        class="e-icon-btn"
        :aria-pressed="store.state.hideValues ? 'true' : 'false'"
        :aria-label="$t('msg.modern.overview.hide_amounts')"
        :title="$t('msg.modern.overview.hide_amounts')"
        @click="hideValues"
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

    <!-- first unlock after the upgrade: shown once -->
    <div v-if="showUpgraded" class="e-notice e-gold e-ov-upgrade" role="status">
      <EIcon name="palette" />
      <div>
        <b>{{ $t('msg.modern.overview.upgraded_title') }}</b>
        <p>{{ $t('msg.modern.overview.upgraded_text') }}</p>
      </div>
      <div class="e-actions">
        <router-link to="/settings" class="e-btn-inline" @click="dismissUpgraded">{{ $t('msg.modern.overview.upgraded_open') }}</router-link>
        <button type="button" class="e-icon-btn e-inline" :aria-label="$t('msg.modern.overview.dismiss')" @click="dismissUpgraded"><EIcon name="close" /></button>
      </div>
    </div>

    <!-- just unlocked: the slow parts carry on in the background and say so -->
    <ol v-if="showSteps" class="e-bgsteps" :aria-label="$t('msg.modern.overview.steps_label')">
      <li v-for="step in steps" :key="step.key" class="e-bgstep" :class="'e-is-' + step.state">
        <EIcon v-if="step.state == 'done'" name="check" size="sm" />
        <span v-else-if="step.state == 'now'" class="e-spinner" aria-hidden="true"></span>
        <EIcon v-else name="clock" size="sm" />
        {{ step.text }}
        <span class="e-sr-only">, {{ $t(step.state == 'done' ? 'msg.progress.done' : (step.state == 'now' ? 'msg.progress.active' : 'msg.progress.pending')) }}</span>
      </li>
    </ol>

    <!-- the external node is too old, locked, not an Epic node, or the saved address was cleaned up -->
    <NodeNotice />

    <div v-if="nodeDown && !nodeProblemShown" class="e-notice e-risk e-ov-notice" role="alert">
      <EIcon name="alertc" />
      <div>
        <b>{{ isInternal ? $t('msg.modern.overview.node_down') : $t('msg.modern.overview.node_down_at', { addr: store.state.nodeType }) }}</b>
        <p>{{ isInternal ? $t('msg.modern.overview.node_down_internal') : $t('msg.modern.overview.node_down_external') }}</p>
      </div>
      <div class="e-actions">
        <button v-if="isInternal" type="button" class="e-btn-inline" :disabled="nodeRestarting" @click.prevent="restartNode">
          <EIcon name="refresh" />{{ nodeRestarting ? $t('msg.modern.overview.restarting_node') : $t('msg.modern.overview.restart_node') }}
        </button>
        <router-link to="/settings" class="e-btn-inline">{{ $t('msg.modern.overview.node_settings') }}</router-link>
      </div>
    </div>

    <div v-else-if="nodeSyncing" class="e-notice e-warn e-ov-notice" role="status">
      <EIcon name="server" />
      <div>
        <b>{{ $t('msg.modern.overview.node_syncing', { p: syncPercent }) }}</b>
        <p>
          {{ $t('msg.modern.overview.node_syncing_detail', { status: nodeState(store.state.nodeStatus.sync_status) }) }}
          <template v-if="store.state.walletTip">{{ $t('msg.modern.overview.node_syncing_balance', { h: fmt(store.state.walletTip) }) }}</template>
          {{ $t('msg.modern.overview.node_syncing_send') }}
        </p>
        <div class="e-progress e-ov-progress" role="progressbar" :aria-valuenow="Math.floor(loaded)" aria-valuemin="0" aria-valuemax="100" :aria-label="$t('msg.modern.overview.node_sync_progress')"><i :style="{ width: loaded + '%' }"></i></div>
      </div>
    </div>

    <!-- the one framed object on the screen -->
    <section class="e-panel e-balance e-gridfield e-ticked" aria-labelledby="ov-bal-label" data-tour="balance">
      <span class="e-tick e-tl"></span><span class="e-tick e-tr"></span><span class="e-tick e-bl"></span><span class="e-tick e-br"></span>
      <div class="e-balance-top">
        <div>
          <div class="e-balance-label" id="ov-bal-label">
            {{ $t('msg.modern.overview.available') }}
            <span v-if="nodeSyncing && store.state.walletTip" class="e-tag e-warn">{{ $t('msg.modern.overview.as_of_block', { h: fmt(store.state.walletTip) }) }}</span>
            <span v-if="checking" class="e-tag"><span class="e-spinner e-ov-tagspin" aria-hidden="true"></span>{{ $t('msg.modern.overview.updating') }}</span>
          </div>
          <div class="e-balance-amount">
            <span v-if="loadingBalance" class="e-skel e-ov-skel-big" aria-hidden="true"></span>
            <MoneyText v-else :value="summary.spendable" unit :mono="false" :updating="updating" />
          </div>
          <div class="e-balance-fiat">
            <span v-if="isEmpty">{{ $t('msg.modern.overview.ready') }}</span>
            <!-- always mounted: it is the live region for "updating" and "starting listener" -->
            <SyncNotes />
            <template v-if="!isEmpty && showFiat">
              <span class="e-money" translate="no">≈ ${{ $filters.currencyFormat(usdPrice, locale) }}</span>
              <span class="e-faint e-ov-fiatnote">{{ $t('msg.modern.overview.fiat_note') }}</span>
            </template>
          </div>
        </div>
        <div class="e-balance-actions e-ov-actions">
          <template v-if="isEmpty">
            <router-link to="/httpReceive" class="e-btn e-btn-primary"><EIcon name="receive" />{{ $t('msg.modern.overview.receive_epic') }}</router-link>
          </template>
          <template v-else>
            <router-link v-if="nodeSynced" to="/httpSend" class="e-btn e-btn-primary"><EIcon name="send" />{{ $t('msg.menu.send') }}</router-link>
            <button v-else type="button" class="e-btn e-btn-primary" disabled aria-describedby="ov-send-why"><EIcon name="send" />{{ $t('msg.menu.send') }}</button>
            <router-link to="/httpReceive" class="e-btn"><EIcon name="receive" />{{ $t('msg.menu.receive') }}</router-link>
          </template>
          <p v-if="!nodeSynced && !isEmpty" id="ov-send-why" class="e-ov-why e-small e-dim">{{ $t('msg.modern.overview.send_why') }}</p>
        </div>
      </div>
      <svg class="e-trace" :class="{ 'e-is-syncing': nodeSyncing || updating }" viewBox="0 0 700 26" preserveAspectRatio="none" aria-hidden="true"><path d="M0 13H150l6-9 8 18 8-14 6 5h190l6-7 6 14 6-7h312" /></svg>
      <dl class="e-balance-break">
        <div>
          <dt>{{ $t('msg.modern.overview.total') }}</dt>
          <dd :class="{ 'e-zero': !summary.total && !loadingBalance }"><span v-if="loadingBalance" class="e-skel e-ov-skel" aria-hidden="true"></span><MoneyText v-else :value="summary.total" :updating="updating" /></dd>
        </div>
        <div>
          <dt><TxRing class="e-sm" state="confirming" :confirmations="1" />{{ $t('msg.modern.overview.confirming') }}</dt>
          <dd :class="{ 'e-zero': !summary.unconfirmed && !loadingBalance }"><span v-if="loadingBalance" class="e-skel e-ov-skel" aria-hidden="true"></span><MoneyText v-else :value="summary.unconfirmed" :updating="updating" /></dd>
        </div>
        <div v-if="summary.immature > 0 || loadingBalance">
          <dt><EIcon name="clock" size="sm" />{{ $t('msg.modern.overview.immature') }}</dt>
          <dd><span v-if="loadingBalance" class="e-skel e-ov-skel" aria-hidden="true"></span><MoneyText v-else :value="summary.immature" :updating="updating" /></dd>
        </div>
        <div>
          <dt>{{ $t('msg.modern.overview.awaiting') }}</dt>
          <dd :class="{ 'e-zero': !summary.unfinalization && !loadingBalance }"><span v-if="loadingBalance" class="e-skel e-ov-skel" aria-hidden="true"></span><MoneyText v-else :value="summary.unfinalization" :updating="updating" /></dd>
        </div>
        <div>
          <dt><EIcon name="lock" size="sm" />{{ $t('msg.modern.overview.locked') }}</dt>
          <dd :class="{ 'e-zero': !summary.locked && !loadingBalance }"><span v-if="loadingBalance" class="e-skel e-ov-skel" aria-hidden="true"></span><MoneyText v-else :value="summary.locked" :updating="updating" /></dd>
        </div>
      </dl>
    </section>

    <div class="e-ov-cols">
      <RecentTx />

      <aside aria-labelledby="ov-status-h">
        <div class="e-section-head"><h2 id="ov-status-h">{{ $t('msg.modern.overview.status') }}</h2></div>
        <div class="e-panel e-ov-status">
          <!-- one row per service, the same data as the sidebar hover cards (modern/serviceRows.js); the details
               are in a tooltip that opens on hover and on focus, Esc closes it (WCAG 1.4.13) -->
          <div
            v-for="r in ovRows"
            :key="r.key"
            class="e-srow"
            :class="{ 'e-is-dismissed': dismissed == r.key }"
            tabindex="0"
            :data-test="'ov-' + r.key"
            :aria-describedby="'ov-tip-' + r.key"
            @keydown.esc="dismissed = r.key"
            @mouseleave="dismissed = ''"
            @focusout="dismissed = ''"
          >
            <span class="e-ico" :class="{ 'e-err': r.err }" aria-hidden="true"><EIcon :name="r.icon" /><span class="e-st" :class="'e-' + r.glyph" :data-state="r.glyph"></span></span>
            <span class="e-srow-lab">{{ r.label }}</span>
            <span class="e-srow-val" :class="{ 'e-mono': r.mono }" translate="no">{{ r.value }}</span>
            <button
              v-if="r.key == 'node' && isInternal && !nodeDown"
              type="button"
              class="e-icon-btn e-inline"
              :disabled="nodeRestarting"
              :aria-label="$t('msg.modern.overview.restart_node')"
              :title="$t('msg.modern.overview.restart_node')"
              @click.prevent="restartNode"
            ><EIcon name="restart" size="sm" /></button>
            <span v-else></span>
            <span :id="'ov-tip-' + r.key" class="e-srow-tip" role="tooltip">
              <span v-for="(line, i) in r.tip" :key="i" translate="no">{{ line }}</span>
            </span>
          </div>
          <small role="status" class="e-sr-only" :data-node-state="badge.state">{{ badgeTip }}</small>
          <p v-if="badge.behind" class="e-srow-note"><router-link to="/settings#node" class="e-btn-inline">{{ $t('msg.modern.switch_node') }}</router-link></p>
          <p v-if="isInternal && !configService.config.nodesynced && (configService.defaultAccountNetwork || 'mainnet') == 'mainnet'" class="e-srow-note e-faint">{{ $t('msg.modern.overview.node_fallback', { addr: nodeFallBack }) }}</p>
          <div class="e-srow-foot">
            <button type="button" class="e-btn" data-test="ov-receive-options" @click="openReceiving">{{ $t('msg.modern.overview.receive_options') }}</button>
          </div>
        </div>

        <div v-if="pendingFiles && !isEmpty" class="e-notice e-gold e-ov-files">
          <EIcon name="file" />
          <div>
            <b>{{ $t('msg.modern.overview.pending_files', { n: pendingFiles }, pendingFiles) }}</b>
            <p>{{ $t('msg.modern.overview.pending_files_text') }}</p>
            <router-link to="/finalizeTransaction" class="e-btn-inline">{{ $t('msg.modern.overview.finalize') }}</router-link>
          </div>
        </div>
      </aside>
    </div>
  </div>
  <ETour v-if="tourOpen" :steps="tourSteps" @close="endTour" />
</template>

<script>
  import HeaderBar from '@/components/HeaderBar.vue';
  import { reskin } from '@/components/modern/reskin';
  import { noticeSeen, markNoticeSeen } from '@/shared/theme';
  import ETour from '@/components/modern/ui/ETour.vue';

  //the fiat value last shown, for the balance it was computed for (see mounted)
  const lastFiat = { total: null, usd: 0 };
  import { nodeSyncPercent } from '@/components/modern/format';
  import { nodeBadge, nodeBadgeText } from '@/components/modern/nodeBadge';
  import { nodeRow, serviceRows } from '@/components/modern/serviceRows';
  import { openSettingsSection } from '@/components/modern/settings/jump';
  import epicboxSwitch from '@/components/modern/epicboxSwitch';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import MoneyText from '@/components/modern/ui/MoneyText.vue';
  import RecentTx from '@/components/modern/activity/RecentTx.vue';
  import SyncNotes from '@/components/modern/activity/SyncNotes.vue';
  import TxRing from '@/components/modern/activity/TxRing.vue';
  import NodeNotice from '@/components/modern/activity/NodeNotice.vue';

  export default reskin(HeaderBar, {
    name: 'OverviewView',
    components: { EIcon, MoneyText, RecentTx, SyncNotes, TxRing, ETour, NodeNotice },
    //ebHealth: our Epicbox listener's status, as the sidebar has it
    mixins: [epicboxSwitch],
    data() {
      return {
        showUpgraded: !noticeSeen('upgraded'),
        //the first-run tour (shown once; Settings › Show the tour again)
        tourOpen: false,
        refreshing: false,
        //Esc hides that row's tooltip until the pointer or focus leaves
        dismissed: '',
      };
    },
    computed: {
      /* the node as one icon and a short tooltip (components/modern/nodeBadge.js) */
      badge() {
        return nodeBadge(this.store.state.nodeStatus, this.store.state.nodeProblem);
      },
      badgeTip() {
        return nodeBadgeText(this.badge, this.$t);
      },
      tourSteps() {
        const s = (key, target) => ({ target, title: this.$t('msg.modern.tour_' + key + '_t'), text: this.$t('msg.modern.tour_' + key) });
        return [
          s('balance', '[data-tour=balance]'),
          s('send', '[data-tour=send]'),
          s('receive', '[data-tour=receive]'),
          //the ways to send and receive, one step each (on the Receive item)
          s('epicbox', '[data-tour=receive]'),
          s('http', '[data-tour=receive]'),
          s('files', '[data-tour=receive]'),
          s('activity', '[data-tour=activity]'),
          s('settings', '[data-tour=settings]'),
          //help is in Settings › Help: one step, on the same item
          { target: '[data-tour=settings]', title: this.$t('msg.support.tour_t'), text: this.$t('msg.support.tour') },
        ];
      },
      summary() {
        return this.store.state.summary;
      },
      node() {
        return this.store.state.nodeStatus || {};
      },
      nodeDown() {
        return !!this.node.error;
      },
      /* NodeNotice already says what is wrong with the node: no second notice for it */
      nodeProblemShown() {
        const p = this.store.state.nodeProblem;
        return !!(p && !p.hidden);
      },
      nodeConnecting() {
        return !this.node.error && !this.node.user_agent && !(this.node.tip && this.node.tip.height > 0);
      },
      /* blocks below the network tip, once seen twice in a row (nodeService.assessStatus), else 0 */
      nodeBehind() {
        return !this.node.error && this.node.node_behind > 0 ? this.node.node_behind : 0;
      },
      nodeSyncing() {
        //a node stuck behind the tip (nodeBehind) is not syncing: the status card says so instead
        return !this.node.error && !!this.node.user_agent && this.node.sync_status != 'synced' && !this.nodeBehind;
      },
      /* the test HttpSend uses before it sends */
      nodeSynced() {
        const s = this.node;
        return !!(s && !s.error && s.sync_status === 'synced' && s.tip && s.tip.height > 0);
      },
      isInternal() {
        return this.store.state.nodeType == 'internal';
      },
      syncPercent() {
        return nodeSyncPercent(this.node, this.locale);
      },
      //not yet checked against the node (feat/qol walletSync)
      updating() {
        return this.store.state.walletSync != 'synced';
      },
      //balance and txs not read from the wallet yet
      loadingBalance() {
        return this.store.state.walletSync == 'loading';
      },
      //the Updating tag: the wallet is reading, or waiting for a node that is not answering yet
      checking() {
        const sync = this.store.state.walletSync;
        return sync == 'loading' || (sync == 'local' && this.nodeConnecting);
      },
      isEmpty() {
        const sync = this.store.state.walletSync;
        return (sync == 'local' || sync == 'synced') && !this.summary.total && !this.store.state.txs.length;
      },
      showFiat() {
        return this.configService.defaultAccountNetwork == 'mainnet' && Number(this.usdPrice) > 0 && !this.loadingBalance;
      },
      listening() {
        return !!(this.store.state.walletListenerService || this.store.state.walletEpicboxService);
      },
      showSteps() {
        if (this.nodeDown) return false;
        const sync = this.store.state.walletSync;
        return sync == 'loading' || this.store.state.listenerStarting || (sync == 'local' && this.nodeConnecting);
      },
      steps() {
        const t = k => this.$t('msg.modern.overview.' + k);
        const nodeUp = !this.nodeConnecting && !this.nodeDown;
        const sync = this.store.state.walletSync;
        const reading = sync == 'loading' || (sync == 'local' && nodeUp);
        return [
          { key: 'unlock', state: 'done', text: t('step_unlocked') },
          { key: 'node', state: nodeUp ? 'done' : 'now', text: t(nodeUp ? 'step_node_connected' : 'step_node_connecting') },
          { key: 'balances', state: sync == 'synced' ? 'done' : (reading ? 'now' : 'wait'), text: t(sync == 'synced' ? 'step_balances_done' : 'step_balances') },
          {
            key: 'listener',
            state: this.store.state.listenerStarting ? 'now' : (this.listening ? 'done' : 'wait'),
            text: t(this.listening && !this.store.state.listenerStarting ? 'step_listener_done' : 'step_listener'),
          },
        ];
      },
      /* the Status card: the sidebar hover cards' rows (modern/serviceRows.js), so the two can't say different things */
      ovRows() {
        const st = this.store.state;
        const addr = String((this.configService.config || {}).check_node_api_http_addr || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const t = (k, a) => this.$t(k, a);
        const node = nodeRow({ status: st.nodeStatus, problem: st.nodeProblem, internal: this.isInternal, addr, locale: this.$i18n.locale }, t);
        const httpAddr = (st.direct && st.direct.httpAddr) || 'http://127.0.0.1:' + this.configService.walletListenerPort;
        return serviceRows({ node, health: this.ebHealth, domain: this.ebDomain, direct: st.direct, httpListener: st.httpListener, listenerStarting: st.listenerStarting, tor: st.tor, httpAddr }, t);
      },
      /* file sends waiting for the response file: the test of the sidebar badge */
      pendingFiles() {
        return (this.store.state.txs || []).filter(tx =>
          tx.status == 'unconfirmed' && tx.address && tx.address.type == 'file' && String(tx.tx_type).startsWith('TxSent')
        ).length;
      },
    },
    watch: {
      //a refresh has landed
      'store.state.txs'() {
        this.refreshing = false;
      },
    },
    async mounted() {
      //the tour, once, shortly after the first unlock in the BT Labs Theme (or on request)
      if (!noticeSeen('tour') || this.$route.query.tour) {
        this.tourTimer = setTimeout(() => { this.tourOpen = true; }, 900);
      }
      //HeaderBar fetches the price when the balance changes. Classic keeps one HeaderBar for the
      //whole session; this page is created on every visit, so it reuses the last value for the
      //same balance instead of asking CoinGecko again
      const total = this.store.state.summary.total;
      if (lastFiat.total === total && lastFiat.usd) {
        this.usdPrice = lastFiat.usd;
        return;
      }
      try {
        if (total) await HeaderBar.watch['store.state.summary.total'].call(this, total);
      } catch (e) {
        //no price: the fiat line stays out
      }
    },
    beforeUnmount() {
      clearTimeout(this.refreshTimer);
      clearTimeout(this.tourTimer);
      lastFiat.total = this.store.state.summary.total;
      lastFiat.usd = this.usdPrice;
    },
    methods: {
      openReceiving() {
        openSettingsSection(this.$router, { path: '/settings/receiving' });
      },
      fmt(n) {
        return Number(n || 0).toLocaleString(this.locale);
      },
      /* the full refresh in App.vue, as Transaction.vue's refresh button does it */
      refresh() {
        if (this.refreshing) return;
        this.refreshing = true;
        this.emitter.emit('app.update');
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => { this.refreshing = false; }, 15000);
      },
      endTour() {
        this.tourOpen = false;
        //the tour also says where the interface switch is: the new-look notice is not needed after it
        markNoticeSeen('tour');
        this.dismissUpgraded();
        if (this.$route.query.tour) this.$router.replace('/dashboard');
      },
      dismissUpgraded() {
        markNoticeSeen('upgraded');
        this.showUpgraded = false;
      },
    },
  });
</script>
