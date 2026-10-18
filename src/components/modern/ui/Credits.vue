<template>
  <!-- "Wallet by Johannes Hahn · Theme by BT Labs": the wallet's author first, both equally quiet.
       Links open in the system browser. BT Labs Theme only (Classic never renders this). -->
  <p class="e-credits" :class="{ 'e-credits-lg': large }">
    <span>{{ $t('msg.modern.credit_wallet') }} <a :href="authorUrl" :title="$t('msg.modern.credit_open', { name: $t('msg.modern.credit_author') })" @click.prevent="open(authorUrl)">{{ $t('msg.modern.credit_author') }}</a></span>
    <span v-if="large" class="e-credits-sep" aria-hidden="true">·</span>
    <span>{{ $t('msg.modern.credit_theme') }} <a :href="btlabsUrl" class="e-credits-btl" :title="$t('msg.modern.credit_open', { name: $t('msg.modern.credit_btlabs') })" @click.prevent="open(btlabsUrl)"><span class="e-btl-mark" aria-hidden="true"></span>{{ $t('msg.modern.credit_btlabs') }}</a></span>
  </p>
</template>

<script>
  export default {
    name: 'Credits',
    props: {
      //About shows it a little larger than the sidebar
      large: { type: Boolean, default: false },
    },
    data() {
      return { authorUrl: 'https://github.com/johanneshahn', btlabsUrl: 'https://btlabs.uk' };
    },
    methods: {
      open(url) {
        if (window.openlink && window.openlink.open) window.openlink.open(url);
      },
    },
  };
</script>

<style>
  .e-credits { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; margin: 0; padding: 0 var(--sp-2); color: var(--faint); font-size: var(--fs-xs); line-height: 1.5; opacity: 0.8; }
  .e-credits a { color: inherit; text-decoration: none; border-radius: var(--r-xs); }
  .e-credits a:hover { color: var(--dim); text-decoration: underline; text-underline-offset: 2px; }
  .e-credits-sep { opacity: 0.7; }
  .e-credits-btl { display: inline-flex; align-items: center; gap: 4px; }
  /* the BT Labs mark: the asset is a one-colour SVG used as a mask, so it follows the text colour */
  .e-btl-mark {
    display: inline-block; width: 0.95em; height: 0.85em; background: currentColor;
    -webkit-mask: url('~@/assets/btlabs/btlabs-mark.svg') center / contain no-repeat;
    mask: url('~@/assets/btlabs/btlabs-mark.svg') center / contain no-repeat;
  }
  /* sidebar: one credit per line */
  .e-credits:not(.e-credits-lg) { flex-direction: column; align-items: flex-start; }
  .e-credits-lg { font-size: var(--fs-sm); padding: 0; opacity: 1; }
</style>
