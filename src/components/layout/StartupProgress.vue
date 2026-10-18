<template>
  <!-- the steps of a long action (open or create a wallet): done, running now, still to come -->
  <div class="startup-progress" role="status" aria-live="polite">
    <ol>
      <li v-for="(stage, index) in stages" :key="stage.key" :class="'is-' + stateOf(index)">
        <span class="startup-progress-icon" aria-hidden="true">
          <mdicon v-if="stateOf(index) == 'done'" name="check-circle" size="18" />
          <span v-else-if="stateOf(index) == 'active'" class="startup-progress-spinner"></span>
          <mdicon v-else name="circle-outline" size="18" />
        </span>
        <span class="startup-progress-label">
          {{ stage.label }}<span v-if="stateOf(index) == 'active'">…</span>
          <span class="is-sr-only">({{ $t('msg.progress.' + stateOf(index)) }})</span>
        </span>
      </li>
    </ol>
  </div>
</template>

<script>
  export default {
    name: 'StartupProgress',
    props: {
      //[{key, label}] in order
      stages: { type: Array, required: true },
      //key of the stage running now; stages before it are done
      current: { type: String, default: '' },
    },
    methods: {
      stateOf(index){
        const active = this.stages.findIndex(s => s.key == this.current);
        if(active < 0 || index > active){
          return 'pending';
        }
        return index < active ? 'done' : 'active';
      }
    }
  }
</script>

<style scoped>
  .startup-progress {
    margin-top: 1.25rem;
    display: flex;
    justify-content: center;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    /* fixed width: the list doesn't shift as the bold active step changes */
    width: 21rem;
    max-width: 100%;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0;
    font-size: 0.9rem;
    line-height: 1.4;
  }
  li.is-pending {
    opacity: 0.45;
  }
  li.is-active {
    font-weight: 600;
  }
  li.is-done .startup-progress-icon {
    color: #48c78e;
  }
  .startup-progress-icon {
    display: inline-flex;
    width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .startup-progress-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(209, 153, 68, 0.3);
    border-top-color: #d19944;
    border-radius: 50%;
    animation: startup-spin 0.8s linear infinite;
  }
  @keyframes startup-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .startup-progress-spinner {
      animation: none;
      border-color: #d19944;
      border-style: dotted;
    }
  }
</style>
