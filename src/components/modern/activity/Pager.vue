<template>
  <!-- Page buttons of a list, laid out as Transaction.vue and Commit.vue do: the first and last
       few pages, the current one in the middle, "Page X of Y" -->
  <nav v-if="pages > 1" class="e-act-pager" :aria-label="$t('msg.modern.overview.pager')">
    <button type="button" class="e-icon-btn e-sm" :disabled="current <= 1" :aria-label="$t('msg.modern.overview.prev')" @click="$emit('prev')"><EIcon name="chevl" /></button>
    <template v-for="index in pages" :key="index">
      <button
        v-if="index <= Math.round(maxButtons / 2) || index > (pages - Math.round(maxButtons / 2))"
        type="button"
        class="e-act-pg"
        :aria-current="current == index ? 'page' : null"
        :aria-label="$t('msg.modern.overview.page', { n: index })"
        @click="$emit('page', index)"
      >{{ index }}</button>
      <span
        v-else-if="index == Math.round(pages / 2)"
        class="e-act-pg e-act-gap"
        :class="{ 'e-is-current': middle }"
        :aria-current="middle ? 'page' : null"
      ><template v-if="middle">{{ current }}</template>…</span>
    </template>
    <button type="button" class="e-icon-btn e-sm" :disabled="current >= pages" :aria-label="$t('msg.modern.overview.next')" @click="$emit('next')"><EIcon name="chevr" /></button>
    <small class="e-act-pageof e-faint">{{ $t('msg.page_of', [current, pages]) }}</small>
  </nav>
</template>

<script>
  import EIcon from '@/components/modern/ui/EIcon.vue';

  export default {
    name: 'ActPager',
    components: { EIcon },
    props: {
      pages: { type: Number, default: 1 },
      current: { type: Number, default: 1 },
      maxButtons: { type: Number, default: 6 },
    },
    emits: ['prev', 'next', 'page'],
    computed: {
      //the current page sits in the hidden middle range
      middle() {
        const half = Math.round(this.maxButtons / 2);
        return this.current > half && this.current <= this.pages - half;
      },
    },
  };
</script>
