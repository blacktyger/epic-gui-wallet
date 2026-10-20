<template>
  <SettingsFrame>
    <section class="e-set-group" aria-labelledby="stg-sup-h">
      <h2 id="stg-sup-h">{{ $t('msg.support.entry_title') }}</h2>
      <div class="e-stg-support">
        <button type="button" class="e-btn" @click="openSupport"><EIcon name="bug" />{{ $t('msg.support.open') }}</button>
      </div>
    </section>
    <section class="e-set-group" aria-labelledby="stg-hp-h">
      <h2 id="stg-hp-h">{{ $t('msg.modern.settings.help') }}</h2>

      <form class="e-stg-search" role="search" @submit.prevent="search">
        <label class="e-sr-only" for="stg-help-q">{{ $t('msg.modern.settings.help_search') }}</label>
        <div class="e-input-wrap">
          <input id="stg-help-q" class="e-input" type="search" autocomplete="off" :placeholder="$t('msg.placeholder_search')" v-model="keyword" />
          <div class="e-trail">
            <button v-if="!searched" type="submit" class="e-icon-btn" :aria-label="$t('msg.modern.settings.help_search_go')"><EIcon name="search" size="sm" /></button>
            <button v-else type="button" class="e-icon-btn" :aria-label="$t('msg.modern.settings.help_search_clear')" @click.prevent="clearup(false)"><EIcon name="close" size="sm" /></button>
          </div>
        </div>
      </form>

      <!-- The search and toggle logic is Help.vue's and finds the topics by these message-* hooks -->
      <div class="e-stg-faq">
        <article v-for="(topic, index) in helpContent" :key="index" class="e-stg-topic">
          <div class="message-header e-stg-topic-head">
            <button type="button" class="e-stg-topic-btn" :data-toggle="'accordion-' + index" :aria-controls="'accordion-' + index" aria-expanded="false" :aria-labelledby="'accordion-t-' + index" @click="toggleState"><EIcon name="chevr" size="sm" /></button>
            <p :id="'accordion-t-' + index">{{ topic.title }}</p>
          </div>
          <div class="message-body e-stg-topic-body is-hidden" :id="'accordion-' + index">
            <div class="message-body-content" :data-toggle="'accordion-' + index">
              <p><span v-html="topic.text"></span></p>
            </div>
          </div>
        </article>
      </div>
    </section>
  </SettingsFrame>
</template>

<script>
  import Help from '@/components/Help.vue';
  import { reskin } from '@/components/modern/reskin';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import SettingsFrame from '@/components/modern/settings/SettingsFrame.vue';

  export default reskin(Help, {
    components: { EIcon, SettingsFrame },
    methods: {
      //Help.vue opens and closes topics by toggling classes on the DOM; mirror that in aria-expanded
      syncExpanded() {
        document.querySelectorAll('.e-stg-topic-btn').forEach(btn => {
          const body = document.getElementById(btn.getAttribute('aria-controls'));
          btn.setAttribute('aria-expanded', body && !body.classList.contains('is-hidden') ? 'true' : 'false');
        });
      },
      toggleState(...args) {
        Help.methods.toggleState.apply(this, args);
        this.syncExpanded();
      },
      clearup(...args) {
        Help.methods.clearup.apply(this, args);
        this.syncExpanded();
      },
    },
  });
</script>

<style>
  .e-stg-support { display: grid; gap: 12px; justify-items: start; }
  .e-stg-support p { margin: 0; color: var(--dim); }
</style>
