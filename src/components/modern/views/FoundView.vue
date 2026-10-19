<template>
  <div class="e-hero-screen e-oldw-screen">
    <div class="e-oldw">
      <BrandTile />

      <!-- looking (later visits only: the first start scans before this screen opens) -->
      <div v-if="loading" class="e-auth-title" role="status">
        <h1><span class="e-spinner" aria-hidden="true"></span> {{ $t('msg.wallets.found_looking') }}</h1>
      </div>

      <!-- some imports failed: which and why, then go on -->
      <template v-else-if="failed.length">
        <div class="e-auth-title">
          <h1 ref="heading" tabindex="-1">{{ $t('msg.wallets.found_failed_title', failed.length) }}</h1>
          <p v-if="importedCount">{{ $t('msg.wallets.found_some_imported', importedCount) }}</p>
        </div>
        <div class="e-notice e-risk" role="alert">
          <EIcon name="alertc" />
          <div>
            <b>{{ $t('msg.wallets.found_failed_lead') }}</b>
            <ul class="e-oldw-failed">
              <li v-for="f in failed" :key="f.key"><b>{{ f.name }}</b>: {{ f.reason }}</li>
            </ul>
          </div>
        </div>
        <div class="e-row e-oldw-actions">
          <span class="e-grow"></span>
          <button type="button" class="e-btn e-btn-primary" @click="finish">{{ $t('msg.wallets.continue') }}<EIcon name="arrowr" /></button>
        </div>
      </template>

      <!-- nothing (left) to import -->
      <template v-else-if="nothingFound">
        <div class="e-auth-title">
          <h1 ref="heading" tabindex="-1">{{ $t('msg.wallets.found_none_title') }}</h1>
          <p>{{ $t('msg.wallets.found_none_text') }}</p>
        </div>
        <p v-if="error" class="e-error-msg e-oldw-error" role="alert"><EIcon name="alertc" /><span>{{ error }}</span></p>
        <div class="e-row e-oldw-actions e-oldw-center">
          <button type="button" class="e-btn e-btn-ghost" @click="back"><EIcon name="chevl" />{{ $t('msg.back') }}</button>
          <button type="button" class="e-btn" @click="load"><EIcon name="refresh" />{{ $t('msg.wallets.found_search_again') }}</button>
        </div>
      </template>

      <form v-else novalidate @submit.prevent="submit">
        <div class="e-auth-title">
          <h1 ref="heading" tabindex="-1">{{ title }}</h1>
        </div>
        <div class="e-notice e-gold">
          <EIcon name="info" />
          <div><p>{{ $t('msg.wallets.found_note') }}</p></div>
        </div>

        <ul v-if="wallets.length" class="e-panel e-oldw-list" :aria-label="$t('msg.wallets.found_list')">
          <li v-for="(w, i) in wallets" :key="w.key" class="e-oldw-row" :class="{ 'e-is-fresh': choice[w.key] === 'fresh' }">
            <div class="e-glyph-sq" aria-hidden="true"><EIcon name="wallet" /></div>
            <div class="e-oldw-info">
              <p class="e-oldw-name">
                <b :id="'found-n-' + i">{{ rowName(w, i) }}</b>
                <span v-if="badge(w.network)" class="e-tag e-warn">{{ badge(w.network) }}</span>
              </p>
              <p class="e-mono e-oldw-dir" :title="w.dir" translate="no">{{ short(w.dir) }}</p>
              <p v-if="rowMeta(w)" class="e-oldw-meta">{{ rowMeta(w) }}</p>
              <p v-if="w.legacyDb" class="e-oldw-legacy"><EIcon name="history" size="sm" /><span>{{ $t('msg.wallets.found_legacy_db') }}</span></p>
            </div>
            <fieldset class="e-oldw-choice">
              <legend class="e-sr-only">{{ $t('msg.wallets.found_choice_label', [rowName(w, i)]) }}</legend>
              <label>
                <input type="radio" :name="'found-' + i" value="import" v-model="choice[w.key]" />
                <span>{{ $t('msg.wallets.found_import') }}</span>
              </label>
              <label>
                <input type="radio" :name="'found-' + i" value="fresh" v-model="choice[w.key]" />
                <span>{{ $t('msg.wallets.found_fresh') }}</span>
              </label>
            </fieldset>
          </li>
        </ul>

        <label v-if="chain" class="e-onb-check e-oldw-chain">
          <input type="checkbox" v-model="reuseChain" />
          <span :title="chain.dir">{{ $t('msg.wallets.found_reuse_chain', [short(chain.dir), size(chain.bytes)]) }}</span>
        </label>

        <p v-if="error" class="e-error-msg e-oldw-error" role="alert"><EIcon name="alertc" /><span>{{ error }}</span></p>

        <div class="e-row e-oldw-actions">
          <button v-if="from" type="button" class="e-btn e-btn-ghost" :disabled="busy" @click="back"><EIcon name="chevl" />{{ $t('msg.back') }}</button>
          <span class="e-grow"></span>
          <button v-if="wallets.length" type="button" class="e-btn" :disabled="busy" @click="startFresh">{{ $t('msg.wallets.found_fresh_all') }}</button>
          <button type="submit" class="e-btn e-btn-primary" :aria-disabled="busy ? 'true' : null" :aria-busy="busy ? 'true' : null">
            <span v-if="busy" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="download" />{{ primaryLabel }}
          </button>
        </div>
      </form>
    </div>
    <AuthFoot />
  </div>
</template>

<script>
  import Found from '@/components/Found.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import BrandTile from '@/components/modern/onboarding/BrandTile.vue';
  import AuthFoot from '@/components/modern/onboarding/AuthFoot.vue';

  export default reskin(Found, {
    components: { EIcon, BrandTile, AuthFoot },
    watch: {
      //each state opens with its heading focused, so a screen reader reads what changed
      loading(now) { if (!now) this.focusHeading(); },
      'failed.length'(n) { if (n) this.focusHeading(); },
    },
    methods: {
      focusHeading() {
        this.$nextTick(() => { const h = this.$refs.heading; if (h && h.focus) h.focus({ preventScroll: true }); });
      },
    },
  });
</script>
