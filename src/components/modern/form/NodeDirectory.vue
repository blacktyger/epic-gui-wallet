<template>
  <!-- Public nodes from status.btlabs.uk (logic: components/form/NodeDirectory.vue). Nothing at all until the list has arrived, or when it can't be had. -->
  <section v-if="nodes.length" class="e-nodedir" :aria-labelledby="uid + '-h'">
    <div class="e-nodedir-head">
      <span :id="uid + '-h'" class="e-label">{{ $t('msg.nodedir.title') }}</span>
    </div>
    <div class="e-nodedir-list" role="radiogroup" :aria-labelledby="uid + '-h'">
      <label v-for="n in nodes" :key="n.endpoint" class="e-nodedir-row" :class="{ 'e-is-on': selected && selected.endpoint === n.endpoint }">
        <input type="radio" :name="uid" :value="n.endpoint" :checked="!!selected && selected.endpoint === n.endpoint" :disabled="disabled" @change="pick($event.target)" />
        <span class="e-nodedir-dot" :class="'e-' + tone(n)" aria-hidden="true"></span>
        <span class="e-nodedir-name">
          <b class="e-mono" translate="no">{{ n.host }}</b>
          <small v-if="n.operator" translate="no">{{ n.operator }}</small>
        </span>
        <span class="e-nodedir-meta">
          <span v-if="n.state !== 'healthy' || n.awaitingPeers" class="e-tag e-warn">{{ stateText(n) }}</span>
          <span v-else-if="n.tipLag !== null" class="e-tag" :class="n.tipLag === 0 ? 'e-ok' : 'e-warn'">{{ lagText(n) }}</span>
          <span v-if="n.latencyMs !== null" class="e-num e-nodedir-lat">{{ $t('msg.nodedir.latency_ms', { n: n.latencyMs }) }}</span>
        </span>
      </label>
    </div>

    <div v-if="selected" class="e-nodedir-sum" role="group" aria-live="polite" :aria-label="$t('msg.nodedir.summary', { host: selected.host })">
      <dl class="e-nodedir-stats">
        <div><dt>{{ $t('msg.nodedir.state') }}</dt><dd><span class="e-nodedir-dot" :class="'e-' + tone(selected)" aria-hidden="true"></span>{{ stateText(selected) }}</dd></div>
        <div v-if="selected.height !== null">
          <dt>{{ $t('msg.nodedir.height') }}</dt>
          <dd><span class="e-num">{{ fmt(selected.height) }}</span><small v-if="selected.tipLag !== null" :class="selected.tipLag === 0 ? 'e-ok' : 'e-warn'">{{ lagText(selected) }}</small></dd>
        </div>
        <div v-if="selected.version"><dt>{{ $t('msg.nodedir.version') }}</dt><dd class="e-num">{{ selected.version }}</dd></div>
        <div v-if="selected.latencyMs !== null"><dt>{{ $t('msg.nodedir.latency') }}</dt><dd class="e-num">{{ $t('msg.nodedir.latency_ms', { n: selected.latencyMs }) }}</dd></div>
        <div v-if="selected.country"><dt>{{ $t('msg.nodedir.location') }}</dt><dd class="e-nodedir-loc"><span class="e-nodedir-flag" aria-hidden="true">{{ flagOf(selected.country) }}</span><span>{{ countryOf(selected.country) }}</span></dd></div>
        <div v-if="selected.uptime24h !== null || selected.uptime30d !== null">
          <dt>{{ $t('msg.nodedir.uptime') }}</dt>
          <dd><span class="e-num" v-if="selected.uptime24h !== null">{{ pct(selected.uptime24h) }}</span><small v-if="selected.uptime30d !== null">{{ $t('msg.nodedir.uptime_30d', { p: pct(selected.uptime30d) }) }}</small></dd>
        </div>
      </dl>
      <div class="e-nodedir-foot">
        <span>{{ $t('msg.nodedir.latency_note') }}</span>
        <!-- a button, not an <a href>: a middle- or shift-click on a link would open the page in an app window -->
        <button type="button" class="e-link-btn" @click="openPage(selected)">{{ $t('msg.nodedir.more') }}<EIcon name="external" size="sm" /><span class="e-sr-only"> {{ $t('msg.nodedir.opens_browser') }}</span></button>
      </div>
    </div>
  </section>
</template>

<script>
  import Base from '@/components/form/NodeDirectory.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';
  import { number, percent, flag, countryName } from '@/shared/nodeDirectory';

  export default reskin(Base, {
    components: { EIcon },
    methods: {
      tone(n) {
        return n.state === 'healthy' && !n.awaitingPeers ? 'ok' : 'warn';
      },
      fmt(n) { return number(n, this.locale); },
      pct(f) { return percent(f, this.locale); },
      flagOf(c) { return flag(c); },
      countryOf(c) { return countryName(c, this.locale); },
    },
  });
</script>
