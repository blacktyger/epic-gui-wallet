<template>
  <SettingsFrame>
    <section class="e-set-group" aria-labelledby="stg-w-h">
      <h2 id="stg-w-h">{{ $t('msg.modern.settings.wallet') }}</h2>
      <div class="e-set-list">
        <form class="e-set-row e-stacked" novalidate @submit.prevent="save">
          <div>
            <label for="stg-name"><b>{{ $t('msg.account.your_name') }}</b></label>
            <p>{{ $t('msg.modern.settings.profile_hint') }}</p>
          </div>
          <div class="e-stg-inline e-top">
            <div class="e-grow e-stg-w" data-input-id="stg-name"><TextField ref="textField" fieldname="name" required="true" /></div>
            <button type="submit" class="e-btn e-btn-primary"><EIcon name="check" />{{ $t('msg.save') }}</button>
          </div>
        </form>
        <div class="e-set-row">
          <div>
            <b>{{ $t('msg.modern.settings.phrase_row') }}</b>
            <p>{{ $t('msg.modern.settings.phrase_row_hint') }}</p>
          </div>
          <div class="e-ctl"><router-link :to="{ name: 'mnemonic' }" class="e-btn e-sm"><EIcon name="key" />{{ $t('msg.modern.settings.show_phrase') }}</router-link></div>
        </div>
        <div class="e-set-row">
          <div>
            <b>{{ $t('msg.modern.settings.rescan_row') }}</b>
            <p>{{ $t('msg.modern.settings.rescan_row_hint') }}</p>
          </div>
          <div class="e-ctl"><router-link :to="{ name: 'recheckBalance' }" class="e-btn e-sm"><EIcon name="scan" />{{ $t('msg.modern.settings.rescan_open') }}</router-link></div>
        </div>
        <div class="e-set-row">
          <div>
            <b>{{ $t('msg.modern.settings.wallet_files') }}</b>
            <p class="e-mono e-stg-path" translate="no">{{ walletDir }}</p>
          </div>
          <div class="e-ctl"><button type="button" class="e-btn e-sm" @click="openFolder"><EIcon name="open" />{{ $t('msg.modern.settings.open_folder') }}</button></div>
        </div>
        <div class="e-set-row">
          <div>
            <b>{{ $t('msg.modern.settings.network') }}</b>
            <p>{{ $t('msg.modern.settings.network_hint') }}</p>
          </div>
          <div class="e-ctl"><span class="e-stg-fact">{{ network }}</span></div>
        </div>
        <div class="e-set-row">
          <div>
            <b>{{ $t('msg.modern.settings.setup_title') }}</b>
            <p>{{ $t('msg.modern.settings.setup_hint') }}</p>
          </div>
          <div class="e-ctl"><router-link :to="{ name: 'setupwizard', params: { from: 'navbar' } }" class="e-small e-stg-link">{{ $t('msg.modern.settings.setup_run') }}</router-link></div>
        </div>
      </div>
    </section>
  </SettingsFrame>
</template>

<script>
  import Account from '@/components/Account.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import TextField from '@/components/modern/form/TextField.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';
  import { inputIds } from '@/components/modern/settings/inputIds';

  export default reskin(Account, {
    components: { EIcon, TextField, SettingsFrame },
    mixins: [inputIds],
    computed: {
      walletDir() { return this.configService.defaultAccountWalletdir || ''; },
      network() { return this.configService.defaultAccountNetwork || ''; },
    },
    methods: {
      //the same call as the Classic navbar's "Epic wallet location"
      async openFolder() {
        await window.openepichidden.open(this.configService.defaultAccountWalletdir);
      },
    },
  });
</script>
