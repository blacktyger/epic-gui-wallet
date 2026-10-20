<template>
  <!-- Classic Contacts (the Modern view, modern/views/ContactsView.vue, reskins this logic) -->
  <section class="section is-main-section cbook" :class="{ 'cbook-has-sel': paneOpen }">

    <div class="columns">
      <!-- the list -->
      <div class="column is-5 cbook-side">
        <section class="panel cbook-panel" :aria-label="$t('msg.modern.settings.contacts_list')">
          <div class="cbook-head">
            <span class="cbook-count" role="status">{{ $t('msg.modern.settings.contacts_count', addressList.length) }}</span>
            <button type="button" class="button is-primary is-small" @click="create()"><mdicon name="account-plus" size="18" /><span>{{ $t('msg.modern.settings.add_contact') }}</span></button>
          </div>
          <form class="cbook-tools" role="search" @submit.prevent="search">
            <label class="is-sr-only" for="cb-q">{{ $t('msg.modern.settings.search_contacts') }}</label>
            <div class="control has-icons-left is-expanded">
              <input id="cb-q" v-model="keyword" class="input" type="search" autocomplete="off" :placeholder="$t('msg.modern.settings.search_ph')" />
              <span class="icon is-left"><mdicon name="magnify" size="18" /></span>
            </div>
            <label class="is-sr-only" for="cb-sort">{{ $t('msg.contacts.sort_label') }}</label>
            <div class="select">
              <select id="cb-sort" v-model="sort">
                <option value="name">{{ $t('msg.contacts.sort_name') }}</option>
                <option value="recent">{{ $t('msg.contacts.sort_recent') }}</option>
              </select>
            </div>
          </form>

          <ul v-if="shownList.length" class="cbook-list">
            <li v-for="c in shownList" :key="c.id">
              <button type="button" class="cbook-row" :aria-current="isSelected(c) ? 'true' : null" @click="callAddress(c)">
                <ContactAvatar :name="c.name" :image="avatarOf(c)" size="md" />
                <span class="cbook-row-text">
                  <b>{{ c.name }}</b>
                  <small translate="no">{{ shortOf(c) }}</small>
                </span>
                <span class="cbook-row-meta">
                  <span v-for="k in kindsOf(c)" :key="k" class="tag is-small" :class="k == 'epicbox' ? 'is-warning is-light' : 'is-info is-light'">{{ $t('msg.contacts.kind_' + k) }}</span>
                  <small v-if="lastOf(c)">{{ lastOf(c) }}</small>
                </span>
              </button>
            </li>
          </ul>
          <div v-else-if="listReady && !addressList.length" class="cbook-empty">
            <mdicon name="account-box-multiple-outline" size="40" />
            <p><b>{{ $t('msg.modern.settings.empty_title') }}</b></p>
            <p>{{ $t('msg.modern.settings.empty_text') }}</p>
            <p class="is-size-7">{{ $t('msg.modern.settings.empty_note') }}</p>
          </div>
          <p v-else-if="listReady" class="cbook-empty">{{ $t('msg.modern.settings.no_results') }}</p>
        </section>
      </div>

      <div class="column is-7 cbook-main">
        <button v-if="paneOpen" type="button" class="button is-small is-text cbook-back" @click="cancel()"><mdicon name="arrow-left" size="18" /><span>{{ $t('msg.contacts.back') }}</span></button>

        <!-- new / edit -->
        <form v-if="isEditAddress || isNewAddress" class="card cbook-card" novalidate :aria-labelledby="'cb-form-t'" @submit.prevent="save()">
          <div class="card-content">
            <div class="cbook-hero">
              <ContactAvatar :name="name" :image="formImage" size="xl" />
              <div>
                <h2 id="cb-form-t" class="title is-5">{{ isNewAddress ? $t('msg.modern.settings.new_contact') : $t('msg.modern.settings.edit_contact') }}</h2>
                <p class="is-size-7">{{ $t('msg.modern.settings.edit_contact_hint') }}</p>
                <div class="cbook-pic">
                  <label class="button is-small" :class="{ 'is-loading': imageBusy }">
                    <input ref="imageInput" class="is-sr-only" type="file" :accept="imageAccept" :aria-describedby="'cb-pic-h'" @change="pickImage" />
                    <mdicon name="image-outline" size="16" /><span>{{ formImage ? $t('msg.contacts.picture_change') : $t('msg.contacts.picture_add') }}</span>
                  </label>
                  <button v-if="formImage" type="button" class="button is-small is-text" @click="removeImage()">{{ $t('msg.contacts.picture_remove') }}</button>
                </div>
                <p id="cb-pic-h" class="help" :class="{ 'is-danger': imageProblem }" :role="imageProblem ? 'alert' : null">{{ imageProblem ? $t('msg.contacts.picture_' + imageProblem) : $t('msg.contacts.picture_hint') }}</p>
              </div>
            </div>

            <div class="field">
              <label class="label" for="cb-f-name">{{ $t('msg.addressbook.name') }}</label>
              <input id="cb-f-name" ref="nameInput" v-model="name" class="input" :class="{ 'is-danger': errorOf('name') }" type="text" autocomplete="off" :aria-invalid="errorOf('name') ? 'true' : null" :aria-describedby="errorOf('name') ? 'cb-f-name-e' : null" @blur="touch('name')" />
              <p v-if="errorOf('name')" id="cb-f-name-e" class="help is-danger">{{ $t(errorOf('name')) }}</p>
            </div>
            <div class="field">
              <label class="label" for="cb-f-box">{{ $t('msg.contacts.epicbox_address') }}</label>
              <input id="cb-f-box" v-model="externalOne" class="input is-family-monospace" :class="{ 'is-danger': errorOf('externalOne') }" type="text" spellcheck="false" autocomplete="off" translate="no" :aria-invalid="errorOf('externalOne') ? 'true' : null" aria-describedby="cb-f-box-h" @blur="touch('externalOne')" />
              <p id="cb-f-box-h" class="help" :class="{ 'is-danger': errorOf('externalOne') }">{{ errorOf('externalOne') ? $t(errorOf('externalOne')) : $t('msg.contacts.hint_epicbox') }}</p>
            </div>
            <div class="field">
              <label class="label" for="cb-f-ext">{{ $t('msg.contacts.http_address') }} <span class="has-text-weight-normal is-size-7">{{ $t('msg.contacts.optional') }}</span></label>
              <input id="cb-f-ext" v-model="externalTwo" class="input is-family-monospace" :class="{ 'is-danger': errorOf('externalTwo') }" type="text" spellcheck="false" autocomplete="off" translate="no" :aria-invalid="errorOf('externalTwo') ? 'true' : null" aria-describedby="cb-f-ext-h" @blur="touch('externalTwo')" />
              <p id="cb-f-ext-h" class="help" :class="{ 'is-danger': errorOf('externalTwo') }">{{ errorOf('externalTwo') ? $t(errorOf('externalTwo')) : $t('msg.contacts.hint_http') }}</p>
            </div>
            <div class="columns is-mobile">
              <div class="column field">
                <label class="label" for="cb-f-country">{{ $t('msg.addressbook.country') }}</label>
                <input id="cb-f-country" v-model="country" class="input" type="text" autocomplete="off" />
              </div>
              <div class="column field">
                <label class="label" for="cb-f-city">{{ $t('msg.addressbook.city') }}</label>
                <input id="cb-f-city" v-model="city" class="input" type="text" autocomplete="off" />
              </div>
            </div>
            <div class="field">
              <label class="label" for="cb-f-note">{{ $t('msg.contacts.note') }} <span class="has-text-weight-normal is-size-7">{{ $t('msg.modern.settings.notice_optional') }}</span></label>
              <textarea id="cb-f-note" v-model="notice" class="textarea" rows="3"></textarea>
            </div>
          </div>
          <footer class="card-footer cbook-foot">
            <button type="submit" class="button is-primary" :class="{ 'is-loading': saving }" :disabled="saving || imageBusy">{{ $t('msg.save') }}</button>
            <button type="button" class="button" @click="cancel()">{{ $t('msg.cancel') }}</button>
          </footer>
        </form>

        <!-- one contact -->
        <div v-else-if="addressLoaded" class="card cbook-card" role="region" aria-labelledby="cb-name">
          <div class="card-content">
            <div class="cbook-hero">
              <ContactAvatar :name="name" :image="avatarOf(selectedAddress)" size="xl" />
              <div>
                <h2 id="cb-name" class="title is-4">{{ name }}</h2>
                <p v-if="place" class="is-size-7">{{ place }}</p>
                <p v-if="selectedLast" class="is-size-7">{{ selectedLast }}</p>
              </div>
            </div>
            <div class="buttons cbook-actions">
              <button v-for="a in selectedSendable" :key="a.field" type="button" class="button is-primary" @click="sendTo(a.field)">
                <mdicon name="send" size="18" /><span>{{ selectedSendable.length > 1 ? $t('msg.contacts.send_' + a.kind) : $t('msg.contacts.send') }}</span>
              </button>
              <button type="button" class="button" @click="edit()"><mdicon name="pencil" size="18" /><span>{{ $t('msg.edit') }}</span></button>
              <button type="button" class="button is-danger is-outlined cbook-del-btn" :aria-label="$t('msg.modern.settings.delete_contact')" :title="$t('msg.modern.settings.delete_contact')" @click="trashModalOpen(selectedAddress)"><mdicon name="delete-outline" size="18" /></button>
            </div>

            <dl class="cbook-facts">
              <div v-for="a in selectedAddresses" :key="a.field">
                <dt>{{ $t('msg.contacts.' + a.kind + '_address') }}</dt>
                <dd class="cbook-addr">
                  <code translate="no">{{ a.address }}</code>
                  <button type="button" class="button is-small" :aria-label="$t('msg.modern.settings.copy_field', { what: $t('msg.contacts.' + a.kind + '_address') })" @click="copy(a.address, a.field)">
                    <mdicon :name="copied == a.field ? 'check' : 'content-copy'" size="16" /><span>{{ copied == a.field ? $t('msg.contacts.copied') : $t('msg.contacts.copy') }}</span>
                  </button>
                </dd>
              </div>
              <div v-if="notice">
                <dt>{{ $t('msg.contacts.note') }}</dt>
                <dd class="cbook-note">{{ notice }}</dd>
              </div>
            </dl>

            <h3 class="title is-6 cbook-txs-t">{{ $t('msg.contacts.txs_title', { name }) }}</h3>
            <ul v-if="selectedTxs.length" class="cbook-txs">
              <li v-for="tx in selectedTxs" :key="tx.id">
                <mdicon :name="tx.tx_type && tx.tx_type.indexOf('Sent') != -1 ? 'arrow-top-right' : 'arrow-bottom-left'" size="16" />
                <span>{{ txWhen(tx) }}</span>
                <span class="cbook-txs-amt">{{ txAmount(tx) }} EPIC</span>
              </li>
            </ul>
            <p v-else class="is-size-7">{{ $t('msg.contacts.txs_none') }}</p>
          </div>
        </div>

        <div v-else-if="addressList.length" class="cbook-pick">{{ $t('msg.modern.settings.pick_contact') }}</div>
      </div>
    </div>

    <!-- delete: a quiet confirmation -->
    <div class="modal" :class="{ 'is-active': isModalActive }" role="alertdialog" aria-modal="true" aria-labelledby="cb-del-t" aria-describedby="cb-del-d" @keydown.esc="trashCancel" @keydown.tab="trapDelete">
      <div class="modal-background" @click="trashCancel"></div>
      <div class="modal-card cbook-del">
        <section class="modal-card-body">
          <p id="cb-del-t" class="title is-5">{{ $t('msg.modern.settings.delete_title', { name: trashObject ? trashObject.name : '' }) }}</p>
          <p id="cb-del-d">{{ $t('msg.modern.settings.delete_desc') }}</p>
        </section>
        <footer class="modal-card-foot">
          <button ref="keepBtn" type="button" class="button" @click="trashCancel">{{ $t('msg.modern.settings.keep_contact') }}</button>
          <button ref="delBtn" type="button" class="button is-danger" @click="trashConfirm">{{ $t('msg.modern.settings.delete_contact') }}</button>
        </footer>
      </div>
    </div>
  </section>
</template>
<script>

import { ref } from 'vue';
import { useStore } from '@/store';
import ContactAvatar from '@/components/ContactAvatar.vue';
import {
  contactFields, contactProblems, searchContacts, sortContacts, contactActivity, contactTransactions,
  contactAddresses, sendableAddresses, shortAddress, SORTS,
} from '@/shared/contacts.js';
import { makeAvatar, ACCEPT } from '@/shared/avatarImage.js';
import { contactAvatars } from '@/shared/contactAvatars.js';
import { isOnionAddress } from '@/shared/sendForm.js';

const SORT_KEY = 'epic.contacts.sort';
function savedSort() {
  try {
    const v = window.localStorage.getItem(SORT_KEY);
    return SORTS.includes(v) ? v : 'name';
  } catch (e) {
    return 'name';
  }
}

/* a field's problem → the message it shows (contactProblems) */
const FIELD_ERRORS = {
  name: [['name', 'msg.contacts.err_name']],
  externalOne: [['onionBox', 'msg.contacts.err_onion'], ['epicbox', 'msg.contacts.err_epicbox'], ['address', 'msg.contacts.err_address']],
  externalTwo: [['onionWeb', 'msg.contacts.err_onion'], ['http', 'msg.contacts.err_http']],
};

export default {
  name: "addressBook",
  components: { ContactAvatar },

  setup() {

    const id = ref(0);
    const name = ref('');
    const country = ref('');
    const city = ref('');

    //a Tor address, a payment proof address and "always ask for a proof" an older version stored:
    //no longer shown or edited, but kept on save
    const onion = ref('');
    const alwaysproof = ref(false);
    const proofaddr = ref('');
    const addressList = ref([]);
    const externalOne = ref('');
    const externalTwo = ref('');
    const notice = ref('');

    const isEditAddress = ref(false);
    const isNewAddress = ref(false);

    const selectedAddress = ref({});

    const addressLoaded = ref(false);
    const isModalActive = ref(false);
    const trashObject = ref(null);

    const keyword = ref("");
    const searched = ref(false);

    const store = useStore();

    return {
      store,
      id,
      name,
      country,
      city,
      onion,
      alwaysproof,
      proofaddr,
      externalOne,
      externalTwo,
      notice,
      addressList,
      isEditAddress,
      addressLoaded,
      isNewAddress,
      isModalActive,
      trashObject,
      selectedAddress,
      keyword,
      searched
    }

  },
  data() {
    return {
      //set once the first list has arrived, so the empty state does not flash while it loads
      listReady: false,
      sort: savedSort(),
      //contact id → picture (data: URL); a plain object so a new one shows at once
      avatars: {},
      //the form's picture: what Save keeps ('' = none); formImageChanged: picked or removed in this form
      formImage: '',
      formImageChanged: false,
      imageBusy: false,
      imageProblem: '',
      imageAccept: ACCEPT,
      //fields left once (their message shows from then on); tried: Save was pressed
      touched: {},
      tried: false,
      saving: false,
      //the address just copied (its button says so for a moment)
      copied: '',
    };
  },
  async created(){
    await this.reload();
    this.listReady = true;
    this.loadAvatars();
  },
  beforeUnmount(){
    clearTimeout(this.copiedTimer);
  },
  watch: {
    sort(v){
      try { window.localStorage.setItem(SORT_KEY, v); } catch (e) { /* only a convenience */ }
    },
    //the search is live: typing filters the list (searched: a search is on, for the clear button)
    keyword(v){
      this.searched = String(v || '').trim() != '';
    },
  },
  computed: {
    locale(){ return (this.$i18n && this.$i18n.locale) || 'en'; },
    avatarStore(){ return this.$contactAvatars || contactAvatars(); },
    activity(){ return contactActivity(this.store.state.txs); },
    /* what the list shows: the search, then the chosen order */
    shownList(){
      return sortContacts(searchContacts(this.addressList, this.keyword), this.sort, this.activity, this.locale);
    },
    /* the detail or the form is open (on a narrow window it takes the place of the list) */
    paneOpen(){ return this.addressLoaded || this.isEditAddress || this.isNewAddress; },
    place(){ return [this.city, this.country].filter(Boolean).join(', '); },
    problems(){
      const p = contactProblems(this.formFields());
      //a Tor address gets its own message, under the field that holds it
      if (isOnionAddress(this.externalOne)) p.onionBox = true;
      if (isOnionAddress(this.externalTwo)) p.onionWeb = true;
      return p;
    },
    selectedAddresses(){ return contactAddresses(this.selectedAddress); },
    /* the ones a Send button is offered for (not a Tor address) */
    selectedSendable(){ return sendableAddresses(this.selectedAddress); },
    selectedTxs(){ return contactTransactions(this.store.state.txs, this.selectedAddress && this.selectedAddress.id).slice(0, 5); },
    selectedLast(){ return this.selectedAddress && this.selectedAddress.id ? this.lastOf(this.selectedAddress) : ''; },
  },

  methods: {
    async reload(){
      try{
        this.addressList = await this.$addressBookService.getAddress(this.store.state.user.id) || [];
      }catch(e){
        console.error('contacts not read', e);
        this.addressList = [];
      }
    },
    async loadAvatars(){
      const map = await this.avatarStore.forUser(this.store.state.user.id);
      //merged: a picture saved while this read was on its way stays
      const out = {};
      for (const [k, v] of map) out[k] = v;
      this.avatars = { ...out, ...this.avatars };
      if (this.selectedAddress && this.selectedAddress.id && !this.formImageChanged) this.formImage = this.avatars[this.selectedAddress.id] || '';
    },
    avatarOf(c){ return (c && this.avatars[c.id]) || ''; },
    kindsOf(c){ return contactAddresses(c).map(a => a.kind); },
    shortOf(c){
      const a = contactAddresses(c)[0];
      return a ? shortAddress(a.address) : '';
    },
    /* "Last transaction: yesterday" from the newest linked transaction, or '' */
    lastOf(c){
      const a = this.activity.get(Number(c && c.id));
      if (!a || !a.last) return '';
      return this.$t('msg.contacts.last_tx', { when: this.whenText(a.last) });
    },
    /* "today", "yesterday", "3 days ago", then "12 Oct" (and the year when it is not this year) */
    whenText(ms){
      const d = new Date(ms);
      if (isNaN(d)) return '';
      const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const days = Math.round((start(new Date()) - start(d)) / 86400000);
      if (days >= 0 && days < 7) {
        try {
          return new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto' }).format(-days, 'day');
        } catch (e) { /* the date below */ }
      }
      const opts = { day: 'numeric', month: 'short' };
      if (d.getFullYear() != new Date().getFullYear()) opts.year = 'numeric';
      return new Intl.DateTimeFormat(this.locale, opts).format(d);
    },
    txWhen(tx){ return this.whenText(Date.parse(tx.creation_ts)); },
    txAmount(tx){
      const n = (Number(tx.amount_credited) - Number(tx.amount_debited)) / 100000000;
      if (!isFinite(n)) return '';
      return (n > 0 ? '+' : '') + n.toLocaleString(this.locale, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
    },
    isSelected(address){
      return (this.addressLoaded || this.isEditAddress) && this.id == address.id;
    },
    /* the message key a field shows now, or null: once it was left, or Save was pressed */
    errorOf(field){
      if (!this.tried && !this.touched[field]) return null;
      const hit = (FIELD_ERRORS[field] || []).find(([k]) => this.problems[k]);
      return hit ? hit[1] : null;
    },
    touch(field){
      //an empty field just passed through on the way is not an error yet
      if (this[field] && String(this[field]).trim()) this.touched = { ...this.touched, [field]: true };
    },
    async search(){
      //the list follows the search as you type (shownList); Enter keeps it
      this.searched = this.keyword.trim() != '';
    },
    async clearup(keepKeyword){
      if(!keepKeyword){
        this.keyword = '';
      }
      this.searched = false;
    },
    trashModalOpen(obj){
      this.trashObject = obj
      this.isModalActive = true
      this.$nextTick(() => { if (this.$refs.keepBtn) this.$refs.keepBtn.focus(); });
    },

    /* Tab stays between the delete dialog's two buttons */
    trapDelete(e){
      const a = this.$refs.keepBtn, b = this.$refs.delBtn;
      if (!a || !b) return;
      e.preventDefault();
      (document.activeElement === a ? b : a).focus();
    },

    trashConfirm(){
      this.isModalActive = false
      this.deleteAddress(this.trashObject.id);
    },

    trashCancel(){
      this.isModalActive = false
      //Classic's modal: back to the contact's delete button (Modern's dialog does this itself)
      this.$nextTick(() => {
        const b = document.querySelector('.cbook-del-btn');
        if (b && b.focus) b.focus();
      });
    },
    copy(text, field){
      window.clipboard.writeText(text);
      this.$toast.show(this.$t("msg.copy_to_clipboard"), {duration:1000});
      this.copied = field || text;
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => { this.copied = ''; }, 1600);
    },
    /* Send, opened on this contact's address (HttpSend.vue reads the contact by its id) */
    sendTo(field){
      const c = this.selectedAddress;
      if (!c || !c.id) return;
      const use = field || (sendableAddresses(c)[0] || {}).field;
      if (!use) return;
      this.$router.push({ name: 'httpSend', query: { contact: String(c.id), use } });
    },
    callAddress(addressItem){

      //a contact picked from the list is shown, not loaded into an open New/Edit form (a refused
      //save left "New contact" open, and saving it again made a copy of the picked contact)
      this.isNewAddress = false;
      this.isEditAddress = false;
      this.selectedAddress = addressItem;
      this.id = addressItem.id;
      this.name = addressItem.name;
      this.country = addressItem.country;
      this.city = addressItem.city;
      this.onion = addressItem.onion;
      this.alwaysproof = addressItem.alwaysproof;
      this.proofaddr = addressItem.proofaddr;
      this.externalOne = addressItem.externalOne;
      this.externalTwo = addressItem.externalTwo;
      this.notice = addressItem.notice;
      this.resetForm();

      this.addressLoaded = true;

    },
    resetForm(){
      //a picture still being made belongs to the form it was picked in, not to the next one
      this.formSeq = (this.formSeq || 0) + 1;
      this.imageBusy = false;
      this.touched = {};
      this.tried = false;
      this.imageProblem = '';
      this.formImageChanged = false;
      this.formImage = this.avatarOf(this.selectedAddress);
    },
    edit(){
      this.resetForm();
      this.isEditAddress = true;
      this.isNewAddress = false;
      this.focusName();
    },
    cancel(){
      //Cancel on Edit goes back to the contact as it was; on New (or the detail) to the list
      if (this.isEditAddress && this.selectedAddress && this.selectedAddress.id) {
        this.callAddress(this.selectedAddress);
        return;
      }
      this.isEditAddress = false;
      this.isNewAddress = false;
      this.addressLoaded = false;
      this.selectedAddress = {};
      this.id = 0;
    },
    create(){

      this.id = 0;
      this.name = '';
      this.country = '';
      this.city = '';
      this.onion = '';
      this.alwaysproof = false;
      this.proofaddr = '';
      this.selectedAddress = {};
      this.addressLoaded = false;
      this.isEditAddress = false;
      this.isNewAddress = true;
      this.externalOne = '';
      this.externalTwo = '';
      this.notice = '';
      this.resetForm();
      this.focusName();

    },
    focusName(){
      this.$nextTick(() => {
        const el = this.$refs.nameInput || document.getElementById('con-f-name');
        if (el && el.focus) el.focus();
      });
    },
    /* the picture input: the file is checked, decoded and re-encoded here (shared/avatarImage.js);
       nothing of the original file is kept */
    async pickImage(event){
      const input = event && event.target;
      const file = input && input.files && input.files[0];
      if (input) input.value = '';
      if (!file) return;
      const seq = this.formSeq;
      this.imageBusy = true;
      this.imageProblem = '';
      try{
        const r = await makeAvatar(file);
        //another contact (or a new one) was opened meanwhile: this picture is not for it
        if (seq !== this.formSeq) return;
        if (r.dataUrl) {
          this.formImage = r.dataUrl;
          this.formImageChanged = true;
        } else {
          this.imageProblem = r.problem || 'decode';
        }
      }catch(e){
        console.error('contact picture not made', e);
        if (seq === this.formSeq) this.imageProblem = 'decode';
      }finally{
        if (seq === this.formSeq) this.imageBusy = false;
      }
    },
    removeImage(){
      this.formImage = '';
      this.formImageChanged = true;
      this.imageProblem = '';
    },
    async saveImage(contactId){
      if (!this.formImageChanged || !contactId) return;
      const userId = this.store.state.user.id;
      try{
        if (this.formImage) {
          if (!await this.avatarStore.set(userId, contactId, this.formImage)) throw new Error('picture refused by the store');
        } else {
          await this.avatarStore.remove(userId, contactId);
        }
        this.avatars = { ...this.avatars, [contactId]: this.formImage || undefined };
      }catch(e){
        console.error('contact picture not saved', e);
        this.$toast.error(this.$t('msg.contacts.picture_not_saved'));
      }
      this.formImageChanged = false;
    },
    async deleteAddress(id){

      if(id){
        let deleted = await this.$addressBookService.removeAddress(id);
        if(deleted){
          this.$toast.show(this.$t("msg.contacts.deleted", { name: this.trashObject ? this.trashObject.name : '' }), {duration:2000});
          try{ await this.avatarStore.remove(this.store.state.user.id, id); }catch(e){ console.error('contact picture not removed', e); }
          await this.reload();
          this.isEditAddress = false;
          this.selectedAddress = {};
          this.isNewAddress = false;
          this.addressLoaded = false;
          this.id = 0;
          //the focus was on the dialog's button: back to the list's search field
          this.$nextTick(() => {
            const q = document.getElementById('con-q') || document.getElementById('cb-q');
            if (q && q.focus) q.focus();
          });
        }else{
          this.$toast.error(this.$t("msg.addressbook.error_delete"), {duration:1000});
        }
      }

    },
    //refuse a contact with no name, no address, or an address that isn't one (QA T04): the form says
    //which field, and the first one gets the focus
    contactOk(){
      this.tried = true;
      const field = ['name', 'externalOne', 'externalTwo'].find(f => this.errorOf(f));
      if(field){
        const ids = { name: ['cb-f-name', 'con-f-name'], externalOne: ['cb-f-box', 'con-f-box'], externalTwo: ['cb-f-ext', 'con-f-ext'] }[field];
        this.$nextTick(() => {
          //by id: the Modern view has two root nodes, so $el is not an element there
          const el = ids.map(i => document.getElementById(i)).find(Boolean);
          if (el && el.focus) el.focus();
        });
        return false;
      }
      return true;
    },
    /* the form's fields as a save writes them (shared/contacts.js) */
    formFields(){
      return contactFields({
        name: this.name,
        country: this.country,
        city: this.city,
        onion: this.onion,
        alwaysproof: this.alwaysproof,
        proofaddr: this.proofaddr,
        externalOne: this.externalOne,
        externalTwo: this.externalTwo,
        notice: this.notice
      });
    },
    trimmedFields(){
      const f = this.formFields();
      for (const k of ['name', 'externalOne', 'externalTwo']) f[k] = f[k].trim();
      return f;
    },
    save(){
      return this.isNewAddress ? this.addAddress() : this.updateAddressById();
    },
    /* after a save: the list again, and the saved contact shown */
    async showSaved(id){
      await this.reload();
      this.keyword = '';
      this.searched = false;
      const row = this.addressList.find(c => c.id == id);
      if (row) this.callAddress(row);
      else this.cancel();
    },
    async updateAddressById(){
      if(this.saving || !this.contactOk()) return;

      let updated;
      this.saving = true;
      try{
        updated = await this.$addressBookService.updateAddressById(this.id, this.trimmedFields());
      }catch(e){
        console.error('contact not saved', e);
      }
      if(updated){
        await this.saveImage(this.id);
        this.isEditAddress = false;
        await this.showSaved(this.id);
      }else{
        this.$toast.error(this.$t("msg.addressbook.error_save"));
      }
      this.saving = false;

    },
    async addAddress(){
      if(this.saving || !this.contactOk()) return;

      let inserted;
      this.saving = true;
      try{
        inserted = await this.$addressBookService.addAddress({
          ...this.trimmedFields(),
          user_id: this.store.state.user.id
        });
      }catch(e){
        //e.g. no saved User row (user.id): nothing is written
        console.error('contact not saved', e);
      }
      if(inserted && inserted.length){
        const newId = inserted[0].id;
        await this.saveImage(newId);
        this.isNewAddress = false;
        this.isEditAddress = false;
        await this.showSaved(newId);
      }else{
        this.$toast.error(this.$t("msg.addressbook.error_save"));
      }
      this.saving = false;

    }

  }


}

</script>

<style>
  .cbook-panel { overflow: hidden; }
  .cbook-head { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 0.75rem 0; }
  .cbook-head .button { margin-inline-start: auto; }
  .cbook-head .button span + span, .cbook .button .mdi + span { margin-inline-start: 0.35rem; }
  .cbook-count { font-size: 0.85rem; opacity: 0.8; }
  .cbook-tools { display: flex; gap: 0.5rem; padding: 0.75rem; }
  .cbook-tools .control { flex: 1; min-width: 0; }
  .cbook-list { list-style: none; margin: 0; padding: 0 0.4rem 0.5rem; max-height: calc(100vh - 16rem); overflow-y: auto; }
  .cbook-row {
    display: flex; align-items: center; gap: 0.75rem; width: 100%; min-height: 3.5rem;
    padding: 0.5rem 0.6rem; border: 0; border-radius: 8px; background: transparent; color: inherit;
    text-align: start; cursor: pointer; font: inherit;
  }
  .cbook-row:hover { background: rgba(255, 255, 255, 0.05); }
  .cbook-row[aria-current='true'] { background: rgba(255, 255, 255, 0.1); }
  .cbook-row:focus-visible { outline: 2px solid #f6d471; outline-offset: -2px; }
  .cbook-row-text { flex: 1; min-width: 0; }
  .cbook-row-text b, .cbook-row-text small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cbook-row-text small { font-family: monospace; font-size: 0.75rem; opacity: 0.75; }
  .cbook-row-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem; flex: none; }
  .cbook-row-meta small { font-size: 0.7rem; opacity: 0.7; white-space: nowrap; }
  .cbook-empty, .cbook-pick { padding: 1.5rem 1rem; text-align: center; opacity: 0.85; }
  .cbook-empty p + p { margin-top: 0.4rem; }
  .cbook-hero { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1.25rem; }
  .cbook-hero > div { min-width: 0; }
  .cbook-hero .title { margin-bottom: 0.25rem; overflow-wrap: anywhere; }
  .cbook-pic { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.6rem; }
  .cbook-pic label.button { cursor: pointer; }
  .cbook-pic label.button:focus-within { outline: 2px solid #f6d471; outline-offset: 2px; }
  .cbook-actions { margin-bottom: 1.25rem; }
  .cbook-facts > div + div { margin-top: 1rem; }
  .cbook-facts dt { font-size: 0.8rem; opacity: 0.75; margin-bottom: 0.25rem; }
  .cbook-addr { display: flex; align-items: center; gap: 0.5rem; }
  .cbook-addr code { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 0.8rem; background: transparent; padding: 0; color: inherit; }
  .cbook-addr .button { flex: none; }
  .cbook-note { white-space: pre-wrap; overflow-wrap: anywhere; }
  .cbook-txs-t { margin-top: 1.5rem; margin-bottom: 0.5rem !important; }
  .cbook-txs { list-style: none; margin: 0; padding: 0; }
  .cbook-txs li { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; border-top: 1px solid rgba(255, 255, 255, 0.08); }
  .cbook-txs-amt { margin-inline-start: auto; font-family: monospace; }
  .cbook-foot { display: flex; gap: 0.5rem; padding: 0.75rem 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.08); }
  .cbook-del { max-width: 28rem; }
  .cbook .cbook-back.button { display: none; }
  .cbook-actions .cbook-del-btn { margin-inline-start: auto; }
  @media (max-width: 768px) {
    .cbook-has-sel .cbook-side { display: none; }
    .cbook .cbook-back.button { display: inline-flex; margin-bottom: 0.5rem; }
    .cbook-list { max-height: none; }
  }
</style>
