<template>
  <div class="e-hero-screen">
    <div class="e-onb-progress e-fs-card">
      <BrandTile />
      <div class="e-auth-title">
        <h1>{{ $t('msg.wallets.error_title') }}</h1>
      </div>
      <div class="e-notice e-risk" role="alert">
        <EIcon name="alertc" />
        <div>
          <b>{{ $t('msg.wallets.error_text') }}</b>
          <p class="e-mono e-fs-path" translate="no">{{ settingsFile }}</p>
          <p v-if="loadError">{{ $t('msg.wallets.error_reason', [loadError]) }}</p>
        </div>
      </div>
      <p class="e-fs-text">{{ $t('msg.wallets.error_fix') }}</p>
      <p class="e-help e-fs-text">{{ $t('msg.wallets.error_backup') }}</p>
      <div class="e-row e-fs-actions">
        <button type="button" class="e-btn e-btn-ghost" @click="openFolder"><EIcon name="open" />{{ $t('msg.wallets.open_folder') }}</button>
        <span class="e-grow"></span>
        <button type="button" class="e-btn" @click="quit">{{ $t('msg.wallets.quit') }}</button>
        <button type="button" class="e-btn e-btn-primary" @click="tryAgain"><EIcon name="refresh" />{{ $t('msg.wallets.try_again') }}</button>
      </div>
    </div>
    <AuthFoot />
  </div>
</template>

<script>
  import SettingsError from '@/components/SettingsError.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import AuthFoot from '@/components/modern/onboarding/AuthFoot.vue';

  export default reskin(SettingsError, { components: { EIcon, BrandTile, AuthFoot } });
</script>
