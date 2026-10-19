<template>
  <!-- BT Labs Theme view of NodeProblemNotice.vue (same script): the node can't be used as it should,
       and the one-time cleanup of the saved node address. Plain words; details are in the log -->
  <div v-if="addressChange" class="e-notice e-ov-notice" role="status" aria-labelledby="e-node-change-t">
    <EIcon name="info" />
    <div>
      <b id="e-node-change-t">{{ $t('msg.node_problem.address_changed_title') }}</b>
      <p class="e-nn-addr" translate="no">{{ $t('msg.node_problem.address_changed', [addressChange.from, addressChange.to]) }}</p>
    </div>
    <div class="e-actions">
      <button type="button" class="e-icon-btn" :aria-label="$t('msg.node_problem.ok')" @click="store.commit('nodeAddressChange', null)"><EIcon name="close" /></button>
    </div>
  </div>

  <div v-if="problem" class="e-notice e-ov-notice" :class="severe ? 'e-risk' : 'e-warn'" aria-labelledby="e-node-problem-t">
    <EIcon name="alertc" />
    <div>
      <!-- only the title is announced, not the whole notice with its buttons -->
      <b id="e-node-problem-t" :role="severe ? 'alert' : 'status'">{{ $t('msg.node_problem.title_' + problem.kind) }}</b>
      <p class="e-nn-addr" translate="no"><span class="e-sr-only">{{ $t('msg.node_problem.node') }}: </span>{{ problem.address || '—' }}</p>
      <p v-if="problem.epicboxSkipped">
        {{ $t('msg.node_problem.epicbox_skipped') }}
        <router-link to="/httpReceive" class="e-link-btn">{{ $t('msg.node_problem.go_receive') }}</router-link>
      </p>
      <h3 class="e-sr-only">{{ $t('msg.node_problem.fixes') }}</h3>
      <ul class="e-nn-fixes">
        <li>
          <router-link to="/settings" class="e-btn e-btn-sm">
            <EIcon name="web" />{{ $t(mainnet ? 'msg.node_problem.fix_public' : 'msg.node_problem.fix_other') }}
          </router-link>
          <a v-if="mainnet" class="e-link-btn e-nn-ext" :href="nodeListUrl" @click.prevent="openExternal(nodeListUrl)" @auxclick.prevent>
            {{ $t('msg.node_problem.node_list') }}<span class="e-sr-only"> {{ $t('msg.node_problem.opens_browser') }}</span><EIcon name="external" size="sm" />
          </a>
        </li>
        <li>
          <button type="button" class="e-btn e-btn-sm" :aria-busy="switching ? 'true' : null" :disabled="switching" @click="useBuiltinNode">
            <span v-if="switching" class="e-spinner" aria-hidden="true"></span><EIcon v-else name="server" />{{ $t('msg.node_problem.fix_builtin') }}
          </button>
        </li>
        <li v-if="showsUpgrade">
          <a class="e-link-btn e-nn-ext" :href="releasesUrl" @click.prevent="openExternal(releasesUrl)" @auxclick.prevent>
            {{ $t('msg.node_problem.fix_upgrade') }}<span class="e-sr-only"> {{ $t('msg.node_problem.opens_browser') }}</span><EIcon name="external" size="sm" />
          </a>
        </li>
      </ul>
    </div>
    <div class="e-actions">
      <button type="button" class="e-icon-btn" :aria-label="$t('msg.node_problem.hide_label')" :title="$t('msg.node_problem.hide')"
              @click="store.commit('nodeProblemUpdate', {hidden: true})"><EIcon name="close" /></button>
    </div>
  </div>
</template>

<script>
  import Base from '@/components/NodeProblemNotice.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';
  export default reskin(Base, { components: { EIcon } });
</script>

<style scoped>
  .e-nn-addr { font-family: var(--font-mono); overflow-wrap: anywhere; }
  .e-nn-fixes { list-style: none; margin: var(--sp-3) 0 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2) var(--sp-4); }
  .e-nn-fixes li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2) var(--sp-3); }
  .e-nn-ext { display: inline-flex; align-items: center; gap: 4px; }
  .e-notice .e-actions { align-self: start; }
</style>
