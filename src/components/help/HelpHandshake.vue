<template>
  <!-- "Why does a transaction need both sides?": an Epic Cash transaction as the handshake it is (adapted from
       wallet-for-epic's How it works). You, Epicbox (or the file passed by hand), Them and the Network, one
       arrow lit at a time. Steps by hand only, nothing plays by itself (WCAG 2.2.2); with reduced motion the
       dot does not travel. Static inline SVG, no network, no library. -->
  <figure class="hs" :class="'hs-' + flow">
    <div class="hs-flows" role="group" :aria-label="labels.title">
      <button v-for="f in flows" :key="f" type="button" :class="btnClass" :aria-pressed="flow === f ? 'true' : 'false'" @click="pick(f)">{{ f === 'epicbox' ? labels.over_epicbox : labels.with_file }}</button>
    </div>
    <svg class="hs-svg" viewBox="0 0 340 176" aria-hidden="true" focusable="false">
      <defs>
        <marker :id="uid + '-a'" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" class="hs-head" />
        </marker>
        <marker :id="uid + '-o'" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" class="hs-head hs-on" />
        </marker>
      </defs>
      <line v-for="(e, i) in EDGES" :key="'e' + i" :x1="e[0]" :y1="e[1]" :x2="e[2]" :y2="e[3]" class="hs-edge" :class="{ 'hs-on': i === step }" :marker-end="'url(#' + uid + (i === step ? '-o' : '-a') + ')'" />
      <g v-for="n in nodes" :key="n.id" class="hs-node" :class="{ 'hs-on': ACTORS[step].includes(n.id) }" :transform="'translate(' + n.x + ' ' + n.y + ')'">
        <circle r="22" />
        <path :d="ICONS[n.icon]" class="hs-icon" />
        <text y="40" text-anchor="middle">{{ n.label }}</text>
      </g>
      <circle v-if="step < 5" :key="flow + step" class="hs-dot" r="4.5" :style="dotStyle" />
      <circle v-else :key="flow + 'c'" class="hs-ring" cx="170" cy="128" r="26" />
    </svg>
    <figcaption>
      <p class="hs-count">{{ labels.step.replace('{n}', step + 1).replace('{total}', EDGES.length + 1) }}</p>
      <p class="hs-cap" aria-live="polite">{{ steps[flow][step] }}</p>
      <div class="hs-nav">
        <button type="button" :class="btnClass" :disabled="step === 0" @click="go(-1)">{{ labels.prev }}</button>
        <button type="button" :class="btnClass" :disabled="step === EDGES.length" @click="go(1)">{{ labels.next }}</button>
      </div>
    </figcaption>
  </figure>
</template>

<script>
  //x1 y1 x2 y2 of the five arrows: out over the top lane, back over the lower one, then to the network
  const EDGES = [
    [76, 52, 144, 52], [196, 52, 264, 52], [264, 66, 196, 66], [144, 66, 76, 66], [64, 82, 146, 120],
  ];
  //who is lit at each step (the sixth: the network confirms)
  const ACTORS = [['you', 'mid'], ['mid', 'them'], ['them', 'mid'], ['mid', 'you'], ['you', 'net'], ['net']];
  const ICONS = {
    person: 'M0 -11 a5 5 0 1 0 0.01 0 Z M-9 10 c0 -7 4 -10 9 -10 s9 3 9 10 Z',
    box: 'M-11 -7 h22 v15 h-22 Z M-11 -7 l11 8 l11 -8',
    file: 'M-7 -11 h9 l5 5 v17 h-14 Z M2 -11 v5 h5 M-3 0 h7 M-3 5 h7',
    chain: 'M-12 -4 h8 v8 h-8 Z M-4 -1 h3 v2 h-3 Z M-1 -4 h8 v8 h-8 Z M7 -1 h3 v2 h-3 Z',
  };
  let seq = 0;

  export default {
    name: 'HelpHandshake',
    props: {
      //title, over_epicbox, with_file, you, them, network, epicbox, file, step ("{n} of {total}"), prev, next
      labels: { type: Object, required: true },
      //{ epicbox: [six captions], file: [six captions] }
      steps: { type: Object, required: true },
      btnClass: { type: String, default: '' },
    },
    data() {
      return { flow: 'epicbox', step: 0, uid: 'hs' + (++seq) };
    },
    created() {
      Object.assign(this, { EDGES, ACTORS, ICONS, flows: ['epicbox', 'file'] });
    },
    computed: {
      nodes() {
        const l = this.labels;
        return [
          { id: 'you', x: 50, y: 59, icon: 'person', label: l.you },
          { id: 'mid', x: 170, y: 59, icon: this.flow === 'file' ? 'file' : 'box', label: this.flow === 'file' ? l.file : l.epicbox },
          { id: 'them', x: 290, y: 59, icon: 'person', label: l.them },
          { id: 'net', x: 170, y: 128, icon: 'chain', label: l.network },
        ];
      },
      dotStyle() {
        const [x1, y1, x2, y2] = EDGES[this.step];
        return { '--x1': x1 + 'px', '--y1': y1 + 'px', '--x2': x2 + 'px', '--y2': y2 + 'px' };
      },
    },
    methods: {
      pick(f) { this.flow = f; this.step = 0; },
      go(d) { this.step = Math.min(EDGES.length, Math.max(0, this.step + d)); },
    },
  };
</script>

<style>
  .hs { --hs-accent: var(--accent, #d19944); --hs-line: var(--line-strong, rgba(127, 127, 127, 0.45)); --hs-fill: var(--s2, transparent);
    margin: 12px 0 4px; max-width: 420px; }
  .hs-flows { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .hs-flows [aria-pressed='true'] { box-shadow: inset 0 0 0 2px var(--hs-accent); }
  .hs-svg { display: block; width: 100%; height: auto; overflow: visible; }
  .hs-edge { stroke: var(--hs-line); stroke-width: 2; }
  .hs-edge.hs-on { stroke: var(--hs-accent); stroke-width: 3; }
  .hs-head { fill: var(--hs-line); }
  .hs-head.hs-on { fill: var(--hs-accent); }
  .hs-node circle { fill: var(--hs-fill); stroke: var(--hs-line); stroke-width: 2; }
  .hs-node.hs-on circle { stroke: var(--hs-accent); stroke-width: 3; }
  .hs-icon { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; opacity: 0.85; }
  .hs-node text { fill: currentColor; font-size: 12px; }
  .hs-node.hs-on text { font-weight: 600; }
  .hs-dot { fill: var(--hs-accent); transform: translate(var(--x2), var(--y2)); animation: hs-move 1.1s ease-in-out both; }
  .hs-ring { fill: none; stroke: var(--hs-accent); stroke-width: 2; transform-origin: 170px 128px; animation: hs-ring 1.4s ease-out both; }
  @keyframes hs-move { from { transform: translate(var(--x1), var(--y1)); } to { transform: translate(var(--x2), var(--y2)); } }
  @keyframes hs-ring { from { opacity: 1; transform: scale(0.85); } to { opacity: 0.35; transform: scale(1.15); } }
  @media (prefers-reduced-motion: reduce) { .hs-dot, .hs-ring { animation: none; } }
  .hs figcaption { margin-top: 4px; }
  .hs-count { font-size: 0.8125rem; opacity: 0.8; margin: 0; }
  .hs-cap { min-height: 3em; margin: 2px 0 8px; }
  .hs-nav { display: flex; gap: 8px; }
</style>
