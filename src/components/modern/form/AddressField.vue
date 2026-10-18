<template>
  <input
    class="e-input e-mono"
    type="text"
    :placeholder="$t('msg.httpSend.address')"
    required
    autocomplete="off"
    spellcheck="false"
    translate="no"
    @keyup="$emit('keyup', $event.target.value)"
    :aria-invalid="errors.address ? 'true' : null"
    :aria-describedby="errors.address ? uid + '-e' : null"
    v-model="input" />
  <p v-if="errors.address" :id="uid + '-e'" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ errors.address }}</span></p>
</template>

<script>
  import Base from '@/components/form/addressField.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';
  let seq = 0;
  export default reskin(Base, {
    components: { EIcon },
    data() { return { uid: 'e-addressField-' + (++seq) }; },
  });
</script>
