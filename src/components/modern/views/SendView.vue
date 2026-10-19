<template>
  <header class="e-topbar">
    <h1>{{ $t('msg.menu.send') }}</h1>
    <div class="e-topbar-actions">
      <button
        type="button"
        class="e-btn e-btn-ghost e-btn-sm"
        :class="{ 'e-is-busy': isLoadingSendFile }"
        :disabled="!nodeSynced"
        :aria-busy="isLoadingSendFile ? 'true' : null"
        @click="isLoadingSendFile || sendFile()"
      ><EIcon name="filedown" />{{ $t('msg.modern.send.as_file') }}</button>
    </div>
  </header>

  <div class="e-content">
    <div v-if="!nodeSynced" class="e-notice e-warn e-send-notice" role="status">
      <EIcon name="server" />
      <div>
        <b>{{ $t('msg.node_not_synced') }}</b>
        <p>{{ $t('msg.node_not_synced_hint') }}{{ syncing ? ' ' + $t('msg.modern.send.sync_done', { p: syncPercent }) : '' }}</p>
      </div>
    </div>
    <div v-else-if="epicboxSelected && !epicboxConnected" class="e-notice e-warn e-send-notice" role="status">
      <EIcon name="antenna" />
      <div>
        <b>{{ $t('msg.epicbox_not_connected') }}</b>
        <p>{{ $t('msg.epicbox_not_connected_hint') }}</p>
      </div>
    </div>

    <div class="e-send-grid">
      <form id="e-send-form" class="e-send-form" novalidate :aria-label="$t('msg.modern.send.form_label')" @submit.prevent="review">

        <div class="e-field">
          <label class="e-label" for="e-send-to">{{ $t('msg.modern.send.to') }} <span class="e-aside">{{ $t('msg.modern.send.to_hint') }}</span></label>
          <div ref="toBox" class="e-send-addr">
            <span class="e-send-lead" aria-hidden="true"><EIcon name="contacts" /></span>
            <AddressField ref="addressField" @keyup="keyEvent" />
            <div class="e-send-trail">
              <button v-if="addressField && addressField.input" type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.modern.send.clear_to')" @click="clearTo"><EIcon name="close" size="sm" /></button>
              <router-link class="e-icon-btn e-sm" to="/addressBook" :aria-label="$t('msg.modern.send.add_contact')"><EIcon name="userplus" size="sm" /></router-link>
            </div>
          </div>

          <ul v-if="foundAddress.length" class="e-found" :aria-label="$t('msg.modern.send.found_label')">
            <template v-for="found in foundAddress" :key="found.id">
              <li v-if="found.onion">
                <button type="button" class="e-found-item" @click="fillAddressField(found, 'onion')">
                  <b>{{ found.name }}</b><span class="e-tag"><EIcon name="tor" />{{ $t('msg.modern.send.kind_tor') }}</span>
                  <span class="e-mono e-dim e-truncate" translate="no">{{ found.onion }}</span>
                </button>
              </li>
              <li v-if="found.externalOne">
                <button type="button" class="e-found-item" @click="fillAddressField(found, 'externalOne')">
                  <b>{{ found.name }}</b><span class="e-tag e-gold"><EIcon name="antenna" />{{ $t('msg.modern.send.kind_epicbox') }}</span>
                  <span class="e-mono e-dim e-truncate" translate="no">{{ found.externalOne }}</span>
                </button>
              </li>
              <li v-if="found.externalTwo">
                <button type="button" class="e-found-item" @click="fillAddressField(found, 'externalTwo')">
                  <b>{{ found.name }}</b><span class="e-tag"><EIcon name="web" />{{ $t('msg.modern.send.kind_http') }}</span>
                  <span class="e-mono e-dim e-truncate" translate="no">{{ found.externalTwo }}</span>
                </button>
              </li>
            </template>
          </ul>

          <p v-if="recipientKind" class="e-resolved">
            <template v-if="contact">
              <span class="e-avatar e-sm" aria-hidden="true">{{ contactInitials }}</span>
              <span><b>{{ contact.name }}</b> {{ $t('msg.modern.send.from_contacts') }}</span>
            </template>
            <span class="e-tag" :class="{ 'e-gold': recipientKind == 'epicbox' }"><EIcon :name="kindIcon" />{{ $t('msg.modern.send.kind_' + recipientKind) }}</span>
            <span v-if="recipientKind == 'epicbox'" class="e-faint e-small">{{ $t('msg.modern.send.offline_ok') }}</span>
          </p>
        </div>

        <div class="e-field">
          <label class="e-label" for="e-send-amt">{{ $t('msg.modern.send.amount') }}
            <span class="e-aside">{{ $t('msg.modern.send.available') }} <MoneyText :value="store.state.summary.spendable" :updating="store.state.walletSync != 'synced'" /> EPIC</span>
          </label>
          <AmountField ref="amountField" input-id="e-send-amt" />
          <p v-if="store.state.summary.unconfirmed > 0" class="e-help">{{ $t('msg.modern.send.unconfirmed_note', { n: unconfirmedText }) }}</p>
        </div>

        <div class="e-field">
          <label class="e-label" for="e-send-msg">{{ $t('msg.modern.send.message') }} <span class="e-opt">{{ $t('msg.modern.send.optional') }}</span><span class="e-aside e-mono">{{ message.length }} / 256</span></label>
          <textarea id="e-send-msg" v-model="message" class="e-textarea" rows="2" maxlength="256"></textarea>
          <p class="e-help">{{ $t('msg.modern.send.message_hint') }}</p>
        </div>

        <details class="e-tech e-send-adv" :open="advOpen" @toggle="advOpen = $event.target.open">
          <summary>
            <EIcon name="chevr" size="sm" />{{ $t('msg.modern.send.adv_title') }}
            <span class="e-faint e-small e-send-adv-state">{{ advState }}</span>
          </summary>
          <div class="e-tech-body">
            <div class="e-set-row e-flat">
              <div>
                <b id="e-send-proof-l">{{ $t('msg.modern.send.proof_title') }}</b>
                <p id="e-send-proof-d">{{ $t('msg.modern.send.proof_hint') }}</p>
              </div>
              <label class="e-switch">
                <input id="sendProofSwitch" v-model="withproof" type="checkbox" aria-labelledby="e-send-proof-l" aria-describedby="e-send-proof-d" @click="addProof" />
                <span class="e-track"></span>
              </label>
            </div>
            <div v-show="withproof" class="e-field e-send-proof">
              <label class="e-label" for="e-send-proof">{{ $t('msg.modern.send.proof_address') }}</label>
              <div ref="proofBox"><ProofAddressField ref="proofAddressField" /></div>
            </div>
            <div class="e-set-row e-flat">
              <div>
                <b id="e-send-dand-l">{{ $t('msg.dandelion') }}</b>
                <p id="e-send-dand-d">{{ $t('msg.dandelion_hint') }}</p>
              </div>
              <label class="e-switch">
                <input id="dandelion" ref="dandelion" type="checkbox" checked aria-labelledby="e-send-dand-l" aria-describedby="e-send-dand-d" @change="dandelionOn = $event.target.checked" />
                <span class="e-track"></span>
              </label>
            </div>
          </div>
        </details>
      </form>

      <aside class="e-panel e-panel-pad e-summary-card" :aria-label="$t('msg.modern.send.summary')">
        <h2 class="e-sum-title">{{ $t('msg.modern.send.summary') }}</h2>
        <div class="e-line">
          <span>{{ $t('msg.modern.send.amount') }}</span>
          <span v-if="amountNum > 0" class="e-num" :class="{ 'e-risk': amountBad }"><MoneyText :value="amountNum" :decimals="dec" /></span>
          <span v-else class="e-num e-dim">—</span>
        </div>
        <div class="e-line">
          <span>{{ $t('msg.modern.send.fee') }}</span>
          <span v-if="feeNum > 0" class="e-num"><MoneyText :value="feeNum" :decimals="dec" /></span>
          <span v-else class="e-num e-dim">—</span>
        </div>
        <div class="e-total">
          <span>{{ $t('msg.modern.send.total') }}</span>
          <span v-if="summaryReady" class="e-num"><MoneyText :value="totalNum" :decimals="dec" /></span>
          <span v-else class="e-num" :class="amountBad ? 'e-risk' : 'e-dim'">—</span>
        </div>
        <div class="e-line">
          <span>{{ $t('msg.modern.send.left') }}</span>
          <span v-if="summaryReady" class="e-num e-dim"><MoneyText :value="leftNum" :decimals="dec" :updating="store.state.walletSync != 'synced'" /></span>
          <span v-else class="e-num e-dim">—</span>
        </div>
        <button
          type="submit"
          form="e-send-form"
          class="e-btn e-btn-primary e-btn-block e-send-review"
          :class="{ 'e-is-busy': reviewing }"
          :aria-busy="reviewing ? 'true' : null"
          :disabled="!canSend"
        >{{ $t('msg.modern.send.review') }}</button>
        <p class="e-help e-send-hint" role="status" aria-live="polite">{{ hint }}</p>
      </aside>
    </div>
  </div>

  <EDialog
    v-model:open="reviewOpen"
    :title="$t('msg.modern.send.review_title')"
    :description="$t('msg.modern.send.review_desc')"
    :dismissible="!isLoadingSend"
  >
    <template v-if="rv">
      <div class="e-rv-amount"><span class="e-num"><MoneyText :value="rv.amount" :decimals="rv.dec" :mono="false" /></span> <span class="e-unit">EPIC</span></div>
      <dl class="e-facts">
        <dt>{{ $t('msg.modern.send.to') }}</dt>
        <dd>
          <span>
            <b v-if="rv.name">{{ rv.name }}<br /></b>
            <span class="e-mono e-small e-dim e-addr-check" translate="no"><span class="e-hl">{{ rv.head }}</span>{{ rv.mid }}<span v-if="rv.tail" class="e-hl">{{ rv.tail }}</span>{{ rv.rest }}</span><br />
            <span class="e-faint e-small">{{ $t('msg.modern.send.check_addr') }}</span>
          </span>
        </dd>
        <dt>{{ $t('msg.modern.send.via') }}</dt>
        <dd>{{ $t('msg.modern.send.via_' + rv.kind) }}</dd>
        <dt>{{ $t('msg.modern.send.fee') }}</dt>
        <dd class="e-mono"><MoneyText v-if="rv.fee > 0" :value="rv.fee" :decimals="rv.dec" unit /><template v-else>—</template></dd>
        <dt>{{ $t('msg.modern.send.total') }}</dt>
        <dd class="e-mono"><b><MoneyText :value="rv.total" :decimals="rv.dec" unit /></b></dd>
        <template v-if="rv.message">
          <dt>{{ $t('msg.modern.send.message') }}</dt>
          <dd>{{ rv.message }}</dd>
        </template>
        <template v-if="rv.proof">
          <dt>{{ $t('msg.modern.send.proof_row') }}</dt>
          <dd>{{ $t('msg.modern.send.proof_requested') }}</dd>
        </template>
      </dl>
      <p v-if="isLoadingSend" class="e-help e-send-sending" role="status"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.modern.send.sending_status') }}</p>
    </template>
    <template #foot>
      <button type="button" class="e-btn e-btn-ghost" autofocus :disabled="isLoadingSend" @click="reviewOpen = false">{{ $t('msg.modern.send.back') }}</button>
      <button
        type="button"
        class="e-btn e-btn-primary"
        :class="{ 'e-is-busy': isLoadingSend }"
        :aria-busy="isLoadingSend ? 'true' : null"
        :disabled="isLoadingSend"
        @click="confirmSend"
      ><EIcon name="send" />{{ isLoadingSend || !rv ? $t('msg.modern.send.sending') : $t('msg.modern.send.send_amount', { n: rvAmountText }) }}</button>
    </template>
  </EDialog>
</template>

<script>
  import HttpSend from '@/components/HttpSend.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import MoneyText from '@/components/modern/ui/MoneyText.vue';
  import AmountField from '@/components/modern/form/AmountField.vue';
  import AddressField from '@/components/modern/form/AddressField.vue';
  import ProofAddressField from '@/components/modern/form/ProofAddressField.vue';
  import { formatEpic, nodeSyncPercent } from '@/components/modern/format';
  import { epicToNano, nanoToEpic } from '@/shared/sendMath';

  const HEAD = 6;
  /* how many decimals a typed amount or a number has, 4 to 8 */
  function decimalsOf(v) {
    const s = typeof v == 'number' ? v.toFixed(8).replace(/0+$/, '') : String(v || '').trim();
    const m = s.match(/[.,](\d*)$/);
    return Math.min(8, Math.max(4, m ? m[1].length : 0));
  }
  const TAIL = 6;

  export default reskin(HttpSend, {
    components: { EIcon, EDialog, MoneyText, AmountField, AddressField, ProofAddressField },
    data() {
      return {
        //the "Payment proof and privacy" disclosure
        advOpen: false,
        //mirrors the Dandelion++ checkbox (the Classic code reads the checkbox itself via ref="dandelion")
        dandelionOn: true,
        //the review dialog and what it shows (a snapshot taken when it opens)
        reviewOpen: false,
        rv: null,
        //"Review send" is checking the amount with the wallet
        reviewing: false,
      };
    },
    mounted() {
      //the Modern fields render a bare input: give the labels something to point at
      const to = this.$refs.toBox && this.$refs.toBox.querySelector('input');
      if (to) to.id = 'e-send-to';
      const proof = this.$refs.proofBox && this.$refs.proofBox.querySelector('input');
      if (proof) proof.id = 'e-send-proof';
    },
    watch: {
      //a message about a field goes away when the field changes (Classic keeps it until the next send)
      'addressField.input'() { this.clearError(this.addressField, 'address'); },
      'amountField.input'() { this.clearError(this.amountField, 'amount'); },
      'proofAddressField.input'() { this.clearError(this.proofAddressField, 'proof_address'); },
    },
    computed: {
      locale() { return this.$i18n ? this.$i18n.locale : 'en'; },
      /* what the user typed, as the Classic code sees it */
      toValue() { return ((this.addressField && this.addressField.input) || '').trim(); },
      /* the summary works in nanoepic (exact) and shows EPIC */
      amountNano() {
        const n = this.amountField ? this.amountField.amountNano : null;
        return n > 0 ? n : 0;
      },
      feeNano() {
        const f = this.amountField && this.amountField.feeNano;
        return this.amountNano > 0 && f > 0 ? f : 0;
      },
      spendableNano() { return epicToNano(Number(this.store.state.summary.spendable) || 0) || 0; },
      amountNum() { return nanoToEpic(this.amountNano); },
      feeNum() { return nanoToEpic(this.feeNano); },
      totalNum() { return nanoToEpic(this.amountNano + this.feeNano); },
      leftNum() { return nanoToEpic(this.spendableNano - this.amountNano - this.feeNano); },
      amountBad() {
        const err = this.amountField && this.amountField.errors && this.amountField.errors.amount;
        //the wallet said it has not enough for this amount and its fee
        const short = !!(this.feeNano && this.amountField.feeShort);
        //with a fee from the wallet, the wallet's answer counts (the balance on screen may be older)
        if (this.feeNano) return !!err || short;
        return !!err || this.amountNano > this.spendableNano;
      },
      summaryReady() { return this.amountNum > 0 && !this.amountBad; },
      unconfirmedText() { return formatEpic(this.store.state.summary.unconfirmed, { locale: this.locale }); },
      formHasErrors() {
        const a = this.amountField && this.amountField.errors && this.amountField.errors.amount;
        const t = this.addressField && this.addressField.errors && this.addressField.errors.address;
        const p = this.withproof && this.proofAddressField && this.proofAddressField.errors && this.proofAddressField.errors.proof_address;
        return !!(a || t || p);
      },
      canSend() { return this.nodeSynced && !(this.epicboxSelected && !this.epicboxConnected) && !this.sent },
      hint() {
        if (this.sent) return this.$t('msg.modern.send.hint_sent');
        if (!this.nodeSynced) return this.$t('msg.modern.send.hint_sync');
        if (this.epicboxSelected && !this.epicboxConnected) return this.$t('msg.modern.send.hint_epicbox');
        if (this.formHasErrors) return this.$t('msg.modern.send.hint_errors');
        return this.$t('msg.modern.send.hint_ok');
      },
      syncing() {
        const s = this.store.state.nodeStatus;
        return !!(s && !s.error && s.sync_status && s.sync_status !== 'synced');
      },
      syncPercent() { return nodeSyncPercent(this.store.state.nodeStatus, this.locale); },
      /* epicbox | tor | http, or '' while the field says nothing yet */
      recipientKind() {
        const v = this.toValue;
        if (!v) return '';
        if (this.epicboxSelected) return 'epicbox';
        if (/\.onion/i.test(v)) return 'tor';
        if (/^https?:/i.test(v)) return 'http';
        return '';
      },
      kindIcon() { return { epicbox: 'antenna', tor: 'tor', http: 'web' }[this.recipientKind] || 'web'; },
      /* the address book entry the field still holds the address of */
      contact() {
        const a = this.address;
        const v = this.toValue;
        if (!this.addressSelected || !a || !a.name || !v) return null;
        return [a.onion, a.externalOne, a.externalTwo].some(x => x && String(x).trim() === v) ? a : null;
      },
      contactInitials() {
        const words = String((this.contact && this.contact.name) || '').trim().split(/\s+/).filter(Boolean);
        return words.slice(0, 2).map(w => Array.from(w)[0]).join('').toUpperCase();
      },
      advState() {
        const p = this.withproof;
        const d = this.dandelionOn;
        return this.$t('msg.modern.send.' + (p && d ? 'adv_both' : p ? 'adv_proof' : d ? 'adv_dandelion' : 'adv_none'));
      },
      rvAmountText() { return this.rv ? formatEpic(this.rv.amount, { locale: this.locale, decimals: this.rv.dec }) : ''; },
      /* decimals to show: as many as the amount or the fee has (EPIC has 8), at least 4 */
      dec() { return Math.max(decimalsOf(this.amountField && this.amountField.input), decimalsOf(this.feeNum)); },
    },
    methods: {
      clearError(field, key) {
        if (field && field.errors && field.errors[key]) field.errors[key] = null;
      },
      clearTo() {
        this.addressField.setValue('');
        const i = this.$refs.toBox && this.$refs.toBox.querySelector('input');
        if (i) i.focus();
      },
      /* "Review send": the same checks the Classic Send button runs, then the confirmation */
      async review() {
        if (!this.canSend || this.isLoadingSend || this.reviewing) return;
        this.resetFormErrors();
        const valid = [];
        //the amount check asks the wallet for the fee of exactly this amount (and, after "All",
        //of spending every coin): that fee is the one shown below and charged by the send
        this.reviewing = true;
        try {
          valid.push(await this.amountField.validInput(this.store.state.summary.spendable));
        } finally {
          this.reviewing = false;
        }
        this.withproof ? valid.push(this.proofAddressField.validInput()) : null;
        valid.push(this.addressField.validInput());
        if (valid.includes(false)) {
          if (this.withproof && this.proofAddressField.errors && this.proofAddressField.errors.proof_address) this.advOpen = true;
          return;
        }
        const to = this.addressField.defaultValue;
        const kind = (this.epicboxSelected) ? 'epicbox' : /\.onion/i.test(to) ? 'tor' : 'http';
        const amountNano = this.amountField.amountNano;
        const feeNano = this.amountField.feeNano > 0 ? this.amountField.feeNano : 0;
        const amount = nanoToEpic(amountNano);
        const fee = nanoToEpic(feeNano);
        //an Epicbox address is compared on its key (before the @), any other address as a whole
        const at = kind == 'epicbox' ? to.indexOf('@') : -1;
        const key = at > 0 ? to.slice(0, at) : to;
        const rest = at > 0 ? to.slice(at) : '';
        const split = key.length > HEAD + TAIL + 4;
        this.rv = {
          name: this.contact ? this.contact.name : '',
          head: split ? key.slice(0, HEAD) : key,
          mid: split ? key.slice(HEAD, key.length - TAIL) : '',
          tail: split ? key.slice(-TAIL) : '',
          rest,
          kind,
          amount,
          fee,
          total: nanoToEpic(amountNano + feeNano),
          dec: Math.max(decimalsOf(this.amountField.defaultValue), decimalsOf(fee)),
          message: this.message,
          proof: this.withproof,
        };
        this.reviewOpen = true;
      },
      /* the dialog's Send button: the Classic send(), then the dialog goes away whatever the outcome */
      async confirmSend() {
        if (this.isLoadingSend || this.sent) return;
        try {
          await this.send();
        } finally {
          this.reviewOpen = false;
        }
      },
    },
  });
</script>
