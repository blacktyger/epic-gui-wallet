<template>
  <!-- Modern Send: choose a contact for the recipient field (Classic: components/ContactPickerModal.vue) -->
  <EDialog
    :open="open"
    class="e-cpick"
    :title="$t('msg.contacts.picker_title')"
    :description="$t('msg.contacts.picker_desc')"
    @close="$emit('close')"
  >
    <div v-if="contacts.length" class="e-input-wrap e-has-lead e-cpick-search">
      <span class="e-lead"><EIcon name="search" size="sm" /></span>
      <label class="e-sr-only" for="e-cpick-q">{{ $t('msg.contacts.picker_search') }}</label>
      <input id="e-cpick-q" ref="search" v-model="keyword" class="e-input" type="search" autocomplete="off" autofocus :placeholder="$t('msg.modern.settings.search_ph')" @keydown.enter.prevent="pickFirst" @keydown.down.prevent="moveFrom(-1, 1)" />
    </div>

    <p v-if="loading" class="e-cpick-note e-dim" role="status"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.contacts.loading') }}</p>
    <div v-else-if="!contacts.length" class="e-empty e-cpick-empty">
      <div class="e-glyph"><EIcon name="contacts" /></div>
      <h3>{{ $t('msg.contacts.picker_empty_title') }}</h3>
      <p>{{ $t('msg.contacts.picker_empty_text') }}</p>
      <div class="e-row"><router-link to="/addressBook" class="e-btn e-btn-primary e-btn-sm"><EIcon name="userplus" />{{ $t('msg.contacts.picker_manage') }}</router-link></div>
    </div>
    <p v-else-if="!shown.length" class="e-cpick-note e-dim" role="status">{{ $t('msg.contacts.picker_none', { q: keyword.trim() }) }}</p>
    <ul v-else ref="list" class="e-cpick-list" :aria-label="$t('msg.modern.settings.contacts_list')">
      <li v-for="(c, i) in shown" :key="c.id" class="e-cpick-item">
        <button type="button" class="e-cpick-row" @click="$emit('pick', c, first(c).field)" @keydown.down.prevent="moveFrom(i, 1)" @keydown.up.prevent="moveFrom(i, -1)">
          <ContactAvatar :name="c.name" :image="avatars[c.id] || ''" size="md" />
          <span class="e-cpick-text">
            <b>{{ c.name }}</b>
            <small translate="no">{{ short(first(c).address) }}</small>
          </span>
          <span class="e-tag" :class="{ 'e-gold': first(c).kind == 'epicbox' }"><EIcon :name="first(c).kind == 'epicbox' ? 'antenna' : 'web'" />{{ first(c).kind == 'tor' ? $t('msg.modern.settings.tor.kind') : $t('msg.contacts.kind_' + first(c).kind) }}</span>
        </button>
        <button v-if="addressesOf(c).length > 1" type="button" class="e-btn e-btn-ghost e-btn-sm e-cpick-alt" :aria-label="$t('msg.contacts.use_http_label', { name: c.name })" @click="$emit('pick', c, addressesOf(c)[1].field)"><EIcon name="web" size="sm" />{{ $t('msg.contacts.use_http') }}</button>
      </li>
    </ul>
    <template #foot>
      <router-link v-if="contacts.length" to="/addressBook" class="e-btn e-btn-ghost e-btn-sm">{{ $t('msg.contacts.picker_manage') }}</router-link>
      <button type="button" class="e-btn e-btn-ghost" @click="$emit('close')">{{ $t('msg.cancel') }}</button>
    </template>
  </EDialog>
</template>

<script>
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import EDialog from '@/components/modern/ui/EDialog.vue';
  import ContactAvatar from '@/components/ContactAvatar.vue';
  import { pickableContacts, sendableAddresses as contactAddresses, shortAddress, sortContacts } from '@/shared/contacts.js';

  export default {
    name: 'ContactPicker',
    components: { EIcon, EDialog, ContactAvatar },
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
        return sortContacts(pickableContacts(this.contacts, this.keyword, { tor: true }), 'name', new Map(), locale);
      },
    },
    watch: {
      open(v) {
        if (v) this.keyword = '';
      },
      //the search field appears once the list is in: give it the focus
      loading(v) {
        if (!v && this.open) this.$nextTick(() => { if (this.$refs.search) this.$refs.search.focus(); });
      },
    },
    methods: {
      addressesOf(c) { return contactAddresses(c, { tor: true }); },
      first(c) { return contactAddresses(c, { tor: true })[0] || { field: '', kind: 'http', address: '' }; },
      short(a) { return shortAddress(a); },
      pickFirst() {
        const c = this.shown[0];
        if (c) this.$emit('pick', c, this.first(c).field);
      },
      /* ↑/↓ between the rows (and from the search field to the first row) */
      moveFrom(i, step) {
        const rows = this.$refs.list ? Array.from(this.$refs.list.querySelectorAll('.e-cpick-row')) : [];
        const j = i + step;
        if (j < 0) { if (this.$refs.search) this.$refs.search.focus(); return; }
        if (rows[j]) rows[j].focus();
      },
    },
  };
</script>
