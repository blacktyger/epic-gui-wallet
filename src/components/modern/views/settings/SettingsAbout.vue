<template>
  <SettingsFrame>
    <section class="e-set-group" aria-labelledby="stg-ab-h">
      <h2 id="stg-ab-h">{{ $t('msg.modern.settings.about') }}</h2>
      <div class="e-set-list">
        <div class="e-set-row">
          <div class="e-stg-about">
            <svg class="e-stg-mark" viewBox="0 0 281 324" aria-hidden="true"><use href="#i-mark" /></svg>
            <div>
              <b>{{ $t('msg.modern.settings.about_version', { v: version }) }}</b>
              <dl class="e-stg-stats">
                <div><dt>{{ $t('msg.modern.settings.network') }}</dt><dd>{{ network }}</dd></div>
              </dl>
            </div>
          </div>
        </div>
        <a class="e-set-row e-stg-linkrow" :href="github" @click.prevent="open(github)">
          <div><b>{{ $t('msg.modern.settings.source_code') }}</b><p class="e-mono" translate="no">github.com/EpicCash/epic-gui-wallet</p></div>
          <span class="e-ctl"><EIcon name="github" size="sm" /><EIcon name="external" size="sm" /></span>
        </a>
        <a class="e-set-row e-stg-linkrow" :href="community" @click.prevent="open(community)">
          <div><b>{{ $t('msg.modern.settings.community') }}</b><p>{{ $t('msg.modern.settings.community_hint') }}</p><p class="e-mono" translate="no">epiccash.com</p></div>
          <span class="e-ctl"><EIcon name="external" size="sm" /></span>
        </a>
      </div>
    </section>

    <section class="e-set-group" aria-labelledby="stg-up-h">
      <h2 id="stg-up-h">{{ $t('msg.modern.settings.updates') }}</h2>
      <div class="e-set-list">
        <div v-if="!updates.length" class="e-set-row"><p>{{ $t('msg.modern.settings.updates_empty') }}</p></div>
        <div v-for="(item, i) in updates" :key="item.id || i" class="e-set-row e-stg-update">
          <div>
            <b v-if="isError(item)" class="e-stg-upd-state e-is-bad"><EIcon name="alertc" size="sm" />{{ $t('msg.modern.settings.update_error') }}</b>
            <b v-else class="e-stg-upd-state"><EIcon name="info" size="sm" />{{ $t('msg.modern.settings.update_info') }}</b>
            <p class="e-stg-upd-text e-mono" translate="no">{{ item.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="e-set-group" aria-labelledby="stg-cr-h">
      <h2 id="stg-cr-h">{{ $t('msg.modern.settings.about_credits') }}</h2>
      <div class="e-set-list">
        <div class="e-set-row e-stg-credit-row">
          <span class="e-stg-btl-logo" role="img" :aria-label="$t('msg.modern.credit_btlabs')">
            <img class="e-btl-dark" src="@/assets/btlabs/btlabs-logo.svg" alt="" />
            <img class="e-btl-light" src="@/assets/btlabs/btlabs-logo-light.svg" alt="" />
          </span>
          <div>
            <Credits large />
            <p class="e-small e-faint">{{ $t('msg.modern.settings.thanks') }}</p>
          </div>
        </div>
      </div>
    </section>
  </SettingsFrame>
</template>

<script>
  import About from '@/components/About.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';
  import Credits from '@/components/modern/ui/Credits.vue';
  import { useStore } from '@/store';

  export default reskin(About, {
    components: { EIcon, SettingsFrame, Credits },
    data() {
      return { github: 'https://github.com/EpicCash/epic-gui-wallet', community: 'https://epiccash.com/' };
    },
    computed: {
      //the updates log, which Classic shows in its right aside
      updates() { return useStore().state.updates || []; },
      network() { return this.configService.defaultAccountNetwork || ''; },
    },
    methods: {
      isError(item) { return item.status == 'is-danger'; },
    },
  });
</script>
