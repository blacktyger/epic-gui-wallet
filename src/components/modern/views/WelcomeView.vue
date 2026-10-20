<template>
  <div class="e-hero-screen e-welcome-screen">
    <div class="e-onb-hero">
      <BrandTile />
      <h1>{{ hasWallets ? $t('msg.wallets.add_title') : $t('msg.modern.unlock.welcome_title') }}</h1>
      <p class="e-lead">{{ hasWallets ? $t('msg.wallets.add_lead') : $t('msg.modern.unlock.welcome_lead') }}</p>
      <div class="e-onb-hero-actions">
        <AddWalletOptions modern from="new" :network="network" :label="$t('msg.wallets.add_title')" />
      </div>
      <p v-if="network !== 'mainnet'" class="e-net-note"><span class="e-tag e-warn">{{ networkName }}</span><span class="e-small e-dim">{{ $t('msg.wallets.network_chosen') }}</span></p>
      <div v-if="hasWallets" class="e-auth-alt">
        <router-link to="/login">{{ $t('msg.wallets.back_to_unlock') }}</router-link>
      </div>

      <details class="e-tech e-welcome-adv" :open="advancedOpen" @toggle="advancedOpen = $event.target.open">
        <summary><EIcon name="chevr" />{{ $t('msg.wallets.advanced') }}</summary>
        <div class="e-tech-body">
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

          <div class="e-adv-row" role="group" aria-labelledby="welcome-root-h">
            <p id="welcome-root-h" class="e-label">{{ $t('msg.wallets.root_title') }}</p>
            <p class="e-help">{{ $t('msg.wallets.root_hint') }}</p>
            <p class="e-adv-path"><span class="e-mono" translate="no">{{ appFolder }}</span></p>
            <details class="e-adv-more">
              <summary>{{ $t('msg.wallets.root_more') }}</summary>
              <p class="e-help">{{ $t('msg.wallets.root_more_text') }}</p>
            </details>
            <template v-if="canMoveRoot">
              <div class="e-adv-inline">
                <button type="button" class="e-btn e-btn-sm" data-root="choose" @click="pickRoot"><EIcon name="folder" />{{ $t('msg.wallets.root_choose') }}</button>
                <button v-if="rootSource === 'location'" type="button" class="e-link-btn e-small" data-root="default" @click="useDefaultRoot">{{ $t('msg.wallets.root_default') }}</button>
              </div>
              <div v-if="rootPicked" class="e-notice e-warn" role="group" aria-labelledby="welcome-root-l">
                <EIcon name="restart" />
                <div>
                  <p id="welcome-root-l">{{ $t('msg.wallets.root_confirm', [rootPicked]) }}</p>
                  <div class="e-row">
                    <button type="button" class="e-btn e-btn-sm e-btn-ghost" @click="rootPicked = ''">{{ $t('msg.cancel') }}</button>
                    <button type="button" class="e-btn e-btn-sm e-btn-primary" data-root="restart" @click="confirmRoot"><EIcon name="restart" />{{ $t('msg.wallets.restart_now') }}</button>
                  </div>
                </div>
              </div>
              <p v-if="rootError" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ rootError }}</span></p>
            </template>
            <p v-else class="e-help">{{ $t('msg.wallets.root_locked') }}</p>
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
  import AddWalletOptions from '@/components/form/AddWalletOptions.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import AuthFoot from '@/components/modern/onboarding/AuthFoot.vue';

  export default reskin(New, {
    components: { EIcon, BrandTile, AuthFoot, AddWalletOptions },
    computed: {
      networkName() { return networkBadge(this.network); },
    },
  });
</script>
