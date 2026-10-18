<template>
  <div class="e-hero-screen">
    <div class="e-onb-hero">
      <BrandTile />
      <h1>{{ $t('msg.modern.unlock.welcome_title') }}</h1>
      <p class="e-lead">{{ $t('msg.modern.unlock.welcome_lead') }}</p>
      <div class="e-onb-hero-actions">
        <router-link class="e-btn e-btn-primary e-btn-lg" :to="{ name: 'create', params: { from: 'new' } }"><EIcon name="plus" />{{ $t('msg.modern.unlock.welcome_create') }}</router-link>
        <router-link class="e-btn e-btn-lg" :to="{ name: 'restore', params: { from: 'new' } }"><EIcon name="backup" />{{ $t('msg.modern.unlock.welcome_restore') }}</router-link>
      </div>
      <div class="e-auth-alt">
        <button type="button" @click="select">{{ $t('msg.modern.unlock.welcome_open') }}</button>
      </div>
      <p v-if="error" class="e-error-msg e-onb-hero-error" role="alert"><EIcon name="alertc" /><span>{{ errMsg }}</span></p>
      <p class="e-onb-hero-note"><EIcon name="notebook" /><span>{{ $t('msg.modern.unlock.welcome_note') }}</span></p>
    </div>
    <AuthFoot />
  </div>
</template>

<script>
  import New from '@/components/New.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import AuthFoot from '@/components/modern/onboarding/AuthFoot.vue';

  export default reskin(New, { components: { EIcon, BrandTile, AuthFoot } });
</script>
