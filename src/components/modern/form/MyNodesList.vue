<template>
  <!-- My nodes (logic: components/form/MyNodesList.vue), in the rows of the public node list -->
  <section v-if="nodes.length" class="e-mynodes" :aria-labelledby="uid + '-h'">
    <div class="e-nodedir-head">
      <span :id="uid + '-h'" class="e-label">{{ $t('msg.mynodes.title') }}</span>
    </div>
    <ul class="e-mynodes-list" :aria-labelledby="uid + '-h'">
      <li v-for="n in nodes" :key="n.address" class="e-mynodes-row" :class="{ 'e-is-on': isCurrent(n), 'e-is-asking': removing === n.address }">
        <template v-if="removing === n.address">
          <p class="e-mynodes-ask" :id="uid + '-ask'"><EIcon name="trash" size="sm" />{{ $t('msg.mynodes.remove_ask', { name: nameOf(n) }) }}</p>
          <div class="e-mynodes-acts">
            <button ref="keep" type="button" class="e-btn e-sm e-btn-ghost" :disabled="disabled" @click="removing = ''">{{ $t('msg.mynodes.remove_keep') }}</button>
            <button type="button" class="e-btn e-sm e-btn-danger" :disabled="disabled" :aria-describedby="uid + '-ask'" @click="confirmRemove(n)">{{ $t('msg.mynodes.remove_yes') }}</button>
          </div>
        </template>
        <template v-else>
          <span class="e-nodedir-dot" :class="viewOf(n) ? 'e-' + viewOf(n).tone : (checking.includes(n.address) ? 'e-wait' : '')" aria-hidden="true"></span>
          <span class="e-mynodes-name">
            <span class="e-mynodes-line">
              <b v-if="n.label">{{ n.label }}</b>
              <b v-else class="e-mono e-mynodes-bare" translate="no">{{ n.address }}</b>
              <span class="e-mynodes-meta" :aria-label="statusLabel(n)" :role="statusLabel(n) ? 'group' : null">
                <template v-if="viewOf(n)">
                  <span class="e-tag" :class="'e-' + (viewOf(n).tone === 'ok' && viewOf(n).behind ? 'warn' : viewOf(n).tone)">{{ shortState(viewOf(n)) }}</span>
                  <span v-if="viewOf(n).ms !== null" class="e-nodedir-lat">{{ $t('msg.nodedir.latency_ms', { n: viewOf(n).ms }) }}</span>
                </template>
                <span v-else-if="checking.includes(n.address)" class="e-faint">{{ $t('msg.mynodes.checking') }}</span>
              </span>
            </span>
            <small v-if="n.label" class="e-mono" translate="no">{{ n.address }}</small>
          </span>
          <span class="e-mynodes-acts">
            <span v-if="isCurrent(n)" class="e-mynodes-sel"><EIcon name="check" size="sm" />{{ $t('msg.mynodes.selected') }}</span>
            <button v-else type="button" class="e-btn e-sm" :disabled="disabled" :aria-label="$t('msg.mynodes.use_named', { name: nameOf(n) })" @click="$emit('use', n)">{{ $t('msg.mynodes.use') }}</button>
            <button type="button" class="e-icon-btn e-sm" :disabled="disabled" :aria-label="$t('msg.mynodes.edit_named', { name: nameOf(n) })" :title="$t('msg.mynodes.edit')" @click="$emit('edit', n)"><EIcon name="pencil" size="sm" /></button>
            <button type="button" class="e-icon-btn e-sm" :disabled="disabled" :aria-label="$t('msg.mynodes.remove_named', { name: nameOf(n) })" :title="$t('msg.mynodes.remove')" @click="askRemove(n)"><EIcon name="trash" size="sm" /></button>
          </span>
        </template>
      </li>
    </ul>
    <p class="e-mynodes-note">{{ $t('msg.mynodes.use_hint') }}</p>
  </section>
</template>

<script>
  import Base from '@/components/form/MyNodesList.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';

  export default reskin(Base, {
    components: { EIcon },
  });
</script>
