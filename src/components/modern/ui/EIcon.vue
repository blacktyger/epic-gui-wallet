<template>
  <!-- a symbol from the sprite (ui/icons.js). Decorative unless it gets a label. -->
  <svg
    class="e-icon"
    :class="size ? 'e-icon-' + size : null"
    :role="label ? 'img' : null"
    :aria-label="label || null"
    :aria-hidden="label ? null : 'true'"
    focusable="false"
  ><use :href="'#i-' + name" /></svg>
</template>

<script>
  export default {
    name: 'EIcon',
    props: {
      name: { type: String, required: true },
      //'sm' (16 px) | 'lg' (24 px); default 20 px
      size: { type: String, default: '' },
      label: { type: String, default: '' },
    },
  };
</script>
