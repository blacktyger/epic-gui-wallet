<template>
  <!-- a "…" button with a small menu of actions for one row (Contacts). Both interfaces; self-styled.
       Menu button pattern: Enter/Space/↓ open it on the first item, ↑ on the last; ↑/↓/Home/End move;
       Esc or Tab closes it and the focus goes back to the button. Placed fixed so a scrolling list
       does not cut it off. -->
  <span class="rmenu">
    <button
      ref="trigger"
      type="button"
      class="rmenu-btn"
      :aria-label="label"
      :title="label"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? uid : null"
      @click.stop="toggle"
      @keydown.down.prevent="show(0)"
      @keydown.up.prevent="show(-1)"
    ><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z" /></svg></button>
    <ul
      v-if="open"
      :id="uid"
      ref="menu"
      class="rmenu-list"
      role="menu"
      :aria-label="label"
      :style="pos"
      @keydown="onKey"
    >
      <li v-for="(it, i) in items" :key="it.key" role="none">
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          class="rmenu-item"
          :class="{ 'rmenu-danger': it.danger }"
          @click="pick(it, i)"
        >{{ it.label }}</button>
      </li>
    </ul>
  </span>
</template>

<script>
  let seq = 0;

  export default {
    name: 'RowMenu',
    props: {
      //the button's name for screen readers, e.g. "More for Mara Okafor"
      label: { type: String, required: true },
      //[{ key, label, danger? }]
      items: { type: Array, default: () => [] },
    },
    emits: ['select'],
    data() {
      return { open: false, uid: 'rmenu-' + (++seq), pos: null };
    },
    beforeUnmount() {
      this.unlisten();
    },
    methods: {
      toggle() {
        if (this.open) this.close(true);
        else this.show(0);
      },
      /* open with the focus on item `at` (-1: the last) */
      show(at) {
        if (!this.items.length) return;
        this.place();
        this.open = true;
        this.$nextTick(() => {
          this.focusItem(at < 0 ? this.items.length - 1 : at);
          document.addEventListener('mousedown', this.onOutside, true);
          window.addEventListener('resize', this.onAway);
          window.addEventListener('scroll', this.onAway, true);
        });
      },
      close(refocus) {
        if (!this.open) return;
        this.open = false;
        this.unlisten();
        if (refocus && this.$refs.trigger) this.$refs.trigger.focus();
      },
      unlisten() {
        document.removeEventListener('mousedown', this.onOutside, true);
        window.removeEventListener('resize', this.onAway);
        window.removeEventListener('scroll', this.onAway, true);
      },
      /* below the button, its end edge on the button's end edge; above it when there is no room below */
      place() {
        const t = this.$refs.trigger;
        if (!t || !t.getBoundingClientRect) return;
        const r = t.getBoundingClientRect();
        const rtl = document.documentElement.dir === 'rtl';
        const vh = window.innerHeight || 800;
        const vw = window.innerWidth || 1200;
        const below = vh - r.bottom > 44 * this.items.length + 16;
        const p = { position: 'fixed' };
        if (below) p.top = Math.round(r.bottom + 4) + 'px';
        else p.bottom = Math.round(vh - r.top + 4) + 'px';
        if (rtl) p.left = Math.round(r.left) + 'px';
        else p.right = Math.round(vw - r.right) + 'px';
        this.pos = p;
      },
      itemEls() {
        return this.$refs.menu ? Array.from(this.$refs.menu.querySelectorAll('[role=menuitem]')) : [];
      },
      focusItem(i) {
        const els = this.itemEls();
        if (!els.length) return;
        els[(i + els.length) % els.length].focus();
      },
      onKey(e) {
        const els = this.itemEls();
        const i = els.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); this.focusItem(i + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.focusItem(i - 1); }
        else if (e.key === 'Home') { e.preventDefault(); this.focusItem(0); }
        else if (e.key === 'End') { e.preventDefault(); this.focusItem(els.length - 1); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(true); }
        else if (e.key === 'Tab') { this.close(false); }
      },
      onOutside(e) {
        if (this.$el && this.$el.contains && this.$el.contains(e.target)) return;
        this.close(false);
      },
      onAway() { this.close(false); },
      pick(it) {
        //the focus goes back to the button first, so an action that opens a dialog returns it there
        this.close(true);
        this.$emit('select', it.key);
      },
    },
  };
</script>

<style>
  .rmenu { display: inline-flex; flex: none; }
  .rmenu-btn {
    display: inline-grid; place-items: center; width: 36px; height: 36px; padding: 0;
    border: 1px solid transparent; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; opacity: 0.8;
  }
  .rmenu-btn svg { width: 20px; height: 20px; fill: currentColor; }
  .rmenu-btn:hover, .rmenu-btn[aria-expanded='true'] { opacity: 1; background: rgba(255, 255, 255, 0.07); }
  .rmenu-btn:focus-visible { outline: 2px solid #f6d471; outline-offset: 1px; opacity: 1; }
  .rmenu-list {
    z-index: 60; min-width: 200px; margin: 0; padding: 4px; list-style: none;
    background: #22222b; color: #fff9f9; border: 1px solid #33333d; border-radius: 10px;
    box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4);
  }
  .rmenu-item {
    display: block; width: 100%; min-height: 36px; padding: 6px 12px; border: 0; border-radius: 6px;
    background: none; color: inherit; font: inherit; font-size: 0.875rem; text-align: start; cursor: pointer; white-space: nowrap;
  }
  .rmenu-item:hover, .rmenu-item:focus { background: rgba(255, 255, 255, 0.08); outline: none; }
  .rmenu-item:focus-visible { box-shadow: inset 0 0 0 2px #f6d471; }
  .rmenu-danger { color: #f08a8a; }
  /* Modern: its own tokens, so light follows */
  html[data-ui='modern'] .rmenu-list { background: var(--s4); color: var(--text); border-color: var(--line-strong); box-shadow: var(--shadow-pop); }
  html[data-ui='modern'] .rmenu-item:hover, html[data-ui='modern'] .rmenu-item:focus { background: var(--hover); }
  html[data-ui='modern'] .rmenu-item:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
  html[data-ui='modern'] .rmenu-danger { color: var(--risk); }
  html[data-ui='modern'] .rmenu-btn { color: var(--dim); }
  html[data-ui='modern'] .rmenu-btn:hover, html[data-ui='modern'] .rmenu-btn[aria-expanded='true'] { background: var(--hover); color: var(--text); }
  html[data-ui='modern'] .rmenu-btn:focus-visible { outline-color: var(--accent); }
  @media (forced-colors: active) { .rmenu-list { border: 1px solid CanvasText; } }
</style>
