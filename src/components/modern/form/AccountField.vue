<template>
  <input
    class="e-input"
    type="text"
    :placeholder="placeholder"
    :required="required"
    autocomplete="off"
    spellcheck="false"
    :aria-invalid="errors.account ? 'true' : null"
    :aria-describedby="errors.account ? uid + '-e' : null"
    v-model="input" />
  <p v-if="errors.account" :id="uid + '-e'" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ errors.account }}</span></p>
</template>

<script>
  import Base from '@/components/form/accountField.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';
  let seq = 0;
  export default reskin(Base, {
    components: { EIcon },
    data() { return { uid: 'e-accountField-' + (++seq) }; },
  });
</script>
