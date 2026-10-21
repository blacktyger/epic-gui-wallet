<template>
  <!-- Our Epicbox server doesn't answer (#52): say so in one line and offer the healthiest other server of
       the public list, one click; never switched by itself (modern/epicboxSwitch.js). The same words on
       Settings › Receiving, Receive and Send. -->
  <div v-if="health.state == 'down'" class="e-eb-down" role="status" data-test="epicbox-down-notice">
    <span class="e-st e-down" aria-hidden="true"></span>
    <span>
      <b>{{ $t('msg.modern.eb_down_title') }}</b>{{ ' ' + (suggest ? $t('msg.modern.eb_switch_q', { server: suggest.domain }) : $t('msg.modern.eb_down_wait')) }}
    </span>
    <button v-if="suggest" type="button" class="e-btn-inline" data-test="epicbox-switch" :class="{ 'e-is-busy': busy }" :aria-busy="busy ? 'true' : null" :disabled="busy" @click="$emit('switch', suggest.domain)"><EIcon name="swap" />{{ $t('msg.modern.eb_switch') }}</button>
  </div>
</template>

<script>
  import EIcon from '@/components/modern/ui/EIcon.vue';

  export default {
    name: 'EpicboxDownNotice',
    components: { EIcon },
    props: {
      //shared/epicboxHealth.js epicboxHealth(); suggest: healthiestOther() or null
      health: { type: Object, required: true },
      suggest: { type: Object, default: null },
      busy: { type: Boolean, default: false },
    },
    emits: ['switch'],
  };
</script>
