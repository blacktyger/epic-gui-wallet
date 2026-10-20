<template>
  <div class="e-hero-screen e-tall-screen">
    <div class="e-onb-hero e-existing">
      <BrandTile />
      <h1>{{ $t('msg.wallets.existing_title') }}</h1>
      <p class="e-lead">{{ $t('msg.wallets.existing_lead') }}</p>

      <div class="e-existing-list">
        <section class="e-panel e-existing-way" aria-labelledby="existing-older-h">
          <h2 id="existing-older-h"><EIcon name="history" />{{ $t('msg.wallets.existing_older') }}</h2>
          <p id="existing-older-p" class="e-help">{{ $t('msg.wallets.existing_older_hint') }}</p>
          <router-link class="e-btn e-btn-sm" :to="foundRoute" aria-describedby="existing-older-p"><EIcon name="search" />{{ $t('msg.wallets.existing_older_go') }}</router-link>
        </section>

        <section class="e-panel e-existing-way" aria-labelledby="existing-folder-h">
          <h2 id="existing-folder-h"><EIcon name="folderopen" />{{ $t('msg.wallets.existing_folder') }}</h2>
          <p id="existing-folder-p" class="e-help">{{ $t('msg.wallets.existing_folder_hint') }}</p>
          <button ref="folderButton" type="button" class="e-btn e-btn-sm" :aria-busy="folderBusy ? 'true' : null" aria-describedby="existing-folder-p" @click="pickWalletFolder">
            <span v-if="folderBusy" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="folder" />{{ $t('msg.wallets.existing_folder_go') }}
          </button>
          <div v-if="folderAsk" class="e-notice e-gold" role="group" aria-labelledby="existing-fnet-l">
            <EIcon name="info" />
            <div>
              <p id="existing-fnet-l">{{ $t('msg.wallets.folder_network') }}</p>
              <div class="e-row e-notice-actions">
                <select class="e-select" v-model="folderNetwork" :aria-label="$t('msg.wallets.network')">
                  <option value="mainnet">Mainnet</option>
                  <option value="floonet">Floonet</option>
                  <option value="usernet">Usernet</option>
                </select>
                <button type="button" class="e-btn e-btn-sm e-btn-primary" @click="folderWithNetwork">{{ $t('msg.wallets.continue') }}</button>
              </div>
            </div>
          </div>
          <p v-if="folderError" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ folderError }}</span></p>
          <WalletFolderPick v-if="folderPick" modern :pick="folderPick" :busy="folderBusy" @open="folderPicked" @again="pickWalletFolder" @cancel="folderPickCancel" />
        </section>
      </div>

      <div class="e-auth-alt">
        <router-link :to="backRoute">{{ $t('msg.back') }}</router-link>
      </div>
    </div>
    <AuthFoot />
  </div>
</template>

<script>
  import AddExisting from '@/components/AddExisting.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import AuthFoot from '@/components/modern/onboarding/AuthFoot.vue';

  export default reskin(AddExisting, {
    components: { EIcon, BrandTile, AuthFoot },
  });
</script>
