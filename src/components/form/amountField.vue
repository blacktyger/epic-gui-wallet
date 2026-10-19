<template>
  <div class="field has-addons">
    <div class="control is-expanded">
      <input
        class="input"
        type="text"
        inputmode="decimal"
        :placeholder="$t('msg.httpSend.sendAmount')"
        required
        autocomplete="off"
        v-model="input"
         />
    </div>
    <div class="control">
      <button type="button" style="height:40px;padding-left:12px;text-decoration: underline;" class="button is-ghost" :class="{ 'is-loading': sendAllBusy }" :aria-busy="sendAllBusy ? 'true' : null" @click="sendAll">
      {{$t("msg.transaction.sendall")}}
      </button>
    </div>
  </div>
  <div v-if="feeNano > 0">{{$t("msg.transaction.transaction_fee")}}: {{ feeText }} EPIC</div>
  <div style="color:red;" v-if="errors.amount">
     {{ errors.amount }}
  </div>
</template>

<script>
  import { ref } from "vue";
  import { MIN_CONFIRMATIONS } from "@/shared/confirmations";
  import {
    epicToNano, nanoToEpic, nanoToEpicString, parseNano, estimateArgs, selectionArgs,
    readEstimate, feeFromEstimate, planSendAll, latestOnly,
  } from "@/shared/sendMath";
  import useFormValidation from "@/modules/useFormValidation";

  //ms after the last keystroke before the fee is estimated
  const FEE_DELAY = 350;

  /* The amount to send, its fee and "All".
     input: what the user typed, always a String. fee (EPIC) / feeNano: the fee the wallet charges
     for exactly that amount, 0 / null while not known. After "All" the amount is the most that can
     be sent (spendable minus the fee of spending every coin, no change output) and, until it is
     edited, the send uses every coin (txSelection()). */
  export default {
    setup() {
      const input = ref('');
      const defaultValue = ref(null);
      const { validateAmountField, errors } = useFormValidation();
      return { input, errors, defaultValue, validateAmountField };
    },

    data() {
      return {
        fee: 0,
        feeNano: null,
        //the wallet would need more than it has for this amount (the fee is then what it would need)
        feeShort: false,
        //"All": the amount it filled in, while the input still says that
        sendAllNano: null,
        sendAllBusy: false,
      };
    },

    created() {
      //only the latest fee estimate (or "All") may set the fee
      this.latest = latestOnly();
    },

    computed: {
      /* the typed amount in nanoepic, null when it is not a valid amount */
      amountNano() { return epicToNano(this.input); },
      isSendAll() { return this.sendAllNano !== null && this.amountNano === this.sendAllNano; },
      feeText() { return this.feeNano > 0 ? nanoToEpicString(this.feeNano) : ''; },
    },

    watch: {
      input(value) {
        if (typeof value != 'string') {
          //always a String (trim, and the exact conversion, need one)
          this.input = value === null || value === undefined ? '' : String(value);
          return;
        }
        if (this.sendAllNano !== null && this.amountNano !== this.sendAllNano) {
          this.sendAllNano = null;
        }
        //"All" set the fee along with the amount
        if (this.isSendAll && this.feeNano > 0) return;
        //no fee for an amount it was not worked out for
        this.setFee(null);
        //each estimate makes the wallet refresh its outputs from the node: not on every keystroke
        clearTimeout(this.feeTimer);
        this.latest.cancel();
        this.feeTimer = setTimeout(() => this.getFee(), FEE_DELAY);
      },
    },

    beforeUnmount() {
      clearTimeout(this.feeTimer);
      this.latest.cancel();
    },

    methods: {
      setFee(f) {
        this.feeNano = f ? f.fee : null;
        this.feeShort = !!(f && f.short);
        this.fee = f ? nanoToEpic(f.fee) : 0;
      },

      /* init_send_tx arguments that pick the coins: the estimate and the send must use the same */
      txSelection() { return selectionArgs(this.isSendAll); },

      /* an estimate for amountNano: what the wallet answered (readEstimate) */
      async estimate(amountNano, sendAll) {
        let res = false;
        try {
          res = await this.$walletService.issueSendTransaction(estimateArgs(amountNano, MIN_CONFIRMATIONS, sendAll));
        } catch (e) {
          res = false;
        }
        return readEstimate(res);
      },

      /* the fee for the amount in the input, shown once it is known; null when it is not */
      async getFee() {
        const amount = this.amountNano;
        if (!(amount > 0)) {
          this.latest.cancel();
          this.setFee(null);
          return null;
        }
        const sendAll = this.isSendAll;
        const r = await this.latest(() => this.estimate(amount, sendAll));
        if (!r.current) return null;
        const f = feeFromEstimate(amount, r.value);
        this.setFee(f);
        return f;
      },

      /* "All": everything spendable minus the exact fee of sending it */
      async sendAll() {
        if (this.sendAllBusy) return;
        this.sendAllBusy = true;
        this.errors.amount = null;
        try {
          //the balance the wallet has now (the screen's may be a minute old); only a starting point
          let start = 0;
          try {
            const summary = await this.$walletService.getSummaryInfo(MIN_CONFIRMATIONS, true);
            if (summary && summary.result && summary.result.Ok) {
              start = parseNano(summary.result.Ok[1]['amount_currently_spendable']) || 0;
            }
          } catch (e) { /* the estimates find it */ }

          const r = await this.latest(() => planSendAll((amount) => this.estimate(amount, true), start));
          //typed into meanwhile: what was typed wins
          if (!r.current) return;
          const plan = r.value;
          if (plan.error) {
            if (plan.error != 'empty') console.log('[send all] ' + plan.error);
            this.errors.amount = this.$t(plan.error == 'empty' ? 'msg.validators.spendable' : 'msg.transaction.sendall_failed');
            return;
          }
          this.sendAllNano = plan.amount;
          this.setFee({ fee: plan.fee, short: false });
          this.input = nanoToEpicString(plan.amount);
        } finally {
          this.sendAllBusy = false;
        }
      },

      /* the checks before a send, with a fresh estimate for exactly this amount: true when it can go.
         spendable: the balance on screen, in EPIC */
      async validInput(spendable) {
        const raw = String(this.input === null || this.input === undefined ? '' : this.input).trim();
        this.defaultValue = raw === '' ? 0 : raw;
        const amount = epicToNano(raw);
        if (!(amount > 0)) {
          return this.validateAmountField("amount", this.defaultValue, spendable, null);
        }
        const sendAll = this.isSendAll;
        clearTimeout(this.feeTimer);
        const f = feeFromEstimate(amount, await this.estimate(amount, sendAll));
        //still the same amount: this is its fee (an estimate in flight is for an older input)
        if (this.amountNano === amount && this.isSendAll === sendAll) {
          this.latest.cancel();
          this.setFee(f);
        }
        return this.validateAmountField("amount", this.defaultValue, spendable, f);
      },
    }

  };
</script>
