<template>
  <!-- Public Epicbox servers and their status (logic: components/form/EpicboxServers.vue), under the Epicbox server field.
       Picking a row fills the field; typing your own server there still works. -->
  <section v-if="servers.length" class="e-nodedir e-ebdir" :aria-labelledby="uid + '-h'">
    <div class="e-nodedir-head">
      <span :id="uid + '-h'" class="e-label">{{ $t('msg.epicboxdir.title') }}</span>
    </div>
    <div class="e-nodedir-list" role="radiogroup" :aria-labelledby="uid + '-h'" :aria-describedby="uid + '-n'">
      <label v-for="s in servers" :key="s.domain" class="e-nodedir-row" :class="{ 'e-is-on': selected && selected.domain === s.domain }">
        <input type="radio" :name="uid" :value="s.domain" :checked="!!selected && selected.domain === s.domain" :disabled="disabled" @change="pick($event.target)" />
        <span class="e-nodedir-dot" :class="'e-' + tone(s)" aria-hidden="true"></span>
        <span class="e-nodedir-name">
          <b class="e-mono" translate="no">{{ s.domain }}</b>
          <small v-if="s.operator || s.label" translate="no">{{ s.operator || s.label }}</small>
        </span>
        <span class="e-nodedir-meta">
          <span v-if="s.isDefault" class="e-tag e-gold">{{ $t('msg.epicboxdir.default') }}</span>
          <span class="e-tag" :class="tagClass(s)">{{ stateText(s) }}</span>
          <span v-if="s.latencyMs !== null" class="e-num e-nodedir-lat">{{ $t('msg.epicboxdir.latency_ms', { n: fmt(s.latencyMs) }) }}</span>
        </span>
      </label>
    </div>
    <p :id="uid + '-n'" class="e-help e-ebdir-note">{{ live ? $t('msg.epicboxdir.live_note') : $t('msg.epicboxdir.unknown_note') }}</p>
  </section>
</template>

<script>
  import Base from '@/components/form/EpicboxServers.vue';
  import { reskin } from '@/components/modern/reskin';

  export default reskin(Base, {
    methods: {
      tone(s) {
        return s.state === 'healthy' ? 'ok' : s.state === 'down' ? 'risk' : s.state === 'degraded' ? 'warn' : 'none';
      },
      tagClass(s) {
        return s.state === 'healthy' ? 'e-ok' : s.state === 'down' ? 'e-risk' : s.state === 'degraded' ? 'e-warn' : '';
      },
    },
  });
</script>
