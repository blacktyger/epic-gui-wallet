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
                <h1 class="title has-text-centered">{{ $t('msg.wallets.error_title') }}</h1>
                <article class="message is-danger" role="alert">
                  <div class="message-body">
                    <p>{{ $t('msg.wallets.error_text') }}</p>
                    <p style="margin-top: 0.5rem;"><code style="word-break: break-all;">{{ settingsFile }}</code></p>
                    <p v-if="loadError" style="margin-top: 0.5rem;">{{ $t('msg.wallets.error_reason', [loadError]) }}</p>
                  </div>
                </article>
                <p>{{ $t('msg.wallets.error_fix') }}</p>
                <p class="help">{{ $t('msg.wallets.error_backup') }}</p>
                <div class="buttons is-centered" style="margin-top: 1.5rem;">
                  <button type="button" class="button is-outlined" @click="openFolder">{{ $t('msg.wallets.open_folder') }}</button>
                  <button type="button" class="button is-outlined" @click="quit">{{ $t('msg.wallets.quit') }}</button>
                  <button type="button" class="button is-primary" @click="tryAgain">{{ $t('msg.wallets.try_again') }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
  /* settings.json exists but can't be read (a hand edit with a typo, a newer version's file):
     the app writes nothing until it is fixed or removed, so the wallet list is never lost */
  export default {
    name: 'settings-error',
    computed: {
      settingsFile() {
        const p = this.configService.paths || {};
        return p.settingsFile || '';
      },
      settingsDir() {
        const p = this.configService.paths || {};
        return p.root || '';
      },
      loadError() {
        const s = this.configService.settings;
        return s ? s.loadError : '';
      },
    },
    methods: {
      openFolder() {
        if (this.settingsDir) window.openepichidden.open(this.settingsDir);
      },
      quit() {
        window.api.quit();
      },
      //the window starts again and reads the file again
      tryAgain() {
        window.api.reloadUi();
      },
    },
  };
</script>
