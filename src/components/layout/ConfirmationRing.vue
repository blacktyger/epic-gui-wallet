<template>
  <span
    class="confirmation-ring"
    :class="[`is-${state}`, { 'is-landing': landing }]"
    :role="state == 'waiting' ? null : 'img'"
    :aria-label="state == 'waiting' ? null : label"
    :aria-hidden="state == 'waiting' ? 'true' : null"
    :title="label"
  >
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <circle class="ring-halo" cx="12" cy="12" r="11" />
      <circle class="ring-track" cx="12" cy="12" :r="radius" />
      <circle
        class="ring-arc"
        cx="12"
        cy="12"
        :r="radius"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
      />
      <path v-if="state == 'confirmed'" class="ring-check" d="M8 12.3l2.6 2.6L16 9.5" />
      <text v-else-if="state == 'confirming'" class="ring-count" x="12" y="12">{{ shown }}</text>
    </svg>
  </span>
</template>

<script>
  import { MIN_CONFIRMATIONS } from '@/shared/confirmations';

  //how long a ring that has just reached its target stays highlighted
  const LANDING_MS = 1300;
  //the share of the ring the waiting arc covers
  const WAITING_SHARE = 0.16;

  /*
   * Confirmations as a small ring, like the payment tiles of Wallet for Epic: it fills to
   * confirmations / target while confirming, with the count inside; a short arc travels round
   * it while the tx waits for a block; at the target it closes in green with a check.
   * With prefers-reduced-motion nothing moves.
   */
  export default {
    name: 'ConfirmationRing',
    props: {
      //'waiting' (not in a block yet), 'confirming' or 'confirmed'
      state: {
        type: String,
        default: 'waiting',
        validator: v => ['waiting', 'confirming', 'confirmed'].includes(v)
      },
      //null when not known
      confirmations: {
        type: Number,
        default: null
      },
      target: {
        type: Number,
        default: MIN_CONFIRMATIONS
      },
      //a received coin or tx says 'spendable' once confirmed; a send does not
      spendable: {
        type: Boolean,
        default: true
      },
      //what is waited for, for the tooltip of a waiting ring (the tag next to it says it too)
      waitingLabel: {
        type: String,
        default: ''
      }
    },
    data() {
      return {
        radius: 9,
        landing: false,
      }
    },
    computed: {
      circumference() {
        return 2 * Math.PI * this.radius;
      },
      shown() {
        return Math.max(0, Math.min(this.confirmations || 0, this.target));
      },
      fraction() {
        if(this.state == 'confirmed'){
          return 1;
        }
        if(this.state == 'waiting'){
          return WAITING_SHARE;
        }
        return this.target > 0 ? this.shown / this.target : 1;
      },
      offset() {
        return this.circumference * (1 - this.fraction);
      },
      label() {
        if(this.state == 'confirmed'){
          //no count: the wallet gives no height (all its outputs spent, or a send without change)
          if(this.confirmations === null || !(this.confirmations > 0)){
            return this.$t('msg.confirmations.confirmed');
          }
          return this.spendable
            ? this.$t('msg.confirmations.confirmed_spendable_count', [this.confirmations])
            : this.$t('msg.confirmations.confirmed_count', [this.confirmations]);
        }
        if(this.state == 'confirming'){
          return this.$t('msg.confirmations.of', [this.shown, this.target]);
        }
        return this.waitingLabel || this.$t('msg.confirmations.waiting');
      }
    },
    watch: {
      state(now, before) {
        if(before == 'confirming' && now == 'confirmed'){
          this.landing = true;
          clearTimeout(this.landingId);
          this.landingId = setTimeout(() => { this.landing = false; }, LANDING_MS);
        }
      }
    },
    beforeUnmount() {
      clearTimeout(this.landingId);
    }
  }
</script>

<style>
  /* colours of Wallet for Epic: accent (gold) while pending, ok (green) when confirmed */
  .confirmation-ring {
    --ring-accent: #8f5e1f;
    --ring-accent-soft: rgba(143, 94, 31, 0.18);
    --ring-ok: #1f7a3a;
    --ring-track: rgba(0, 0, 0, 0.14);
    --ring-text: #363636;
  }
  html.is-dark-mode-active .confirmation-ring {
    --ring-accent: #f6d471;
    --ring-accent-soft: rgba(246, 212, 113, 0.16);
    --ring-ok: #8ad98a;
    --ring-track: rgba(255, 255, 255, 0.16);
    --ring-text: #f5f5f5;
  }
</style>

<style scoped>
  .confirmation-ring {
    display: inline-flex;
    flex: none;
    width: 22px;
    height: 22px;
    vertical-align: middle;
  }
  svg {
    overflow: visible;
  }
  .ring-halo {
    fill: var(--ring-accent-soft);
    opacity: 0;
  }
  .ring-track {
    fill: none;
    stroke: var(--ring-track);
    stroke-width: 2;
  }
  .ring-arc {
    fill: none;
    stroke: var(--ring-accent);
    stroke-width: 2.5;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: 12px 12px;
    /* reaches a new count in 0.9 s, ease-out (Wallet for Epic: easeOutCubic) */
    transition: stroke-dashoffset 0.9s cubic-bezier(0.33, 1, 0.68, 1), stroke 0.4s ease;
  }
  .ring-count {
    fill: var(--ring-text);
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-anchor: middle;
    dominant-baseline: central;
  }
  .ring-check {
    fill: none;
    stroke: var(--ring-ok);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* confirming: a soft halo breathes round the ring */
  .is-confirming .ring-halo {
    animation: ring-breathe 2.4s ease-in-out infinite;
  }
  /* waiting for a block: a short arc travels round the ring */
  .is-waiting .ring-arc {
    animation: ring-run 2.4s linear infinite;
  }
  .is-confirmed .ring-arc {
    stroke: var(--ring-ok);
    stroke-width: 2;
  }
  /* just confirmed: closes, then a short green pulse */
  .is-landing .ring-halo {
    fill: var(--ring-ok);
    animation: ring-land 1.3s ease-out;
  }

  @keyframes ring-run {
    from { transform: rotate(-90deg); }
    to { transform: rotate(270deg); }
  }
  @keyframes ring-breathe {
    0%, 100% { opacity: 0; }
    50% { opacity: 1; }
  }
  @keyframes ring-land {
    0% { opacity: 0.45; }
    100% { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .ring-arc {
      transition: none;
    }
    .is-confirming .ring-halo,
    .is-landing .ring-halo {
      animation: none;
      opacity: 0;
    }
    /* waiting without motion: the whole ring, dashed */
    .is-waiting .ring-arc {
      animation: none;
      stroke-dasharray: 3 3;
      stroke-dashoffset: 0;
    }
  }
</style>
