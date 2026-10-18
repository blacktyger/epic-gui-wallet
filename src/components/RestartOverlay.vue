<template>
  <!-- Full-window progress while switching between the BT Labs Theme and Classic: lock the
       wallet, then restart the window in the other interface. Shown by App.vue in both
       interfaces, before and after the reload, so it carries its own styles (Classic has no
       design tokens). -->
  <div class="uir" role="dialog" aria-modal="true" aria-labelledby="uir-title" aria-describedby="uir-status">
    <div class="uir-card">
      <svg class="uir-mark" viewBox="0 0 281 324" fill="currentColor" aria-hidden="true"><path v-for="(d, i) in markPaths" :key="i" :d="d" /></svg>
      <h1 id="uir-title" class="uir-title" ref="title" tabindex="-1">{{ $t('msg.modern.restart_title', { name: targetName }) }}</h1>
      <ol class="uir-stages">
        <li v-for="(s, i) in stages" :key="s.key" class="uir-stage" :class="'is-' + stateOf(i)" :aria-current="stateOf(i) == 'now' ? 'step' : null">
          <span class="uir-dot" aria-hidden="true">
            <svg v-if="stateOf(i) == 'done'" viewBox="0 0 24 24"><path d="M21 7L9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59 21 7z" /></svg>
            <span v-else-if="stateOf(i) == 'now'" class="uir-spin"></span>
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span><b>{{ s.label }}<template v-if="stateOf(i) == 'now'">…</template></b><small v-if="s.detail">{{ s.detail }}</small></span>
        </li>
      </ol>
      <p id="uir-status" class="uir-sr" role="status" aria-live="polite">{{ status }}</p>
    </div>
  </div>
</template>

<script>
  //the Epic Cash mark (site/assets/epic-mark.svg), so the overlay needs no icon sprite
  const MARK = ["M253.678 72.4431C256.503 70.801 256.503 66.7288 253.678 65.1524L225.895 49.126C224.581 48.4035 223.005 48.4035 221.691 49.126L202.644 60.0949L238.966 81.0474L253.678 72.4431Z",
    "M83.7588 131.031V163.806C83.7588 167.09 87.3056 169.126 90.1299 167.484L232.528 84.7253L196.206 63.7729L85.8606 127.419C84.547 128.141 83.7588 129.52 83.7588 131.031Z",
    "M111.084 211.36L140.115 228.108C141.429 228.831 143.005 228.831 144.319 228.108L253.482 165.12V121.244L111.084 204.003C108.26 205.645 108.325 209.717 111.084 211.36Z",
    "M278.899 150.473C280.213 149.75 281.001 148.305 281.001 146.795V112.64C281.001 109.356 277.454 107.32 274.63 108.962L259.917 117.501V161.376L278.899 150.473Z",
    "M140.705 323.544H140.771L181.034 300.293V300.227L280.673 242.756V196.187L259.983 208.141L253.546 211.82L176.961 256.023L140.705 276.976L41.1313 219.504V104.561L153.973 39.405L160.344 35.7268L181.034 23.7727L140.705 0.455658L0.802734 81.2442V242.756L140.705 323.544Z"];

  export default {
    name: 'RestartOverlay',
    props: {
      //'modern' | 'classic': the interface the window restarts in
      target: { type: String, required: true },
      //'lock' (stopping the wallet) | 'reload' (opening the other interface) | 'done'
      stage: { type: String, default: 'lock' },
    },
    data() {
      return { markPaths: MARK };
    },
    computed: {
      targetName() {
        return this.target == 'classic' ? this.$t('msg.modern.interface_classic') : this.$t('msg.modern.interface_modern');
      },
      stages() {
        return [
          { key: 'lock', label: this.$t('msg.modern.restart_lock'), detail: this.$t('msg.modern.restart_lock_detail') },
          { key: 'reload', label: this.$t('msg.modern.restart_into', { name: this.targetName }), detail: this.$t('msg.modern.restart_into_detail') },
        ];
      },
      status() {
        const i = this.stages.findIndex(s => s.key == this.stage);
        return i < 0 ? this.$t('msg.modern.restart_done') : this.$t('msg.modern.step_of', { n: i + 1, total: this.stages.length, label: this.stages[i].label });
      },
    },
    mounted() {
      this.$refs.title && this.$refs.title.focus();
    },
    methods: {
      stateOf(i) {
        const a = this.stages.findIndex(s => s.key == this.stage);
        if (a < 0) return 'done';
        return i < a ? 'done' : i == a ? 'now' : 'todo';
      },
    },
  };
</script>

<style>
  .uir {
    --uir-bg: #08080a; --uir-card: #0d0d10; --uir-line: #33333d; --uir-text: #fff9f9; --uir-dim: #a4a4ad;
    --uir-faint: #8a8a94; --uir-gold: #f6d471; --uir-ok: #8ad98a;
    position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center;
    background: var(--uir-bg); color: var(--uir-text);
    font: 400 0.875rem/1.5 system-ui, -apple-system, 'Segoe UI', Ubuntu, Cantarell, Roboto, sans-serif;
  }
  html[data-ui='modern'][data-theme='light'] .uir {
    --uir-bg: #f7f7f8; --uir-card: #ffffff; --uir-line: #c9c9d0; --uir-text: #1c1e21; --uir-dim: #55555f;
    --uir-faint: #6b6b75; --uir-gold: #8f5e1f; --uir-ok: #1f7a3a;
  }
  .uir-card { width: min(26rem, calc(100vw - 3rem)); display: flex; flex-direction: column; align-items: center; gap: 1rem; }
  .uir-mark { width: 2.25rem; height: 2.6rem; color: var(--uir-gold); }
  .uir-title { margin: 0; font: 600 1.375rem/1.25 'Montserrat', system-ui, sans-serif; letter-spacing: -0.02em; text-align: center; }
  .uir-title:focus { outline: none; }
  .uir-stages { list-style: none; margin: 0; padding: 1.25rem 1.5rem; width: 100%; box-sizing: border-box; border: 1px solid var(--uir-line); border-radius: 8px; background: var(--uir-card); display: flex; flex-direction: column; gap: 0.75rem; }
  .uir-stage { display: grid; grid-template-columns: 1.75rem 1fr; gap: 0.75rem; align-items: start; color: var(--uir-faint); }
  .uir-stage b { display: block; font-weight: 600; padding-top: 0.2rem; }
  .uir-stage small { display: block; font-size: 0.8125rem; color: var(--uir-faint); }
  .uir-stage.is-now, .uir-stage.is-done { color: var(--uir-text); }
  .uir-stage.is-now small { color: var(--uir-dim); }
  .uir-dot { width: 1.75rem; height: 1.75rem; border-radius: 6px; border: 1px solid var(--uir-line); display: grid; place-items: center; font: 500 0.75rem ui-monospace, monospace; box-sizing: border-box; }
  .uir-stage.is-now .uir-dot { border-color: var(--uir-gold); box-shadow: 0 0 0 4px color-mix(in srgb, var(--uir-gold) 18%, transparent); }
  .uir-stage.is-done .uir-dot { border-color: color-mix(in srgb, var(--uir-ok) 55%, transparent); color: var(--uir-ok); }
  .uir-dot svg { width: 1rem; height: 1rem; fill: currentColor; }
  .uir-spin { width: 0.9rem; height: 0.9rem; border-radius: 50%; border: 2px solid var(--uir-gold); border-right-color: transparent; animation: uir-spin 0.8s linear infinite; }
  .uir-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @keyframes uir-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .uir-spin { animation: none; border-right-color: var(--uir-gold); border-style: dotted; }
  }
</style>
