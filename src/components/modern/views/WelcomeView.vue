<template>
  <div class="e-hero-screen e-welcome-screen">
    <div class="e-onb-hero">
      <BrandTile />
      <h1>{{ hasWallets ? $t('msg.wallets.add_title') : $t('msg.modern.unlock.welcome_title') }}</h1>
      <p v-if="!hasWallets" class="e-lead">{{ $t('msg.modern.unlock.welcome_lead') }}</p>
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
            <p class="e-help e-adv-hint">{{ $t('msg.wallets.root_hint_m') }}
              <button type="button" class="e-icon-btn e-sm" :aria-label="$t('msg.wallets.root_more')" :aria-expanded="chainTip ? 'true' : 'false'" aria-controls="welcome-root-chain" @click="chainTip = !chainTip" @keydown.esc="chainTip = false"><EIcon name="info" size="sm" /></button>
            </p>
            <p id="welcome-root-chain" class="e-help" role="status" :hidden="!chainTip">{{ chainTip ? $t('msg.wallets.root_hint_chain') : '' }}</p>
            <p v-if="rootMoved" class="e-help e-ok" role="status"><EIcon name="okc" />{{ $t('msg.wallets.root_using', [appFolder]) }}</p>
            <p v-else class="e-adv-path"><span class="e-mono" translate="no">{{ appFolder }}</span></p>
            <details class="e-adv-more">
              <summary>{{ $t('msg.wallets.root_more') }}</summary>
              <p class="e-help">{{ $t('msg.wallets.root_more_m') }}</p>
            </details>
            <template v-if="canMoveRoot">
              <div class="e-adv-inline">
                <button type="button" class="e-btn e-btn-sm" data-root="choose" @click="pickRoot"><EIcon name="folder" />{{ $t('msg.wallets.root_choose') }}</button>
                <button v-if="rootSource === 'location'" type="button" class="e-link-btn e-small" data-root="default" @click="useDefaultRoot">{{ $t('msg.wallets.root_default') }}</button>
              </div>
              <p v-if="rootError" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ rootError }}</span></p>
            </template>
            <p v-else class="e-help">{{ $t('msg.wallets.root_locked') }}</p>
          </div>
        </div>
      </details>

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
    data() {
      //back from the restart after a new app folder: Advanced open, the folder in use said once
      const moved = typeof this.configService.takeRootMoved === 'function' && this.configService.takeRootMoved();
      return { chainTip: false, rootMoved: moved, advancedOpen: moved };
    },
    methods: {
      //userData is read at start, so the new folder needs a restart: it follows the pick at once
      async pickRoot() {
        this.rootError = '';
        const picked = await window.api.showOpenDialog();
        if (picked && !picked.canceled && picked.filePaths && picked.filePaths[0]) {
          this.rootPicked = picked.filePaths[0];
          this.confirmRoot();
        }
      },
    },
    computed: {
      networkName() { return networkBadge(this.network); },
    },
  });
</script>
