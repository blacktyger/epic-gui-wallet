<template>
  <select class="e-select" v-model="input" :aria-invalid="errors.network ? 'true' : null" :aria-describedby="errors.network ? uid + '-e' : null">
    <option value="mainnet">Mainnet</option>
    <option value="floonet">Floonet</option>
    <option value="usernet">Usernet</option>
  </select>
  <p v-if="errors.network" :id="uid + '-e'" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ errors.network }}</span></p>
</template>

<script>
  import Base from '@/components/form/networkField.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';
  let seq = 0;
  export default reskin(Base, {
    components: { EIcon },
    data() { return { uid: 'e-networkField-' + (++seq) }; },
  });
</script>
