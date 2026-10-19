<template>
  <!-- the fee (Base: `feeNano`, `fee` in EPIC) is shown by the Send view's summary -->
  <div class="e-input-wrap">
    <input
      class="e-input e-input-lg"
      type="text"
      inputmode="decimal"
      :id="inputId || null"
      :placeholder="$t('msg.httpSend.sendAmount')"
      required
      autocomplete="off"
      translate="no"
      :aria-invalid="errors.amount ? 'true' : null"
      :aria-describedby="errors.amount ? uid + '-e' : null"
      v-model="input"
    />
    <div class="e-trail">
      <span class="e-unit">EPIC</span>
      <button
        type="button"
        class="e-btn e-btn-ghost e-btn-sm"
        :class="{ 'e-is-busy': sendAllBusy }"
        :aria-busy="sendAllBusy ? 'true' : null"
        @click="sendAll"
      >{{ $t("msg.transaction.sendall") }}</button>
    </div>
  </div>
  <p v-if="errors.amount" :id="uid + '-e'" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ errors.amount }}</span></p>
</template>

<script>
  import Base from '@/components/form/amountField.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';
  let seq = 0;
  export default reskin(Base, {
    components: { EIcon },
    data() { return { uid: 'e-amountField-' + (++seq) }; },
    props: { inputId: { type: String, default: '' } },
  });
</script>
