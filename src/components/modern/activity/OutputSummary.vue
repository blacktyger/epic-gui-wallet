<template>
  <!-- The balance lines Classic shows above the coins (SummaryInfo.vue) -->
  <dl class="e-act-sum" :aria-label="$t('msg.modern.overview.summary_label')">
    <div>
      <dt>{{ $t('msg.modern.overview.spendable') }}</dt>
      <dd><MoneyText :value="summary.spendable" :updating="updating" unit /></dd>
    </div>
    <div>
      <dt>{{ $t('msg.modern.overview.confirming') }}</dt>
      <dd><MoneyText :value="summary.unconfirmed" :updating="updating" /></dd>
    </div>
    <div>
      <dt>{{ $t('msg.modern.overview.awaiting') }}</dt>
      <dd><MoneyText :value="summary.unfinalization" :updating="updating" /></dd>
    </div>
    <div v-if="summary.immature > 0">
      <dt>{{ $t('msg.modern.overview.immature') }}</dt>
      <dd><MoneyText :value="summary.immature" :updating="updating" /></dd>
    </div>
    <div>
      <dt>{{ $t('msg.modern.overview.locked') }}</dt>
      <dd><MoneyText :value="summary.locked" :updating="updating" /></dd>
    </div>
  </dl>
</template>

<script>
  import SummaryInfo from '@/components/SummaryInfo.vue';
  import { reskin } from '@/components/modern/reskin';
  import MoneyText from '@/components/modern/ui/MoneyText.vue';

  export default reskin(SummaryInfo, { name: 'OutputSummary', components: { MoneyText } });
</script>
