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

                <template v-else>
                  <h1 class="title has-text-centered">{{ title }}</h1>
                  <p class="has-text-centered" style="margin-bottom: 1rem;">{{ $t('msg.wallets.found_note') }}</p>

                  <div v-for="(w, i) in wallets" :key="w.key" class="box">
                    <p><b>{{ rowName(w, i) }}</b>
                      <span v-if="badge(w.network)" class="tag is-warning is-light" style="margin-left: 0.5rem;">{{ badge(w.network) }}</span></p>
                    <p class="is-size-7"><code :title="w.dir">{{ short(w.dir) }}</code></p>
                    <p class="is-size-7">{{ rowMeta(w) }}</p>
                    <p v-if="w.legacyDb" class="is-size-7 has-text-warning">{{ $t('msg.wallets.found_legacy_db') }}</p>
                    <div class="control" role="radiogroup" :aria-label="$t('msg.wallets.found_choice_label', [rowName(w, i)])" style="margin-top: 0.5rem;">
                      <label class="radio"><input type="radio" :name="'found-' + i" value="import" v-model="choice[w.key]"> {{ $t('msg.wallets.found_import') }}</label>
                      <label class="radio"><input type="radio" :name="'found-' + i" value="fresh" v-model="choice[w.key]"> {{ $t('msg.wallets.found_fresh') }}</label>
                    </div>
                  </div>

                  <label v-if="chain" class="checkbox" style="display: block; margin: 1rem 0;">
                    <input type="checkbox" v-model="reuseChain">
                    {{ $t('msg.wallets.found_reuse_chain', [short(chain.dir), size(chain.bytes)]) }}
                  </label>

                  <p v-if="error" class="has-text-danger" role="alert">{{ error }}</p>
                  <div class="buttons is-centered">
                    <button v-if="from" type="button" class="button is-outlined" :disabled="busy" @click="back">{{ $t('msg.back') }}</button>
                    <button v-if="wallets.length" type="button" class="button is-outlined" :disabled="busy" @click="startFresh">{{ $t('msg.wallets.found_fresh_all') }}</button>
                    <button type="button" class="button is-primary" :class="{ 'is-loading': busy }" :disabled="busy" @click="submit">{{ primaryLabel }}</button>
                  </div>
                </template>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
  import { takeScan, shortPath, homeShort, formatBytes, formatDate, networkBadge, walletOpen } from '@/components/wallets';

  /*
   * Wallets an older Epic Wallet left on this computer (importer.scan): import each one, or
   * start fresh. Shown once on the first start, and again from Welcome › Advanced and
   * Settings › Add another wallet (route query from: 'new' | 'settings'). The older app's files
   * are not changed; each choice is stored, so a wallet is not offered twice.
   */
  export default {
    name: 'found',
    mixins: [walletOpen],
    data() {
      return {
        loading: true,
        scan: null,
        //key → 'import' | 'fresh'
        choice: {},
        reuseChain: true,
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
      //the chain data to offer: mainnet first, then the largest
      chain() {
        const chains = ((this.scan && this.scan.chains) || []).slice();
        chains.sort((a, b) => (a.network === 'mainnet' ? 0 : 1) - (b.network === 'mainnet' ? 0 : 1) || (b.bytes || 0) - (a.bytes || 0));
        return chains[0] || null;
      },
      nothingFound() {
        return !this.loading && !this.wallets.length && !this.chain;
      },
      importKeys() {
        return this.wallets.filter(w => this.choice[w.key] !== 'fresh').map(w => w.key);
      },
      title() {
        return this.wallets.length ? this.$t('msg.wallets.found_title', this.wallets.length) : this.$t('msg.wallets.found_chain_title');
      },
      //"Import all" while every row says Import, else what the choices add up to
      primaryLabel() {
        const n = this.importKeys.length;
        if (!this.wallets.length || n === 0) return this.$t('msg.wallets.continue');
        if (n === this.wallets.length) return this.$t('msg.wallets.found_import_all', n);
        return this.$t('msg.wallets.found_import_some', { n, total: this.wallets.length });
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
        const choice = {};
        this.wallets.forEach(w => { choice[w.key] = 'import'; });
        this.choice = choice;
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
        return shortPath(homeShort(dir, this.configService), 56);
      },
      size: formatBytes,
      setAll(value) {
        const choice = {};
        this.wallets.forEach(w => { choice[w.key] = value; });
        this.choice = choice;
      },
      startFresh() {
        this.setAll('fresh');
        this.submit();
      },
      async submit() {
        if (this.busy) return;
        this.busy = true;
        this.error = '';
        const settings = this.configService.settings;
        const firstRun = settings.isFirstRun();
        const imports = this.importKeys;
        const fresh = this.wallets.filter(w => this.choice[w.key] === 'fresh').map(w => w.key);
        const reuseChain = !!(this.chain && this.reuseChain);
        try {
          let result = { imported: [], failed: [] };
          if (imports.length) {
            result = await this.$importer.importWallets(imports, { reuseChain });
          }
          if (fresh.length) {
            await this.$importer.markFresh(fresh);
          }
          //the importer sets the chain data for the networks it imported; with nothing imported
          //(Start fresh, or chain data only) the built-in node still reuses it when ticked
          let saved = true;
          if (reuseChain && !settings.nodeChainDir(this.chain.network)) {
            saved = settings.setNodeChainDir(this.chain.network, this.chain.dir) && saved;
          }
          if (firstRun) {
            saved = settings.markScanned(this.wallets.length) && saved;
          }
          //settings.json could not be written (the choices stay for this session): say so, go on
          if (!saved) {
            this.$toast.error(this.$t('msg.settings.error_save'));
          }
          const imported = (result && result.imported) || [];
          //(the importer makes the first imported wallet the default when there was none)
          this.result = { imported, failed: (result && result.failed) || [] };
          console.log('[found] imported ' + imported.length + ', failed ' + this.result.failed.length + ', fresh ' + fresh.length);
          if (this.result.failed.length) {
            this.failed = this.result.failed.map(f => {
              const i = this.wallets.findIndex(w => w.key === f.key);
              return { key: f.key, reason: f.reason || '?', name: i >= 0 ? this.rowName(this.wallets[i], i) : f.key };
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
          await this.logoutCurrent();
          this.$router.push({ name: 'login', query: { wallet: imported[0].walletId } });
          return;
        }
        this.back();
      },
      back() {
        if (this.from === 'settings') {
          this.$router.push({ name: 'account' });
        } else if (this.from === 'new' || !this.configService.settings.wallets().length) {
          this.$router.push({ name: 'new' });
        } else {
          this.$router.push({ name: 'login' });
        }
      },
    },
  };
</script>
