<template>
  <!-- the external node can't be used as it should (store.nodeProblem, set in App.vue nodeStart), and the
       one-time cleanup of the saved node address (store.nodeAddressChange). The logic is here, so a
       reskinned 6.1 template gets it with the same script -->
  <div class="node-problem-notices">

    <article v-if="addressChange" class="message is-info node-problem" role="status" aria-labelledby="node-address-change-title">
      <div class="message-header">
        <h2 id="node-address-change-title" class="node-problem-title">
          <mdicon name="information-outline" size="18" aria-hidden="true" />
          {{ $t('msg.node_problem.address_changed_title') }}
        </h2>
      </div>
      <div class="message-body">
        <p>{{ $t('msg.node_problem.address_changed', [addressChange.from, addressChange.to]) }}</p>
        <p v-if="addressChangeReason">{{ addressChangeReason }}</p>
        <div class="buttons node-problem-actions">
          <button type="button" class="button is-small is-dark is-outlined" @click="store.commit('nodeAddressChange', null)">{{ $t('msg.node_problem.ok') }}</button>
        </div>
      </div>
    </article>

    <article v-if="problem" class="message node-problem" :class="severe ? 'is-warning' : 'is-info'"
             :role="severe ? 'alert' : 'status'" aria-labelledby="node-problem-title">
      <div class="message-header">
        <h2 id="node-problem-title" class="node-problem-title">
          <mdicon :name="severe ? 'alert-outline' : 'information-outline'" size="18" aria-hidden="true" />
          {{ $t('msg.node_problem.title_' + problem.kind) }}
        </h2>
      </div>
      <div class="message-body">

        <dl class="node-problem-facts">
          <dt>{{ $t('msg.node_problem.node') }}</dt>
          <dd class="node-problem-address">{{ problem.address || '—' }}</dd>
          <template v-if="showsVersion">
            <dt>{{ $t('msg.node_problem.version') }}</dt>
            <dd>{{ problem.version || $t('msg.node_problem.version_unknown') }}</dd>
          </template>
        </dl>

        <p v-for="(line, i) in why" :key="i">{{ line }}</p>

        <p v-if="problem.epicboxSkipped" class="node-problem-epicbox">
          {{ $t('msg.node_problem.epicbox_skipped') }}
          <router-link to="/httpReceive">{{ $t('msg.node_problem.go_receive') }}</router-link>
        </p>

        <h3 class="node-problem-subtitle">{{ $t('msg.node_problem.fixes') }}</h3>
        <ul class="node-problem-fixes">
          <li v-if="showsUpgrade">
            <a :href="releasesUrl" @click.prevent="openExternal(releasesUrl)">{{ $t('msg.node_problem.fix_upgrade') }}</a>
            <span class="node-problem-hint">{{ $t('msg.node_problem.opens_browser') }}</span>
          </li>
          <li>
            <button type="button" class="button is-small is-primary" :class="{'is-loading': switching}"
                    :disabled="switching" :aria-busy="switching" @click="useBuiltinNode">
              {{ $t('msg.node_problem.fix_builtin') }}
            </button>
            <span class="node-problem-hint">{{ $t(mainnet ? 'msg.node_problem.fix_builtin_hint_mainnet' : 'msg.node_problem.fix_builtin_hint') }}</span>
          </li>
          <li>
            <!-- the node list is of mainnet nodes -->
            <template v-if="mainnet">
              <a :href="nodeListUrl" @click.prevent="openExternal(nodeListUrl)">{{ $t('msg.node_problem.fix_public') }}</a>
              <span class="node-problem-hint">{{ $t('msg.node_problem.opens_browser') }}</span>,
            </template>
            <router-link to="/settings">{{ $t('msg.node_problem.fix_settings') }}</router-link>
          </li>
        </ul>

        <div class="buttons node-problem-actions">
          <button type="button" class="button is-small is-dark is-outlined" :aria-label="$t('msg.node_problem.hide_label')"
                  @click="store.commit('nodeProblemUpdate', {hidden: true})">{{ $t('msg.node_problem.hide') }}</button>
        </div>
      </div>
    </article>

  </div>
</template>

<script>
  import { ref, computed } from 'vue';
  import { useStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import { LOCAL_NODE } from '@/shared/nodeAddress.js';

  export const NODE_RELEASES_URL = 'https://github.com/EpicCash/epic/releases';
  export const NODE_LIST_URL = 'https://status.btlabs.uk';

  export default {
    name: 'NodeProblemNotice',
    setup(){
      const store = useStore();
      const { t } = useI18n();
      const switching = ref(false);

      const problem = computed(() => store.state.nodeProblem && !store.state.nodeProblem.hidden ? store.state.nodeProblem : null);
      //the status can't be read: the node panel shows unreachable, Epicbox doesn't start by itself
      const severe = computed(() => !!problem.value && !problem.value.statusReadable);
      const showsVersion = computed(() => !!problem.value && ['too_old', 'status_locked'].includes(problem.value.kind));
      const showsUpgrade = showsVersion;
      const mainnet = computed(() => !problem.value || !problem.value.network || problem.value.network == 'mainnet');

      const why = computed(() => {
        const p = problem.value;
        if(!p){
          return [];
        }
        const lines = [];
        if(p.kind == 'too_old'){
          lines.push(t(p.version ? 'msg.node_problem.why_too_old' : 'msg.node_problem.why_needs_secret'));
        }else if(p.kind == 'status_locked'){
          lines.push(t('msg.node_problem.why_status_locked'));
        }else if(p.kind == 'unreachable'){
          lines.push(t('msg.node_problem.why_unreachable', [p.reason]));
          if(p.local && p.network && p.network != 'mainnet'){
            lines.push(t('msg.node_problem.why_local_testnet', [p.network]));
          }
        }else if(p.kind == 'not_epic'){
          lines.push(t('msg.node_problem.why_not_epic', [p.reason]));
        }
        if(showsVersion.value){
          lines.push(t(p.statusReadable ? 'msg.node_problem.status_fallback' : 'msg.node_problem.status_unreadable'));
        }
        return lines;
      });

      const addressChange = computed(() => store.state.nodeAddressChange);
      const addressChangeReason = computed(() => {
        const c = addressChange.value;
        const known = ['scheme_added', 'local_http', 'dead_fallback', 'mainnet_node_on_testnet', 'answered'];
        return c && known.includes(c.reason) ? t('msg.node_problem.reason_' + c.reason, [c.network || '']) : '';
      });

      return {
        store, switching, problem, severe, showsVersion, showsUpgrade, mainnet, why, addressChange, addressChangeReason,
        releasesUrl: NODE_RELEASES_URL, nodeListUrl: NODE_LIST_URL,
      };
    },
    methods: {
      openExternal(url){
        window.openlink.open(url);
      },

      /* the same switch as Settings with "Built-in node server" saved */
      async useBuiltinNode(){
        if(this.switching){
          return;
        }
        this.switching = true;
        try{
          this.configService.updateConfig({check_node_api_http_addr: LOCAL_NODE});
          this.configService.checkTomlFile();
          const account = this.configService.configAccount || this.store.state.user.account;
          const updated = await this.$userService.updateUserByAccount(account, {nodeInternal: true});
          if(updated){
            this.store.commit('nodeType', 'internal');
            this.store.commit('nodeProblem', null);
            this.$toast.success(this.$t('msg.node_problem.switched'));
            this.emitter.emit('app.nodeStart');
          }else{
            this.$toast.error(this.$t('msg.node_problem.switch_failed'));
          }
        }catch(e){
          this.$toast.error(this.$t('msg.node_problem.switch_failed'));
        }finally{
          this.switching = false;
        }
      },
    },
  }
</script>

<style scoped>
  .node-problem {
    margin-bottom: 1.5rem;
  }
  .node-problem-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }
  .node-problem-facts {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.15rem 0.75rem;
    margin-bottom: 0.75rem;
  }
  .node-problem-facts dt {
    font-weight: 600;
  }
  .node-problem-address {
    overflow-wrap: anywhere;
    font-family: monospace;
  }
  .node-problem .message-body p + p,
  .node-problem-epicbox {
    margin-top: 0.5rem;
  }
  .node-problem-subtitle {
    font-weight: 600;
    margin-top: 0.75rem;
    margin-bottom: 0.35rem;
  }
  .node-problem-fixes {
    list-style: disc;
    margin-left: 1.25rem;
  }
  .node-problem-fixes li + li {
    margin-top: 0.4rem;
  }
  .node-problem-hint {
    margin-left: 0.35rem;
    font-size: 0.85em;
    opacity: 0.85;
  }
  .node-problem-actions {
    margin-top: 0.75rem;
    justify-content: flex-end;
  }
</style>
