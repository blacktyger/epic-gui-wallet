<template>
  <div class="e-hero-screen e-welcome-screen">
    <div class="e-onb-hero">
      <BrandTile />
      <h1>{{ $t('msg.modern.unlock.welcome_title') }}</h1>
      <p class="e-lead">{{ $t('msg.modern.unlock.welcome_lead') }}</p>
      <div class="e-onb-hero-actions">
        <router-link class="e-btn e-btn-primary e-btn-lg" :to="createRoute"><EIcon name="plus" />{{ $t('msg.wallets.create') }}</router-link>
        <router-link class="e-btn e-btn-lg" :to="restoreRoute"><EIcon name="backup" />{{ $t('msg.wallets.restore') }}</router-link>
      </div>
      <p v-if="network !== 'mainnet'" class="e-net-note"><span class="e-tag e-warn">{{ networkName }}</span><span class="e-small e-dim">{{ $t('msg.wallets.network_chosen') }}</span></p>
      <div v-if="hasWallets" class="e-auth-alt">
        <router-link to="/login">{{ $t('msg.wallets.back_to_unlock') }}</router-link>
      </div>

      <details class="e-tech e-welcome-adv" :open="advancedOpen" @toggle="advancedOpen = $event.target.open">
        <summary><EIcon name="chevr" />{{ $t('msg.wallets.advanced') }}</summary>
        <div class="e-tech-body">
          <div class="e-adv-row">
            <button type="button" class="e-btn e-btn-sm" :aria-busy="folderBusy ? 'true' : null" @click="pickWalletFolder">
              <span v-if="folderBusy" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="folderopen" />{{ $t('msg.wallets.open_wallet_folder') }}
            </button>
            <p class="e-help">{{ $t('msg.wallets.open_wallet_folder_hint') }}</p>
            <div v-if="folderAsk" class="e-notice e-gold" role="group" aria-labelledby="welcome-fnet-l">
              <EIcon name="info" />
              <div>
                <p id="welcome-fnet-l">{{ $t('msg.wallets.folder_network') }}</p>
                <div class="e-row">
                  <select class="e-select" v-model="folderNetwork" :aria-label="$t('msg.wallets.network')">
                    <option value="mainnet">Mainnet</option>
                    <option value="floonet">Floonet</option>
                    <option value="usernet">Usernet</option>
                  </select>
                  <button type="button" class="e-btn e-btn-sm e-btn-primary" @click="folderWithNetwork">{{ $t('msg.wallets.open') }}</button>
                </div>
              </div>
            </div>
            <p v-if="folderError" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ folderError }}</span></p>
          </div>

          <div class="e-adv-row">
            <router-link class="e-btn e-btn-sm" :to="{ name: 'found', query: { from: 'new' } }"><EIcon name="download" />{{ $t('msg.wallets.import_older') }}</router-link>
            <p class="e-help">{{ $t('msg.wallets.import_older_hint') }}</p>
          </div>

          <div class="e-adv-row">
            <div class="e-adv-inline">
              <label class="e-label" for="welcomeNetwork">{{ $t('msg.wallets.network') }}</label>
              <select id="welcomeNetwork" class="e-select" v-model="network" aria-describedby="welcomeNetworkHelp">
                <option value="mainnet">Mainnet</option>
                <option value="floonet">Floonet</option>
                <option value="usernet">Usernet</option>
              </select>
            </div>
            <p id="welcomeNetworkHelp" class="e-help">{{ $t('msg.wallets.network_hint') }}</p>
          </div>

          <div class="e-adv-row">
            <template v-if="!hasWallets">
              <div class="e-adv-inline">
                <button type="button" class="e-btn e-btn-sm" @click="pickRoot"><EIcon name="folder" />{{ $t('msg.wallets.root_choose') }}</button>
                <button v-if="rootSource === 'location'" type="button" class="e-link-btn e-small" @click="useDefaultRoot">{{ $t('msg.wallets.root_default') }}</button>
              </div>
              <div v-if="rootPicked" class="e-notice e-warn" role="group" aria-labelledby="welcome-root-l">
                <EIcon name="restart" />
                <div>
                  <p id="welcome-root-l">{{ $t('msg.wallets.root_confirm', [rootPicked]) }}</p>
                  <div class="e-row">
                    <button type="button" class="e-btn e-btn-sm e-btn-ghost" @click="rootPicked = ''">{{ $t('msg.cancel') }}</button>
                    <button type="button" class="e-btn e-btn-sm e-btn-primary" @click="confirmRoot"><EIcon name="restart" />{{ $t('msg.wallets.restart_now') }}</button>
                  </div>
                </div>
              </div>
              <p v-if="rootError" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ rootError }}</span></p>
            </template>
            <p class="e-adv-path"><span>{{ $t('msg.wallets.app_folder_label') }}</span> <span class="e-mono" translate="no">{{ appFolder }}</span></p>
          </div>
        </div>
      </details>

      <p class="e-onb-hero-note"><EIcon name="notebook" /><span>{{ $t('msg.modern.unlock.welcome_note') }}</span></p>
    </div>
    <AuthFoot />
  </div>
</template>

<script>
  import New from '@/components/New.vue';
  import { reskin } from '@/components/modern/reskin';
  import { networkBadge } from '@/components/wallets';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import AuthFoot from '@/components/modern/onboarding/AuthFoot.vue';

  export default reskin(New, {
    components: { EIcon, BrandTile, AuthFoot },
    computed: {
      networkName() { return networkBadge(this.network); },
    },
  });
</script>
