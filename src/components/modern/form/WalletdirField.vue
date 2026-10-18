<template>
  <div class="e-row" style="flex-wrap:wrap">
    <code v-if="defaultValue" class="e-mono e-small e-grow" translate="no" style="overflow-wrap:anywhere">{{ defaultValue }}</code>
    <button type="button" class="e-btn e-btn-sm" :aria-describedby="errors.walletdir ? uid + '-e' : null" @click="selectDir"><EIcon name="folderopen" />{{ $t("msg.create.select") }}</button>
  </div>
  <p v-if="errors.walletdir" :id="uid + '-e'" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ errors.walletdir }}</span></p>
</template>

<script>
  import Base from '@/components/form/walletdirField.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';
  let seq = 0;
  export default reskin(Base, {
    components: { EIcon },
    data() { return { uid: 'e-walletdirField-' + (++seq) }; },
  });
</script>
