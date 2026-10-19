<template>
  <header class="e-topbar"><h1>{{ $t('msg.modern.contacts') }}</h1></header>
  <div class="e-content">

    <!-- empty: nothing saved yet (and not adding the first one) -->
    <div v-if="showEmpty" class="e-panel">
      <div class="e-empty e-con-empty">
        <div class="e-glyph"><EIcon name="contacts" /></div>
        <h3>{{ $t('msg.modern.settings.empty_title') }}</h3>
        <p>{{ $t('msg.modern.settings.empty_text') }}</p>
        <p class="e-small e-faint">{{ $t('msg.modern.settings.empty_note') }}</p>
        <div class="e-row">
          <button type="button" class="e-btn e-btn-primary" @click="create()"><EIcon name="userplus" />{{ $t('msg.modern.settings.add_contact') }}</button>
          <router-link :to="{ name: 'httpSend' }" class="e-btn e-btn-ghost">{{ $t('msg.modern.settings.send_to_address') }}</router-link>
        </div>
      </div>
    </div>

    <div v-else class="e-con-split">
      <!-- list -->
      <section class="e-panel e-con-side" :aria-label="$t('msg.modern.settings.contacts_list')">
        <div class="e-con-side-head">
          <span class="e-small e-dim" role="status">{{ $t('msg.modern.settings.contacts_count', addressList.length) }}</span>
          <button type="button" class="e-btn e-sm e-right" @click="create()"><EIcon name="userplus" />{{ $t('msg.modern.settings.add_contact') }}</button>
        </div>
        <form class="e-con-search" role="search" @submit.prevent="search">
          <label class="e-sr-only" for="con-q">{{ $t('msg.modern.settings.search_contacts') }}</label>
          <div class="e-input-wrap e-has-lead">
            <span class="e-lead"><EIcon name="search" size="sm" /></span>
            <input id="con-q" class="e-input" type="search" autocomplete="off" :placeholder="$t('msg.modern.settings.search_ph')" v-model="keyword" />
            <div v-if="searched" class="e-trail">
              <button type="button" class="e-icon-btn" :aria-label="$t('msg.modern.close')" @click.prevent="clearup(false)"><EIcon name="close" size="sm" /></button>
            </div>
          </div>
        </form>
        <ul v-if="addressList.length" class="e-contact-list">
          <li v-for="address in addressList" :key="address.id">
            <button type="button" class="e-contact" :aria-current="isSelected(address) ? 'true' : null" @click="callAddress(address)">
              <span class="e-avatar" aria-hidden="true">{{ initials(address.name) }}</span>
              <span class="e-grow"><b>{{ address.name }}</b><small translate="no">{{ summary(address) }}</small></span>
            </button>
          </li>
        </ul>
        <p v-else class="e-small e-dim e-con-none">{{ $t('msg.modern.settings.no_results') }}</p>
      </section>

      <!-- edit / new, in the same pane -->
      <section v-if="isEditAddress || isNewAddress" class="e-panel e-con-main" aria-labelledby="con-edit-t">
        <form class="e-con-form" novalidate @submit.prevent="isNewAddress ? addAddress() : updateAddressById()">
          <input type="hidden" v-model="id" />
          <div class="e-con-head">
            <span class="e-avatar e-lg" aria-hidden="true">{{ initials(name) }}</span>
            <div class="e-grow">
              <h2 id="con-edit-t">{{ isNewAddress ? $t('msg.modern.settings.new_contact') : $t('msg.modern.settings.edit_contact') }}</h2>
              <p class="e-small e-dim">{{ $t('msg.modern.settings.edit_contact_hint') }}</p>
            </div>
          </div>

          <div class="e-field">
            <label class="e-label" for="con-f-name">{{ $t('msg.addressbook.name') }}</label>
            <input id="con-f-name" class="e-input" type="text" autocomplete="off" v-model="name" />
          </div>
          <div class="e-field">
            <label class="e-label" for="con-f-box">{{ $t('msg.addressbook.external_one') }}</label>
            <input id="con-f-box" class="e-input e-mono" type="text" spellcheck="false" autocomplete="off" translate="no" v-model="externalOne" />
          </div>
          <div class="e-field">
            <label class="e-label" for="con-f-ext">{{ $t('msg.addressbook.external_two') }}</label>
            <input id="con-f-ext" class="e-input e-mono" type="text" spellcheck="false" autocomplete="off" translate="no" v-model="externalTwo" />
          </div>
          <div class="e-con-grid2">
            <div class="e-field">
              <label class="e-label" for="con-f-country">{{ $t('msg.addressbook.country') }}</label>
              <input id="con-f-country" class="e-input" type="text" autocomplete="off" v-model="country" />
            </div>
            <div class="e-field">
              <label class="e-label" for="con-f-city">{{ $t('msg.addressbook.city') }}</label>
              <input id="con-f-city" class="e-input" type="text" autocomplete="off" v-model="city" />
            </div>
          </div>
          <div class="e-field">
            <label class="e-label" for="con-f-proof">{{ $t('msg.addressbook.proof_address') }}</label>
            <input id="con-f-proof" class="e-input e-mono" type="text" spellcheck="false" autocomplete="off" translate="no" v-model="proofaddr" />
          </div>
          <div class="e-con-switch">
            <label class="e-switch" for="alwaysProofSwitch">
              <input id="alwaysProofSwitch" type="checkbox" v-model="alwaysproof" />
              <span class="e-track"></span>
              <span><b>{{ $t('msg.addressbook.send_always') }}</b></span>
            </label>
          </div>
          <div class="e-field">
            <label class="e-label" for="con-f-note">{{ $t('msg.addressbook.notice') }} <span class="e-opt">{{ $t('msg.modern.settings.notice_optional') }}</span></label>
            <textarea id="con-f-note" class="e-textarea" rows="3" v-model="notice"></textarea>
          </div>

          <div class="e-con-form-foot">
            <button type="submit" class="e-btn e-btn-primary"><EIcon name="check" />{{ $t('msg.save') }}</button>
            <button type="button" class="e-btn e-btn-ghost" @click="cancel()">{{ $t('msg.cancel') }}</button>
            <button v-if="!isNewAddress" type="button" class="e-btn e-btn-danger e-right" @click="trashModalOpen(selectedAddress)"><EIcon name="trash" />{{ $t('msg.delete') }}</button>
          </div>
        </form>
      </section>

      <!-- detail -->
      <section v-else-if="addressLoaded" class="e-panel e-con-main" aria-labelledby="con-name">
        <div class="e-con-head">
          <span class="e-avatar e-lg" aria-hidden="true">{{ initials(name) }}</span>
          <div class="e-grow">
            <h2 id="con-name">{{ name }}</h2>
            <p v-if="place" class="e-small e-dim">{{ place }}</p>
          </div>
        </div>
        <div class="e-con-actions">
          <button type="button" class="e-btn" @click="edit()"><EIcon name="pencil" />{{ $t('msg.edit') }}</button>
          <button type="button" class="e-btn e-btn-danger e-right" @click="trashModalOpen(selectedAddress)"><EIcon name="trash" />{{ $t('msg.delete') }}</button>
        </div>

        <dl class="e-con-facts">
          <div v-if="externalOne">
            <dt>{{ $t('msg.addressbook.external_one') }}</dt>
            <dd class="e-addr"><code translate="no">{{ externalOne }}</code><button type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.modern.settings.copy_field', { what: $t('msg.addressbook.external_one') })" @click="copy(externalOne)"><EIcon name="copy" size="sm" /></button></dd>
          </div>
          <div v-if="externalTwo">
            <dt>{{ $t('msg.addressbook.external_two') }}</dt>
            <dd class="e-addr"><code translate="no">{{ externalTwo }}</code><button type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.modern.settings.copy_field', { what: $t('msg.addressbook.external_two') })" @click="copy(externalTwo)"><EIcon name="copy" size="sm" /></button></dd>
          </div>
          <div v-if="proofaddr">
            <dt>{{ $t('msg.addressbook.proof_address') }}</dt>
            <dd class="e-addr"><code translate="no">{{ proofaddr }}</code><button type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.modern.settings.copy_field', { what: $t('msg.addressbook.proof_address') })" @click="copy(proofaddr)"><EIcon name="copy" size="sm" /></button></dd>
          </div>
          <div v-if="proofaddr">
            <dt>{{ $t('msg.addressbook.send_always') }}</dt>
            <dd class="e-con-yes"><template v-if="alwaysproof"><EIcon name="okc" size="sm" />{{ $t('msg.modern.settings.yes_every_send') }}</template><template v-else><EIcon name="minusc" size="sm" />{{ $t('msg.modern.settings.no_proof') }}</template></dd>
          </div>
          <div v-if="notice">
            <dt>{{ $t('msg.addressbook.notice') }}</dt>
            <dd class="e-con-note">{{ notice }}</dd>
          </div>
        </dl>
      </section>

      <section v-else class="e-panel e-con-main">
        <p class="e-dim">{{ $t('msg.modern.settings.pick_contact') }}</p>
      </section>
    </div>

    <!-- delete confirmation (Classic: layout/ModalBox.vue) -->
    <EDialog
      :open="isModalActive"
      role="alertdialog"
      icon="trash"
      tone="risk"
      :title="$t('msg.modern.settings.delete_title', { name: trashObject ? trashObject.name : '' })"
      :description="$t('msg.modern.settings.delete_desc')"
      @close="trashCancel"
    >
      <template #foot>
        <button type="button" class="e-btn e-btn-ghost" @click="trashCancel">{{ $t('msg.modern.settings.keep_contact') }}</button>
        <button type="button" class="e-btn e-btn-danger" @click="trashConfirm"><EIcon name="trash" />{{ $t('msg.modern.settings.delete_contact') }}</button>
      </template>
    </EDialog>
  </div>
</template>

<script>
  import AddressBook from '@/components/AddressBook.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import EDialog from '@/components/modern/ui/EDialog.vue';

  export default reskin(AddressBook, {
    components: { EIcon, EDialog },
    data() {
      //set once the first list has arrived, so the empty state does not flash while it loads
      return { listReady: false };
    },
    computed: {
      showEmpty() {
        return this.listReady && !this.addressList.length && !this.isNewAddress && !this.searched;
      },
      place() {
        return [this.city, this.country].filter(Boolean).join(', ');
      },
    },
    watch: {
      addressList() { this.listReady = true; },
    },
    methods: {
      isSelected(address) {
        return (this.addressLoaded || this.isEditAddress) && this.id == address.id;
      },
      initials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '·';
        return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] || ''))).toUpperCase();
      },
      //the line under the name in the list: the first address the contact has
      summary(address) {
        return address.externalOne || address.externalTwo || address.proofaddr || '';
      },
    },
  });
</script>
