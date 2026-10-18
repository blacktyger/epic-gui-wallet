<template>
  <!-- the icon symbols EIcon refers to; rendered once by ModernApp -->
  <div class="e-sprite" aria-hidden="true" v-html="sprite"></div>
</template>

<script>
  import { ICON_SPRITE } from './icons.js';
  export default {
    name: 'IconSprite',
    setup() { return { sprite: ICON_SPRITE }; },
  };
</script>

<style>
  .e-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
</style>
