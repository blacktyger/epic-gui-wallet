<template>
  <!-- the fee (Base: `feeNano`, `fee` in EPIC) is shown by the Send view's summary -->
  <div class="e-input-wrap">
    <input
      class="e-input e-amount-input"
      type="text"
      inputmode="decimal"
      :id="inputId || null"
      placeholder="0.00"
      required
      :aria-label="$t('msg.httpSend.sendAmount')"
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
        class="e-amount-all"
        :class="{ 'e-is-busy': sendAllBusy }"
        :aria-busy="sendAllBusy ? 'true' : null"
        :aria-label="$t('msg.transaction.sendall')"
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
