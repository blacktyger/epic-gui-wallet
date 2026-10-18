<template>
  <!-- The steps of a long action (open, create or restore a wallet): done, running now, failed,
       still to come. Restyled successor of layout/StartupProgress.vue, same stages/current props. -->
  <div class="e-stagelist">
    <ol class="e-stages" :aria-label="label || null">
      <li
        v-for="(stage, index) in stages"
        :key="stage.key"
        class="e-stage"
        :class="'e-is-' + stateOf(index)"
        :aria-current="stateOf(index) == 'now' ? 'step' : null"
      >
        <span class="e-mark" aria-hidden="true">
          <EIcon v-if="stateOf(index) == 'done'" name="check" size="sm" />
          <EIcon v-else-if="stateOf(index) == 'fail'" name="close" size="sm" />
          <span v-else-if="stateOf(index) == 'now'" class="e-spinner"></span>
          <template v-else>{{ index + 1 }}</template>
        </span>
        <div>
          <b>{{ stage.label }}<template v-if="stateOf(index) == 'now'">…</template></b>
          <p v-if="details && details[stage.key]">{{ details[stage.key] }}</p>
        </div>
        <span></span>
      </li>
    </ol>
    <p class="e-sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  </div>
</template>

<script>
  import EIcon from './EIcon.vue';

  export default {
    name: 'StageList',
    components: { EIcon },
    props: {
      //[{key, label}] in order
      stages: { type: Array, required: true },
      //key of the stage running now; stages before it are done; '' = none started
      current: { type: String, default: '' },
      //key of the stage that failed (it shows instead of running)
      failed: { type: String, default: '' },
      //key -> one line under the stage
      details: { type: Object, default: null },
      label: { type: String, default: '' },
      //all stages done
      complete: { type: Boolean, default: false },
    },
    computed: {
      active() {
        const key = this.failed || this.current;
        return this.stages.findIndex(s => s.key == key);
      },
      announcement() {
        const i = this.active;
        if (i < 0) return '';
        return this.$t('msg.modern.step_of', { n: i + 1, total: this.stages.length, label: this.stages[i].label });
      },
    },
    methods: {
      stateOf(index) {
        if (this.complete) return 'done';
        const a = this.active;
        if (a < 0 || index > a) return 'todo';
        if (index < a) return 'done';
        return this.failed ? 'fail' : 'now';
      },
    },
  };
</script>
