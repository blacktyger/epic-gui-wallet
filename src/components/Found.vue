<template>
  <section class="section hero is-fullheight">
    <div class="hero-body">
      <div class="container">
        <div class="columns is-centered">
          <div class="column is-three-quarters">
            <div class="card has-card-header-background">
              <header class="card-header" style="justify-content: center;">
                <img src="../assets/img/epiccash-brand-full.png" style="width: 190px; padding: 16px 0px;" alt="Epic Cash">
              </header>
              <div class="card-content">

                <p v-if="loading" class="has-text-centered" role="status">{{ $t('msg.wallets.found_looking') }}</p>

                <template v-else-if="failed.length">
                  <h1 class="title has-text-centered">{{ $t('msg.wallets.found_failed_title', failed.length) }}</h1>
                  <article class="message is-danger" role="alert">
                    <div class="message-body">
                      <p>{{ $t('msg.wallets.found_failed_lead') }}</p>
                      <ul>
                        <li v-for="f in failed" :key="f.key"><b>{{ f.name }}</b>: {{ f.reason }}</li>
                      </ul>
                    </div>
                  </article>
                  <p v-if="importedCount">{{ $t('msg.wallets.found_some_imported', importedCount) }}</p>
                  <div class="buttons is-centered">
                    <button type="button" class="button is-primary" @click="finish">{{ $t('msg.wallets.continue') }}</button>
                  </div>
                </template>

                <template v-else-if="nothingFound">
                  <h1 class="title has-text-centered">{{ $t('msg.wallets.found_none_title') }}</h1>
                  <p class="has-text-centered">{{ $t('msg.wallets.found_none_text') }}</p>
                  <p v-if="error" class="has-text-danger has-text-centered" role="alert">{{ error }}</p>
                  <div class="buttons is-centered" style="margin-top: 1rem;">
                    <button type="button" class="button is-outlined" @click="back">{{ $t('msg.back') }}</button>
                    <button type="button" class="button is-primary" @click="load">{{ $t('msg.wallets.found_search_again') }}</button>
                  </div>
                </template>

                <form v-else novalidate @submit.prevent="submit">
                  <h1 class="title is-4 has-text-centered">{{ title }}</h1>
                  <p v-if="wallets.length" class="has-text-centered found-lead">{{ $t('msg.wallets.found_lead', wallets.length) }}</p>

                  <ul v-if="wallets.length" class="found-list" :aria-label="$t('msg.wallets.found_list')">
                    <li v-for="(w, i) in wallets" :key="w.key">
                      <label class="box found-row" :class="{ 'is-unchecked': !checked[w.key] }">
                        <input type="checkbox" class="found-check" v-model="checked[w.key]" :disabled="busy"
                          :aria-labelledby="'found-n-' + i" :aria-describedby="'found-d-' + i">
                        <span class="found-body">
                          <span class="found-name">
                            <b :id="'found-n-' + i">{{ rowName(w, i) }}</b>
                            <span v-if="badge(w.network)" class="tag is-warning">{{ badge(w.network) }}</span>
                          </span>
                          <span :id="'found-d-' + i" class="found-details">
                            <span class="found-dir is-size-7"><code :title="w.dir" translate="no">{{ short(w.dir) }}</code></span>
                            <span v-if="rowMeta(w)" class="is-size-7 has-text-grey">{{ rowMeta(w) }}</span>
                            <span v-if="w.legacyDb" class="is-size-7 has-text-warning-dark">{{ $t('msg.wallets.found_legacy_db') }}</span>
                          </span>
                        </span>
                      </label>
                    </li>
                  </ul>

                  <p v-if="error" class="has-text-danger" role="alert">{{ error }}</p>

                  <div class="buttons is-centered found-actions">
                    <button type="button" class="button is-outlined" :disabled="busy" @click="notNow">{{ $t('msg.wallets.found_not_now') }}</button>
                    <button type="submit" class="button is-primary" :class="{ 'is-loading': busy }"
                      :aria-disabled="usable && !busy ? null : 'true'" :aria-busy="busy ? 'true' : null">{{ primaryLabel }}</button>
                  </div>
                  <p class="has-text-centered is-size-7">{{ $t('msg.wallets.found_note') }}</p>
                  <p v-if="wallets.length && from !== 'settings'" class="has-text-centered is-size-7 has-text-grey">{{ $t('msg.wallets.found_later', wallets.length) }}</p>
                  <p class="has-text-centered is-size-7 found-other">
                    {{ $t('msg.wallets.found_or') }}
                    <button type="button" class="found-other-link" :disabled="busy" @click="otherWay('create')">{{ $t('msg.wallets.found_or_create') }}</button>
                    <span class="found-other-sep" aria-hidden="true">·</span>
                    <button type="button" class="found-other-link" :disabled="busy" @click="otherWay('restore')">{{ $t('msg.wallets.found_or_restore') }}</button>
                  </p>
                </form>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
  import { takeScan, shortFolder, formatDate, networkBadge, walletOpen } from '@/components/wallets';
  import { canUse, foundPlan, initialChecked, backRoute } from '@/components/foundPlan';

  /*
   * Wallets an older Epic Wallet left on this computer (importer.scan): tick the ones to use here
   * (all are ticked), or Not now. Shown once on the first start, and again from
   * Add a wallet › Add an existing wallet (route query from: 'new' | 'settings'). The older app's
   * files are not changed. Imported wallets are stored as such; unticked ones and Not now are not
   * stored, so Import from an older Epic Wallet lists them again (foundPlan.js).
   */
  export default {
    name: 'found',
    mixins: [walletOpen],
    data() {
      return {
        loading: true,
        scan: null,
        //key → true (ticked) | false
        checked: {},
        busy: false,
        error: '',
        //importWallets' answer, kept while the failures are shown
        result: null,
        failed: [],
      };
    },
    computed: {
      from() {
        return this.$route.query.from || '';
      },
      wallets() {
        return (this.scan && this.scan.wallets) || [];
      },
      nothingFound() {
        return !this.loading && !this.wallets.length;
      },
      checkedCount() {
        return this.wallets.filter(w => this.checked[w.key]).length;
      },
      usable() {
        return canUse({ wallets: this.wallets, checked: this.checked });
      },
      title() {
        return this.$t('msg.wallets.found_title', this.wallets.length);
      },
      //"Use selected wallet" while one is ticked, else "Use selected wallets"
      primaryLabel() {
        return this.$t('msg.wallets.found_use', this.checkedCount === 1 ? 1 : 2);
      },
      importedCount() {
        return this.result && this.result.imported ? this.result.imported.length : 0;
      },
    },
    mounted() {
      this.load();
    },
    methods: {
      async load() {
        this.loading = true;
        this.error = '';
        try {
          this.scan = takeScan() || await this.$importer.scan();
        } catch (e) {
          this.scan = null;
          this.error = this.$t('msg.wallets.found_scan_failed', [e && e.message ? e.message : String(e)]);
        }
        this.checked = initialChecked(this.wallets);
        this.loading = false;
      },
      rowName(w, i) {
        return (w.label && String(w.label).trim()) || (w.account && w.account !== 'default' ? w.account : '')
          || this.$t('msg.wallets.wallet_n', [i + 1]);
      },
      rowMeta(w) {
        const parts = [];
        const used = formatDate(w.lastUsed, this.$i18n.locale);
        if (used) parts.push(this.$t('msg.wallets.found_last_used', [used]));
        if (typeof w.contacts === 'number') parts.push(this.$t('msg.wallets.found_contacts', w.contacts));
        if (w.app) parts.push(this.$t('msg.wallets.found_app', [w.app]));
        return parts.join(' · ');
      },
      badge: networkBadge,
      short(dir) {
        return shortFolder(dir, this.configService, 56);
      },
      planInput(settings) {
        return {
          wallets: this.wallets, checked: this.checked, firstRun: settings.isFirstRun(),
        };
      },
      /* Not now: nothing is imported, marked or set; the first start records the scan only */
      notNow() {
        if (this.busy) return;
        const settings = this.configService.settings;
        const plan = foundPlan('notNow', this.planInput(settings));
        if (plan.markScanned !== null && !settings.markScanned(plan.markScanned)) {
          this.$toast.error(this.$t('msg.settings.error_save'));
        }
        console.log('[found] not now: ' + this.wallets.length + ' left undecided');
        this.back();
      },
      /* Use selected wallets: import the ticked ones (the unticked stay undecided) */
      async submit() {
        if (this.busy) return;
        const settings = this.configService.settings;
        const plan = foundPlan('use', this.planInput(settings));
        //nothing ticked: the button says so (aria-disabled), there is nothing to do
        if (!plan) return;
        this.busy = true;
        this.error = '';
        try {
          let result = { imported: [], failed: [] };
          if (plan.importKeys.length) {
            result = await this.$importer.importWallets(plan.importKeys);
          }
          let saved = true;
          if (plan.markScanned !== null) {
            saved = settings.markScanned(plan.markScanned) && saved;
          }
          //settings.json could not be written (the choices stay for this session): say so, go on
          if (!saved) {
            this.$toast.error(this.$t('msg.settings.error_save'));
          }
          const imported = (result && result.imported) || [];
          //(the importer makes the first imported wallet the default when there was none)
          this.result = { imported, failed: (result && result.failed) || [] };
          console.log('[found] imported ' + imported.length + ', failed ' + this.result.failed.length
            + ', left ' + (this.wallets.length - plan.importKeys.length));
          if (this.result.failed.length) {
            this.failed = this.result.failed.map(f => {
              const i = this.wallets.findIndex(w => w.key === f.key);
              const reason = f.reason === 'inuse' ? this.$t('msg.wallets.folder_inuse') : f.reason || '?';
              return { key: f.key, reason, name: i >= 0 ? this.rowName(this.wallets[i], i) : f.key };
            });
            return;
          }
          await this.finish();
        } catch (e) {
          this.error = e && e.message ? e.message : String(e);
        } finally {
          this.busy = false;
        }
      },
      /* imported: unlock the first one (closing a wallet that is open); else back where we came from */
      async finish() {
        const imported = (this.result && this.result.imported) || [];
        if (imported.length) {
          await this.unlockAdded(imported[0].walletId);
          return;
        }
        this.back();
      },
      back() {
        this.$router.push({ name: backRoute(this.from, this.configService.settings.wallets().length > 0) });
      },
      /* Or: Create a new wallet · Restore from recovery phrase (name: 'create' | 'restore'), the
         Welcome flows (from Settings: another wallet). The first start records the scan as Not now
         does, so this screen doesn't come back at start; the found wallets stay undecided */
      otherWay(name) {
        if (this.busy) return;
        const settings = this.configService.settings;
        const plan = foundPlan('notNow', this.planInput(settings));
        if (plan.markScanned !== null && !settings.markScanned(plan.markScanned)) {
          this.$toast.error(this.$t('msg.settings.error_save'));
        }
        this.$router.push(this.from === 'settings' ? { name, query: { add: '1' } } : { name, params: { from: 'new' } });
      },
    },
  };
</script>

<style scoped>
  .found-other { margin-top: 0.75rem; }
  .found-other-sep { margin: 0 0.4em; }
  .found-other-link { background: none; border: 0; padding: 0; font: inherit; color: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
  .found-other-link:disabled { cursor: default; opacity: 0.6; }
  .found-lead { margin-bottom: 1rem; }
  .found-list { margin: 0 0 1rem; }
  .found-row { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.5rem; padding: 0.75rem 1rem; cursor: pointer; }
  .found-row:hover { box-shadow: 0 0 0 1px #b5b5b5; }
  .found-row:focus-within { box-shadow: 0 0 0 2px #485fc7; }
  .found-row.is-unchecked .found-body { opacity: 0.6; }
  .found-check { width: 1.1rem; height: 1.1rem; margin-top: 0.2rem; flex: none; cursor: pointer; }
  .found-body, .found-details { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
  .found-name { display: flex; align-items: center; gap: 0.5rem; }
  .found-dir code { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
  .found-actions { margin-top: 1rem; margin-bottom: 0.25rem; }
  .found-actions + p { margin-bottom: 0.25rem; }
  .button[aria-disabled='true']:not(.is-loading) { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
</style>

<style>
  /* Classic's dark mode keeps .box white but draws tags for a dark background: follow the dark card */
  html.is-dark-mode-active .found-row { background: transparent; color: inherit; box-shadow: 0 0 0 1px #4a4a4a; }
  html.is-dark-mode-active .found-row:hover { box-shadow: 0 0 0 1px #7a7a7a; }
  html.is-dark-mode-active .found-row:focus-within { box-shadow: 0 0 0 2px #485fc7; }
  html.is-dark-mode-active .found-row b { color: #f5f5f5; }
</style>
