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
        <span class="e-st" :class="{ ok: 'e-ok', warn: 'e-sync', risk: 'e-down' }[tone(s)] || 'e-off'" aria-hidden="true"></span>
        <span class="e-nodedir-name">
          <b class="e-mono" translate="no">{{ s.domain }}</b>
          <small v-if="s.operator || s.label" translate="no">{{ s.operator || s.label }}</small>
        </span>
        <span class="e-nodedir-meta">
          <!-- the factory default as a tiny muted word (#58); the state word only when not online; no response time in the row -->
          <span v-if="s.isDefault" class="e-def">{{ $t('msg.modern.settings.default_label') }}</span>
          <span v-if="s.state !== 'healthy'" class="e-stword" :class="s.state === 'down' ? 'e-down' : 'e-sync'">{{ stateText(s) }}</span>
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
    },
  });
</script>
