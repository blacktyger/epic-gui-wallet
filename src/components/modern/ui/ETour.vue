<template>
  <!-- A short guided tour: one coachmark at a time next to the element it explains. Skip on
       every step, Esc and a click outside end it; focus stays in the card while it runs and
       returns to where it was when it ends. -->
  <div class="e-tour" @keydown="onKey">
    <div class="e-tour-catch" aria-hidden="true" @click="finish('skip')"></div>
    <div v-if="rect" class="e-tour-ring" aria-hidden="true" :style="ringStyle"></div>
    <div
      ref="card"
      class="e-tour-card"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'e-tour-t'"
      :aria-describedby="'e-tour-d'"
      :style="cardStyle"
      :data-side="side"
    >
      <p class="e-tour-count">{{ $t('msg.modern.tour_step', { n: index + 1, total: steps.length }) }}</p>
      <h2 id="e-tour-t" class="e-tour-title">{{ step.title }}</h2>
      <p id="e-tour-d" class="e-tour-text">{{ step.text }}</p>
      <div class="e-tour-foot">
        <button type="button" class="e-btn e-btn-ghost e-btn-sm" @click="finish('skip')">{{ $t('msg.modern.tour_skip') }}</button>
        <span class="e-grow"></span>
        <button v-if="index > 0" type="button" class="e-btn e-btn-sm" @click="go(index - 1)">{{ $t('msg.modern.tour_back') }}</button>
        <button ref="next" type="button" class="e-btn e-btn-primary e-btn-sm" @click="next">{{ last ? $t('msg.modern.tour_done') : $t('msg.modern.tour_next') }}</button>
      </div>
    </div>
  </div>
</template>

<script>
  const GAP = 12;

  export default {
    name: 'ETour',
    props: {
      //[{ target: css selector, title, text }]; a step whose target is missing is skipped
      steps: { type: Array, required: true },
    },
    emits: ['close'],
    data() {
      return { index: 0, rect: null, side: 'bottom', card: { w: 320, h: 180 }, opener: null };
    },
    computed: {
      step() { return this.steps[this.index] || {}; },
      last() { return this.index >= this.steps.length - 1; },
      ringStyle() {
        const r = this.rect;
        return { top: r.top - 6 + 'px', left: r.left - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' };
      },
      cardStyle() {
        const r = this.rect;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const { w, h } = this.card;
        if (!r) return { top: Math.max(GAP, (vh - h) / 2) + 'px', left: Math.max(GAP, (vw - w) / 2) + 'px' };
        let top;
        let left;
        if (this.side == 'right') {
          left = r.right + GAP + 6;
          top = r.top + r.height / 2 - h / 2;
        } else if (this.side == 'bottom') {
          top = r.bottom + GAP + 6;
          left = r.left + r.width / 2 - w / 2;
        } else {
          top = r.top - h - GAP - 6;
          left = r.left + r.width / 2 - w / 2;
        }
        top = Math.min(Math.max(GAP, top), vh - h - GAP);
        left = Math.min(Math.max(GAP, left), vw - w - GAP);
        return { top: top + 'px', left: left + 'px' };
      },
    },
    mounted() {
      this.opener = document.activeElement;
      window.addEventListener('resize', this.place);
      document.addEventListener('scroll', this.place, true);
      this.go(0);
    },
    beforeUnmount() {
      window.removeEventListener('resize', this.place);
      document.removeEventListener('scroll', this.place, true);
      if (this.opener && this.opener.focus && document.contains(this.opener)) this.opener.focus();
    },
    methods: {
      el(i) {
        const s = this.steps[i];
        return s && s.target ? document.querySelector(s.target) : null;
      },
      go(i) {
        //skip steps whose element isn't on the page (e.g. Send while the node syncs)
        let j = i;
        const dir = i >= this.index ? 1 : -1;
        while (j >= 0 && j < this.steps.length && this.steps[j].target && !this.el(j)) j += dir;
        if (j < 0 || j >= this.steps.length) {
          if (dir > 0) this.finish('done');
          return;
        }
        this.index = j;
        const target = this.el(j);
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'nearest' });
        this.$nextTick(() => {
          this.place();
          this.$refs.next && this.$refs.next.focus();
        });
      },
      next() {
        if (this.last) this.finish('done');
        else this.go(this.index + 1);
      },
      place() {
        const target = this.el(this.index);
        const card = this.$refs.card;
        if (card) this.card = { w: card.offsetWidth, h: card.offsetHeight };
        if (!target) { this.rect = null; return; }
        const r = target.getBoundingClientRect();
        this.rect = { top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        //sidebar items: to the right; tall panels: below if it fits, else above
        if (r.right + this.card.w + GAP * 2 < vw && r.width < vw * 0.3) this.side = 'right';
        else if (r.bottom + this.card.h + GAP * 2 < vh) this.side = 'bottom';
        else this.side = 'top';
      },
      finish(how) {
        this.$emit('close', how);
      },
      onKey(e) {
        if (e.key == 'Escape') {
          e.preventDefault();
          this.finish('skip');
        } else if (e.key == 'Tab') {
          //keep focus in the card
          const f = Array.from(this.$refs.card.querySelectorAll('button'));
          if (!f.length) return;
          const first = f[0];
          const lastEl = f[f.length - 1];
          if (e.shiftKey && document.activeElement == first) { e.preventDefault(); lastEl.focus(); }
          else if (!e.shiftKey && document.activeElement == lastEl) { e.preventDefault(); first.focus(); }
        }
      },
    },
  };
</script>

<style>
  .e-tour { position: fixed; inset: 0; z-index: 10000; }
  .e-tour-catch { position: absolute; inset: 0; }
  .e-tour-ring {
    position: fixed; border-radius: var(--r-sm); pointer-events: none;
    box-shadow: 0 0 0 2px var(--accent), 0 0 0 9999px var(--scrim);
    transition: top var(--dur) var(--ease-out), left var(--dur) var(--ease-out), width var(--dur) var(--ease-out), height var(--dur) var(--ease-out);
  }
  .e-tour-card {
    position: fixed; width: min(20rem, calc(100vw - 24px)); padding: var(--sp-4) var(--sp-5) var(--sp-3);
    background: var(--s4); border: 1px solid var(--line-strong); border-radius: var(--r-lg);
    box-shadow: var(--shadow-pop); animation: e-rise var(--dur) var(--ease-out);
  }
  .e-tour-count { color: var(--accent-text); font: 500 var(--fs-xs) var(--font-mono); }
  .e-tour-title { font-size: var(--fs-h3); margin-top: 4px; }
  .e-tour-text { color: var(--dim); margin-top: 6px; font-size: var(--fs-md); }
  .e-tour-foot { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-4); }
</style>
