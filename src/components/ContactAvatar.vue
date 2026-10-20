<template>
  <!-- a contact's picture, or its initials on the colour of its name (shared/avatar.js). Both
       interfaces use it; it is decorative (the name is always next to it) unless it gets a label. -->
  <span
    class="cav"
    :class="['cav-' + size, { 'cav-img': !!shownImage }]"
    :style="shownImage ? null : colours"
    :role="label ? 'img' : null"
    :aria-label="label || null"
    :aria-hidden="label ? null : 'true'"
  >
    <img v-if="shownImage" :src="shownImage" alt="" draggable="false" @error="broken = true" />
    <template v-else-if="letters">{{ letters }}</template>
    <svg v-else class="cav-glyph" viewBox="0 0 24 24" focusable="false"><path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z" /></svg>
  </span>
</template>

<script>
  import { avatarColor, avatarInitials } from '@/shared/avatar.js';
  import { isSafeAvatarDataUrl } from '@/shared/avatarImage.js';

  export default {
    name: 'ContactAvatar',
    props: {
      name: { type: String, default: '' },
      //a data: URL this app made (shared/avatarImage.js); anything else is not shown
      image: { type: String, default: '' },
      //'sm' 28 px | 'md' 40 px | 'lg' 56 px | 'xl' 72 px
      size: { type: String, default: 'md' },
      label: { type: String, default: '' },
    },
    data() {
      return { broken: false };
    },
    computed: {
      shownImage() {
        return !this.broken && isSafeAvatarDataUrl(this.image) ? this.image : '';
      },
      letters() { return avatarInitials(this.name); },
      colours() {
        const c = avatarColor(this.name);
        return { '--cav-bg': c.dark.bg, '--cav-fg': c.dark.fg, '--cav-bg-l': c.light.bg, '--cav-fg-l': c.light.fg };
      },
    },
    watch: {
      image() { this.broken = false; },
    },
  };
</script>

<style>
  .cav {
    --cav-size: 40px;
    display: inline-grid; place-items: center; flex: none; overflow: hidden;
    width: var(--cav-size); height: var(--cav-size); border-radius: 50%;
    background: var(--cav-bg); color: var(--cav-fg);
    font-family: 'Montserrat', system-ui, sans-serif; font-weight: 600;
    font-size: calc(var(--cav-size) * 0.38); line-height: 1; letter-spacing: 0.01em;
    user-select: none; white-space: nowrap;
  }
  html[data-theme='light'] .cav { background: var(--cav-bg-l); color: var(--cav-fg-l); }
  .cav-sm { --cav-size: 28px; }
  .cav-md { --cav-size: 40px; }
  .cav-lg { --cav-size: 56px; }
  .cav-xl { --cav-size: 72px; }
  .cav-img { background: transparent; }
  .cav img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cav-glyph { width: 56%; height: 56%; fill: currentColor; }
  @media (forced-colors: active) {
    .cav { border: 1px solid CanvasText; }
  }
</style>
