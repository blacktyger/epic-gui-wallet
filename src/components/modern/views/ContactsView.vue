<template>
  <header class="e-topbar">
    <h1>{{ $t('msg.modern.contacts') }}</h1>
    <div v-if="addressList.length || isNewAddress" class="e-topbar-actions">
      <button type="button" class="e-btn e-btn-primary e-btn-sm" @click="create()"><EIcon name="userplus" />{{ $t('msg.modern.settings.add_contact') }}</button>
    </div>
  </header>
  <div class="e-content e-con-wrap">

    <!-- loading: nothing flashes until the first list is in -->
    <div v-if="!listReady" class="e-panel e-con-loading" role="status"><span class="e-spinner" aria-hidden="true"></span>{{ $t('msg.contacts.loading') }}</div>

    <!-- empty: nothing saved yet (and not adding the first one) -->
    <div v-else-if="showEmpty" class="e-panel">
      <div class="e-empty e-con-empty">
        <div class="e-con-empty-art" aria-hidden="true">
          <ContactAvatar name="Mara Okafor" size="lg" />
          <ContactAvatar name="Juno Reyes" size="lg" />
          <ContactAvatar name="Leo Hartmann" size="lg" />
        </div>
        <h3>{{ $t('msg.modern.settings.empty_title') }}</h3>
        <p>{{ $t('msg.contacts.empty_text') }}</p>
        <p class="e-small e-faint">{{ $t('msg.modern.settings.empty_note') }}</p>
        <div class="e-row">
          <button type="button" class="e-btn e-btn-primary" @click="create()"><EIcon name="userplus" />{{ $t('msg.modern.settings.add_contact') }}</button>
          <router-link :to="{ name: 'httpSend' }" class="e-btn e-btn-ghost">{{ $t('msg.modern.settings.send_to_address') }}</router-link>
        </div>
      </div>
    </div>

    <div v-else class="e-con-split" :class="{ 'e-con-has-sel': paneOpen }">
      <!-- the list -->
      <section class="e-panel e-con-side" :aria-label="$t('msg.modern.settings.contacts_list')">
        <div class="e-con-tools">
          <form class="e-con-search" role="search" @submit.prevent="search">
            <label class="e-sr-only" for="con-q">{{ $t('msg.modern.settings.search_contacts') }}</label>
            <div class="e-input-wrap e-has-lead">
              <span class="e-lead"><EIcon name="search" size="sm" /></span>
              <input id="con-q" v-model="keyword" class="e-input" type="search" autocomplete="off" :placeholder="$t('msg.modern.settings.search_ph')" @keydown.esc="keyword && (keyword = '')" />
            </div>
          </form>
          <div class="e-con-sortrow">
            <span class="e-small e-dim" role="status" aria-live="polite">{{ searched ? $t('msg.contacts.found_count', shownList.length) : $t('msg.modern.settings.contacts_count', addressList.length) }}</span>
            <div class="e-seg e-con-sort" role="group" :aria-label="$t('msg.contacts.sort_label')">
              <button type="button" :aria-pressed="sort == 'name' ? 'true' : 'false'" @click="sort = 'name'">{{ $t('msg.contacts.sort_name') }}</button>
              <button type="button" :aria-pressed="sort == 'recent' ? 'true' : 'false'" @click="sort = 'recent'">{{ $t('msg.contacts.sort_recent') }}</button>
            </div>
          </div>
        </div>
        <ul v-if="shownList.length" class="e-con-list">
          <li v-for="c in shownList" :key="c.id" class="e-con-item">
            <!-- the row sends: Send opens with this contact's address (its details are in the … menu) -->
            <button type="button" class="e-con-row" :aria-current="isSelected(c) ? 'true' : null" @click="openContact(c)">
              <ContactAvatar :name="c.name" :image="avatarOf(c)" size="md" />
              <span class="e-con-row-text">
                <span v-if="sendableOf(c).length" class="e-sr-only">{{ $t('msg.contacts.row_send') }}</span>
                <b>{{ c.name }}</b>
                <small class="e-con-row-addr" translate="no">{{ shortOf(c) }}</small>
              </span>
              <span class="e-con-row-meta">
                <span class="e-con-kinds">
                  <span v-for="k in kindsOf(c)" :key="k" class="e-tag e-con-kind" :class="{ 'e-gold': k == 'epicbox' }">{{ k == 'tor' ? $t('msg.modern.settings.tor.kind') : $t('msg.contacts.kind_' + k) }}</span>
                </span>
                <small v-if="lastShort(c)">{{ lastShort(c) }}</small>
              </span>
            </button>
            <RowMenu :label="$t('msg.contacts.menu_label', { name: c.name })" :items="menuItems(c)" @select="onMenu(c, $event)" />
          </li>
        </ul>
        <div v-else-if="addressList.length" class="e-con-none">
          <p class="e-small e-dim">{{ $t('msg.modern.settings.no_results') }}</p>
          <button type="button" class="e-btn e-btn-ghost e-btn-sm" @click="clearup(false)">{{ $t('msg.modern.settings.help_search_clear') }}</button>
        </div>
      </section>

      <!-- new / edit, in the same pane -->
      <section v-if="isEditAddress || isNewAddress" class="e-panel e-con-main" aria-labelledby="con-edit-t">
        <button type="button" class="e-btn e-btn-ghost e-btn-sm e-con-back" @click="cancel()"><EIcon name="chevl" size="sm" />{{ $t('msg.contacts.back') }}</button>
        <form class="e-con-form" novalidate @submit.prevent="save()">
          <div class="e-con-head">
            <ContactAvatar :name="name" :image="formImage" size="xl" />
            <div class="e-grow">
              <h2 id="con-edit-t">{{ isNewAddress ? $t('msg.modern.settings.new_contact') : $t('msg.modern.settings.edit_contact') }}</h2>
              <div class="e-con-pic">
                <label class="e-btn e-btn-ghost e-btn-sm e-con-pic-btn" :class="{ 'e-is-busy': imageBusy }">
                  <input ref="imageInput" class="e-sr-only" type="file" :accept="imageAccept" aria-describedby="con-pic-h" @change="pickImage" />
                  <EIcon name="camera" size="sm" />{{ formImage ? $t('msg.contacts.picture_change') : $t('msg.contacts.picture_add') }}
                </label>
                <button v-if="formImage" type="button" class="e-btn e-btn-ghost e-btn-sm" @click="removeImage()">{{ $t('msg.contacts.picture_remove') }}</button>
              </div>
              <p v-if="imageProblem" id="con-pic-h" class="e-error-msg" role="alert"><EIcon name="alertc" />{{ $t('msg.contacts.picture_' + imageProblem) }}</p>
              <p v-else id="con-pic-h" class="e-help">{{ $t('msg.contacts.picture_hint') }}</p>
            </div>
          </div>

          <div class="e-field">
            <label class="e-label" for="con-f-name">{{ $t('msg.addressbook.name') }}</label>
            <input id="con-f-name" v-model="name" class="e-input" type="text" autocomplete="off" :aria-invalid="errorOf('name') ? 'true' : null" :aria-describedby="errorOf('name') ? 'con-f-name-e' : null" @blur="touch('name')" />
            <p v-if="errorOf('name')" id="con-f-name-e" class="e-error-msg"><EIcon name="alertc" />{{ $t(errorOf('name')) }}</p>
          </div>
          <div class="e-field">
            <label class="e-label" for="con-f-box">{{ $t('msg.contacts.epicbox_address') }}</label>
            <input id="con-f-box" v-model="externalOne" class="e-input e-mono" type="text" spellcheck="false" autocomplete="off" translate="no" :aria-invalid="errorOf('externalOne') ? 'true' : null" :aria-describedby="(errorOf('externalOne') ? 'con-f-box-e ' : '') + 'con-f-box-h'" @blur="touch('externalOne')" />
            <p v-if="errorOf('externalOne')" id="con-f-box-e" class="e-error-msg"><EIcon name="alertc" />{{ $t(errorOf('externalOne')) }}</p>
            <p id="con-f-box-h" class="e-help">{{ $t('msg.contacts.hint_epicbox') }}</p>
          </div>
          <div class="e-field">
            <label class="e-label" for="con-f-ext">{{ $t('msg.contacts.http_address') }} <span class="e-opt">{{ $t('msg.contacts.optional') }}</span></label>
            <input id="con-f-ext" v-model="externalTwo" class="e-input e-mono" type="text" spellcheck="false" autocomplete="off" translate="no" :aria-invalid="errorOf('externalTwo') ? 'true' : null" :aria-describedby="(errorOf('externalTwo') ? 'con-f-ext-e ' : '') + 'con-f-ext-h'" @blur="touch('externalTwo')" />
            <p v-if="errorOf('externalTwo')" id="con-f-ext-e" class="e-error-msg"><EIcon name="alertc" />{{ $t(errorOf('externalTwo')) }}</p>
            <p id="con-f-ext-h" class="e-help">{{ $t('msg.contacts.hint_http') }}</p>
          </div>
          <!-- Tor: when Tor is on, or this contact already has a Tor address -->
          <div v-if="onionShown" class="e-field" data-test="con-onion">
            <label class="e-label" for="con-f-onion">{{ $t('msg.modern.settings.tor.address') }} <span class="e-opt">{{ $t('msg.contacts.optional') }}</span></label>
            <input id="con-f-onion" v-model="onion" class="e-input e-mono" type="text" spellcheck="false" autocomplete="off" translate="no" dir="ltr" :aria-invalid="errorOf('onion') ? 'true' : null" :aria-describedby="errorOf('onion') ? 'con-f-onion-e' : null" @blur="touch('onion')" />
            <p v-if="errorOf('onion')" id="con-f-onion-e" class="e-error-msg"><EIcon name="alertc" />{{ $t(errorOf('onion')) }}</p>
          </div>
          <div class="e-field">
            <label class="e-label" for="con-f-note">{{ $t('msg.contacts.note') }} <span class="e-opt">{{ $t('msg.modern.settings.notice_optional') }}</span></label>
            <textarea id="con-f-note" v-model="notice" class="e-textarea" rows="3"></textarea>
          </div>

          <div class="e-con-form-foot">
            <button type="submit" class="e-btn e-btn-primary" :class="{ 'e-is-busy': saving }" :aria-busy="saving ? 'true' : null" :disabled="imageBusy"><EIcon name="check" />{{ $t('msg.modern.settings.save_contact') }}</button>
            <button type="button" class="e-btn e-btn-ghost" @click="cancel()">{{ $t('msg.cancel') }}</button>
          </div>
        </form>
      </section>

      <!-- one contact -->
      <section v-else-if="addressLoaded" class="e-panel e-con-main" aria-labelledby="con-name">
        <button type="button" class="e-btn e-btn-ghost e-btn-sm e-con-back" @click="cancel()"><EIcon name="chevl" size="sm" />{{ $t('msg.contacts.back') }}</button>
        <div class="e-con-head">
          <ContactAvatar :name="name" :image="avatarOf(selectedAddress)" size="xl" />
          <div class="e-grow">
            <h2 id="con-name">{{ name }}</h2>
            <p v-if="selectedLast" class="e-small e-dim">{{ selectedLast }}</p>
          </div>
        </div>
        <div class="e-con-actions">
          <button type="button" class="e-btn" @click="edit()"><EIcon name="pencil" />{{ $t('msg.edit') }}</button>
          <button type="button" class="e-btn e-btn-ghost e-con-del" @click="trashModalOpen(selectedAddress)"><EIcon name="trash" />{{ $t('msg.delete') }}</button>
        </div>

        <dl class="e-con-facts">
          <div v-for="a in selectedAddresses" :key="a.field">
            <dt><EIcon :name="a.kind == 'epicbox' ? 'antenna' : a.kind == 'tor' ? 'shield' : 'web'" size="sm" />{{ kindName(a.kind) }}</dt>
            <dd class="e-addr">
              <code translate="no">{{ a.address }}</code>
              <button type="button" class="e-btn e-btn-ghost e-btn-sm e-con-copy" :class="{ 'e-is-copied': copied == a.field }" :aria-label="$t('msg.modern.settings.copy_field', { what: kindName(a.kind) })" @click="copy(a.address, a.field)">
                <EIcon :name="copied == a.field ? 'check' : 'copy'" size="sm" /><span aria-hidden="true">{{ copied == a.field ? $t('msg.contacts.copied') : $t('msg.contacts.copy') }}</span>
              </button>
            </dd>
          </div>
          <div v-if="notice">
            <dt>{{ $t('msg.contacts.note') }}</dt>
            <dd class="e-con-note">{{ notice }}</dd>
          </div>
        </dl>
        <p class="e-sr-only" role="status" aria-live="polite">{{ copied ? $t('msg.copy_to_clipboard') : '' }}</p>

        <ContactTx :contact-id="Number(selectedAddress.id) || 0" :name="name" />
      </section>

      <section v-else class="e-panel e-con-main e-con-idle">
        <EIcon name="contacts" />
        <p class="e-dim">{{ $t('msg.contacts.pick_hint') }}</p>
      </section>
    </div>

    <!-- delete confirmation (Classic: its own modal in AddressBook.vue) -->
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
        <button type="button" class="e-btn e-btn-ghost" autofocus @click="trashCancel">{{ $t('msg.modern.settings.keep_contact') }}</button>
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
  import ContactAvatar from '@/components/ContactAvatar.vue';
  import ContactTx from '@/components/modern/activity/ContactTx.vue';
  import RowMenu from '@/components/RowMenu.vue';
  import { showOnionField } from '@/shared/torUi';

  export default reskin(AddressBook, {
    components: { EIcon, EDialog, ContactAvatar, ContactTx, RowMenu },
    computed: {
      //Tor addresses are contacts' addresses (the Send, search and copy helpers include the onion column)
      torAware() { return true; },
      //the Tor field: Tor is on, or this contact already has a Tor address
      onionShown() { return showOnionField(this.store.state.tor, { onion: this.onion }); },
      showEmpty() {
        return this.listReady && !this.addressList.length && !this.isNewAddress;
      },
    },
    methods: {
      kindName(kind) {
        return kind == 'tor' ? this.$t('msg.modern.settings.tor.address') : this.$t('msg.contacts.' + kind + '_address');
      },
      /* the list's right column: "yesterday", "12 Oct" (the detail says "Last transaction: …") */
      lastShort(c) {
        const a = this.activity.get(Number(c && c.id));
        return a && a.last ? this.whenText(a.last) : '';
      },
    },
  });
</script>
