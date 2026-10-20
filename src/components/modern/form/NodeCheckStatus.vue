<template>
  <!-- The live check of a typed or saved node address (logic: components/form/NodeCheckStatus.vue): the state word, the height with its meter, a notice only for an old version -->
  <div class="e-nodecheck" :class="{ 'e-is-idle': !view && phase !== 'checking', 'e-short': short }" role="status" aria-live="polite" :aria-label="$t('msg.mynodes.status_label')">
    <p v-if="phase === 'checking'" class="e-nodecheck-row e-dim" aria-hidden="true"><span class="e-spinner e-nodecheck-spin" aria-hidden="true"></span>{{ $t('msg.mynodes.checking') }}</p>
    <template v-else-if="view">
      <p class="e-nodecheck-row">
        <span class="e-nodedir-dot" :class="'e-' + view.tone" aria-hidden="true"></span>
        <b class="e-nodecheck-state" :class="'e-' + view.tone">{{ stateText }}</b>
        <span v-if="view.height !== null" class="e-nodecheck-height e-num" translate="no">{{ heightText }}<HeightMeter :behind="view.behind" /></span>
        <span v-if="versionOldText && view.state !== 'old'" class="e-tag e-warn">{{ versionOldText }}</span>
        <button v-if="!short" type="button" class="e-link-btn e-nodecheck-again" @click="$emit('recheck')"><EIcon name="refresh" size="sm" />{{ $t('msg.mynodes.recheck') }}</button>
      </p>
      <p v-if="(problemText || hintText) && !short" class="e-nodecheck-note">
        <span v-if="problemText">{{ problemText }}</span>
        <span v-if="hintText" class="e-nodecheck-hint"><EIcon name="info" size="sm" />{{ hintText }}</span>
      </p>
    </template>
  </div>
</template>

<script>
  import Base from '@/components/form/NodeCheckStatus.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import HeightMeter from '@/components/modern/ui/HeightMeter.vue';
  import { reskin } from '@/components/modern/reskin';

  export default reskin(Base, {
    components: { EIcon, HeightMeter },
    computed: {
      heightText() {
        return this.view.height.toLocaleString(this.locale);
      },
    },
  });
</script>
