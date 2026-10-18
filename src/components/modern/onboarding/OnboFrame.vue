<template>
  <!-- The frame of a first-run step: the step rail on the side, the step in the main column and
       the action bar pinned at its foot. -->
  <div class="e-onb">
    <aside class="e-onb-side">
      <div class="e-onb-brand">
        <svg viewBox="0 0 281 324" aria-hidden="true"><use href="#i-mark" /></svg>
        <div><b>Epic Cash</b><span>{{ side }}</span></div>
      </div>
      <nav class="e-onb-steps" :aria-label="$t('msg.modern.unlock.steps')">
        <div v-for="group in groups" :key="group.title" class="e-onb-group">
          <h2>{{ group.title }}</h2>
          <ol class="e-rail">
            <li
              v-for="item in group.items"
              :key="item.key"
              :class="{ 'e-is-done': item.state == 'done' }"
              :aria-current="item.state == 'now' ? 'step' : null"
            >{{ item.label }}<span v-if="item.state == 'done'" class="e-sr-only"> ({{ $t('msg.modern.unlock.done') }})</span></li>
          </ol>
        </div>
      </nav>
      <div class="e-onb-side-foot">
        <slot name="side-foot" />
        <p v-if="version">{{ $t('msg.modern.wallet_version', { v: version }) }}</p>
      </div>
    </aside>
    <main class="e-onb-main e-onb-flow">
      <div class="e-inner">
        <header class="e-onb-head">
          <h1 ref="heading" tabindex="-1">{{ title }}</h1>
          <p v-if="lead" class="e-lead">{{ lead }}</p>
        </header>
        <slot />
      </div>
      <div class="e-onb-actions e-onb-pin"><slot name="actions" /></div>
    </main>
  </div>
</template>

<script>
  export default {
    name: 'OnboFrame',
    props: {
      //the line under the brand: "New wallet", "Restore wallet", "Set up"
      side: { type: String, default: '' },
      //[{title, items: [{key, label, state: 'done' | 'now' | 'todo'}]}]
      groups: { type: Array, default: () => [] },
      title: { type: String, default: '' },
      lead: { type: String, default: '' },
      //false while a v-show hides this frame
      active: { type: Boolean, default: true },
      //changes with the step shown inside one frame
      stepKey: { type: String, default: '' },
      //a step reached after the first one: the heading takes the focus when it opens
      focusHeading: { type: Boolean, default: false },
    },
    data() {
      return { version: '' };
    },
    watch: {
      active(v) { if (v) this.focusTitle(); },
      stepKey() { if (this.active) this.focusTitle(); },
    },
    async mounted() {
      if (this.focusHeading && this.active) this.focusTitle();
      try { this.version = await window.api.version(); } catch (e) { this.version = ''; }
    },
    methods: {
      focusTitle() {
        this.$nextTick(() => {
          const h = this.$refs.heading;
          if (h) h.focus({ preventScroll: true });
        });
      },
    },
  };
</script>
