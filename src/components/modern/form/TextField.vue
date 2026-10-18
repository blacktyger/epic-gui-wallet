<template>
  <input
    class="e-input"
    type="text"
    :placeholder="placeholder"
    :required="required"
    autocomplete="off"
    spellcheck="false"
    :aria-invalid="errors[errorName] ? 'true' : null"
    :aria-describedby="errors[errorName] ? uid + '-e' : null"
    v-model="input" />
  <p v-if="errors[errorName]" :id="uid + '-e'" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ errors[errorName] }}</span></p>
</template>

<script>
  import Base from '@/components/form/textField.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';
  let seq = 0;
  export default reskin(Base, {
    components: { EIcon },
    data() { return { uid: 'e-textField-' + (++seq) }; },
  });
</script>
