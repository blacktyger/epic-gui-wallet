<template>
  <!-- Classic Send: choose a contact for the recipient field (the Modern one: modern/send/ContactPicker.vue) -->
  <div v-if="open" class="modal is-active cpick" role="dialog" aria-modal="true" aria-labelledby="cpick-t" @keydown.esc.stop="$emit('close')" @keydown.tab="trap">
    <div class="modal-background" @click="$emit('close')"></div>
    <div ref="card" class="modal-card">
      <header class="modal-card-head">
        <p id="cpick-t" class="modal-card-title">{{ $t('msg.contacts.picker_title') }}</p>
        <button type="button" class="delete" :aria-label="$t('msg.close')" @click="$emit('close')"></button>
      </header>
      <section class="modal-card-body">
        <p class="is-size-7 cpick-desc">{{ $t('msg.contacts.picker_desc') }}</p>
        <div v-if="contacts.length" class="control has-icons-left">
          <label class="is-sr-only" for="cpick-q">{{ $t('msg.contacts.picker_search') }}</label>
          <input id="cpick-q" ref="search" v-model="keyword" class="input" type="search" autocomplete="off" :placeholder="$t('msg.modern.settings.search_ph')" @keydown.enter.prevent="pickFirst" />
          <span class="icon is-left"><mdicon name="magnify" size="18" /></span>
        </div>

        <p v-if="loading" class="cpick-note" role="status">{{ $t('msg.contacts.loading') }}</p>
        <div v-else-if="!contacts.length" class="cpick-note">
          <p><b>{{ $t('msg.contacts.picker_empty_title') }}</b></p>
          <p>{{ $t('msg.contacts.picker_empty_text') }}</p>
          <router-link ref="manage" to="/addressBook" class="button is-primary is-small">{{ $t('msg.contacts.picker_manage') }}</router-link>
        </div>
        <p v-else-if="!shown.length" class="cpick-note" role="status">{{ $t('msg.contacts.picker_none', { q: keyword.trim() }) }}</p>
        <ul v-else class="cpick-list" :aria-label="$t('msg.modern.settings.contacts_list')">
          <li v-for="c in shown" :key="c.id">
            <button type="button" class="cbook-row" @click="$emit('pick', c, addressesOf(c)[0].field)">
              <ContactAvatar :name="c.name" :image="avatars[c.id] || ''" size="md" />
              <span class="cbook-row-text">
                <b>{{ c.name }}</b>
                <small translate="no">{{ short(addressesOf(c)[0].address) }}</small>
              </span>
              <span class="tag is-small" :class="addressesOf(c)[0].kind == 'epicbox' ? 'is-warning is-light' : 'is-info is-light'">{{ $t('msg.contacts.kind_' + addressesOf(c)[0].kind) }}</span>
            </button>
            <button v-if="addressesOf(c).length > 1" type="button" class="button is-small is-text cpick-alt" :aria-label="$t('msg.contacts.use_http_label', { name: c.name })" @click="$emit('pick', c, addressesOf(c)[1].field)">{{ $t('msg.contacts.use_http') }}</button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script>
  import ContactAvatar from '@/components/ContactAvatar.vue';
  import { pickableContacts, sendableAddresses as contactAddresses, shortAddress, sortContacts } from '@/shared/contacts.js';

  export default {
    name: 'ContactPickerModal',
    components: { ContactAvatar },
    props: {
      open: { type: Boolean, default: false },
      contacts: { type: Array, default: () => [] },
      avatars: { type: Object, default: () => ({}) },
      loading: { type: Boolean, default: false },
    },
    emits: ['pick', 'close'],
    data() {
      return { keyword: '' };
    },
    computed: {
      shown() {
        const locale = (this.$i18n && this.$i18n.locale) || 'en';
        return sortContacts(pickableContacts(this.contacts, this.keyword), 'name', new Map(), locale);
      },
    },
    watch: {
      open(v) {
        if (v) {
          this.keyword = '';
          this.focusFirst();
        }
      },
      loading(v) { if (!v && this.open) this.focusFirst(); },
    },
    methods: {
      addressesOf(c) { return contactAddresses(c); },
      short(a) { return shortAddress(a); },
      focusFirst() {
        this.$nextTick(() => {
          const el = this.$refs.search || (this.$refs.card && this.$refs.card.querySelector('a, button'));
          if (el && el.focus) el.focus();
        });
      },
      pickFirst() {
        const c = this.shown[0];
        if (c) this.$emit('pick', c, contactAddresses(c)[0].field);
      },
      /* Tab stays inside the dialog */
      trap(e) {
        const items = Array.from(this.$refs.card ? this.$refs.card.querySelectorAll('button, input, a[href]') : []).filter((x) => !x.disabled);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement == first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement == last) { e.preventDefault(); first.focus(); }
      },
    },
  };
</script>

<style>
  .cpick .modal-card { max-width: 32rem; width: calc(100vw - 2rem); }
  .cpick-desc { margin-bottom: 0.75rem; }
  .cpick-note { padding: 1rem 0.25rem; text-align: center; }
  .cpick-note p + p, .cpick-note p + .button { margin-top: 0.5rem; }
  .cpick-list { list-style: none; margin: 0.75rem 0 0; padding: 0; }
  .cpick-list li { display: flex; align-items: center; gap: 0.25rem; }
  .cpick-list .cbook-row { flex: 1; min-width: 0; }
  .cpick-alt { flex: none; }
</style>
