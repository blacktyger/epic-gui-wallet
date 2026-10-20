<template>
  <!-- Add to my nodes / Edit (logic: components/form/MyNodeDialog.vue), on the app's EDialog -->
  <EDialog :open="true" icon="server" :title="title" :description="$t('msg.mynodes.dialog_desc')" class="e-mynode-dialog" @close="close">
    <form :id="uid + '-f'" class="e-mynode-form" novalidate @submit.prevent="save">
      <div class="e-field">
        <label class="e-label" :for="uid + '-a'">{{ $t('msg.mynodes.address') }}</label>
        <input :id="uid + '-a'" ref="addressInput" class="e-input e-mono" type="text" v-model="address" spellcheck="false" autocomplete="off" translate="no"
          :aria-invalid="addressProblem ? 'true' : null" :aria-describedby="addressProblem ? uid + '-e' : null" @paste="pasted = true" />
        <p v-if="addressProblem" :id="uid + '-e'" class="e-error-msg"><EIcon name="alertc" /><span>{{ addressProblem }}</span></p>
        <NodeCheckStatus v-else :state="check" short />
      </div>
      <div class="e-field">
        <label class="e-label" :for="uid + '-l'">{{ $t('msg.mynodes.label') }} <span class="e-opt">{{ $t('msg.mynodes.label_optional') }}</span></label>
        <input :id="uid + '-l'" class="e-input" type="text" v-model="label" :maxlength="labelMax" autocomplete="off" :placeholder="$t('msg.mynodes.label_ph')" />
      </div>
      <p v-if="saveProblem" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ saveProblem }}</span></p>
    </form>
    <template #foot>
      <button type="button" class="e-btn e-btn-ghost" @click="close">{{ $t('msg.cancel') }}</button>
      <button type="submit" :form="uid + '-f'" class="e-btn e-btn-primary" :disabled="!canSave"><EIcon name="check" />{{ $t('msg.save') }}</button>
    </template>
  </EDialog>
</template>

<script>
  import Base from '@/components/form/MyNodeDialog.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import NodeCheckStatus from '@/components/modern/form/NodeCheckStatus.vue';
  import { reskin } from '@/components/modern/reskin';

  export default reskin(Base, {
    components: { EIcon, EDialog, NodeCheckStatus },
    methods: {
      //EDialog opens itself (showModal) and gives focus back to the opener on close
      showDialog() {
        this.$nextTick(() => { const el = this.$refs.addressInput; if (el && el.focus) el.focus(); });
      },
    },
  });
</script>
