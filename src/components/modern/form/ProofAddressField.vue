<template>
  <input
    class="e-input e-mono"
    type="text"
    :placeholder="$t('msg.recipient_proof_address')"
    autocomplete="off"
    spellcheck="false"
    translate="no"
    :aria-invalid="errors.proof_address ? 'true' : null"
    :aria-describedby="errors.proof_address ? uid + '-e' : null"
    v-model="input" />
  <p v-if="errors.proof_address" :id="uid + '-e'" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ errors.proof_address }}</span></p>
</template>

<script>
  import Base from '@/components/form/proofAddressField.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';
  let seq = 0;
  export default reskin(Base, {
    components: { EIcon },
    data() { return { uid: 'e-proofAddressField-' + (++seq) }; },
  });
</script>
