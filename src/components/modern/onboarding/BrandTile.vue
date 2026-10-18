<template>
  <div class="e-glyph-tile e-ticked" :class="{ 'e-gridfield': grid }">
    <span class="e-tick e-tl"></span><span class="e-tick e-tr"></span><span class="e-tick e-bl"></span><span class="e-tick e-br"></span>
    <svg viewBox="0 0 281 324" aria-hidden="true"><use href="#i-mark" /></svg>
  </div>
</template>

<script>
  export default {
    name: 'BrandTile',
    props: { grid: { type: Boolean, default: false } },
  };
</script>
