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
        <p class="node-problem-address">{{ $t('msg.node_problem.address_changed', [addressChange.from, addressChange.to]) }}</p>
        <div class="buttons node-problem-actions">
          <button type="button" class="button is-small is-dark is-outlined" @click="store.commit('nodeAddressChange', null)">{{ $t('msg.node_problem.ok') }}</button>
        </div>
      </div>
    </article>

    <article v-if="problem" class="message node-problem" :class="severe ? 'is-warning' : 'is-info'" aria-labelledby="node-problem-title">
      <!-- only the title is announced, not the whole notice with its buttons -->
      <div class="message-header" :role="severe ? 'alert' : 'status'">
        <h2 id="node-problem-title" class="node-problem-title">
          <mdicon :name="severe ? 'alert-outline' : 'information-outline'" size="18" aria-hidden="true" />
          {{ $t('msg.node_problem.title_' + problem.kind) }}
        </h2>
      </div>
      <div class="message-body">

        <p class="node-problem-address"><span class="sr-only">{{ $t('msg.node_problem.node') }}: </span>{{ problem.address || '—' }}</p>

        <p v-if="problem.epicboxSkipped" class="node-problem-epicbox">
          {{ $t('msg.node_problem.epicbox_skipped') }}
          <router-link to="/httpReceive">{{ $t('msg.node_problem.go_receive') }}</router-link>
        </p>

        <h3 class="node-problem-subtitle">{{ $t('msg.node_problem.fixes') }}</h3>
        <ul class="node-problem-fixes">
          <li>
            <router-link to="/settings" class="button is-small is-primary is-outlined">{{ $t(mainnet ? 'msg.node_problem.fix_public' : 'msg.node_problem.fix_other') }}</router-link>
            <!-- the node list is of mainnet nodes -->
            <a v-if="mainnet" class="node-problem-link" :href="nodeListUrl" @click.prevent="openExternal(nodeListUrl)" @auxclick.prevent>{{ $t('msg.node_problem.node_list') }}<span class="sr-only"> {{ $t('msg.node_problem.opens_browser') }}</span><mdicon name="open-in-new" size="14" aria-hidden="true" /></a>
          </li>
          <li>
            <button type="button" class="button is-small is-primary is-outlined" :class="{'is-loading': switching}"
                    :disabled="switching" :aria-busy="switching" @click="useBuiltinNode">
              {{ $t('msg.node_problem.fix_builtin') }}
            </button>
          </li>
          <li v-if="showsUpgrade">
            <a class="node-problem-link" :href="releasesUrl" @click.prevent="openExternal(releasesUrl)" @auxclick.prevent>{{ $t('msg.node_problem.fix_upgrade') }}<span class="sr-only"> {{ $t('msg.node_problem.opens_browser') }}</span><mdicon name="open-in-new" size="14" aria-hidden="true" /></a>
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
  import { LOCAL_NODE } from '@/shared/nodeAddress.js';

  export const NODE_RELEASES_URL = 'https://github.com/EpicCash/epic/releases';
  export const NODE_LIST_URL = 'https://status.btlabs.uk';

  export default {
    name: 'NodeProblemNotice',
    setup(){
      const store = useStore();
      const switching = ref(false);

      const problem = computed(() => store.state.nodeProblem && !store.state.nodeProblem.hidden ? store.state.nodeProblem : null);
      //the status can't be read: the node panel shows unreachable, Epicbox doesn't start by itself
      const severe = computed(() => !!problem.value && !problem.value.statusReadable);
      const showsVersion = computed(() => !!problem.value && ['too_old', 'status_locked'].includes(problem.value.kind));
      const showsUpgrade = showsVersion;
      const mainnet = computed(() => !problem.value || !problem.value.network || problem.value.network == 'mainnet');

      const addressChange = computed(() => store.state.nodeAddressChange);

      return {
        store, switching, problem, severe, showsUpgrade, mainnet, addressChange,
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
  .node-problem-fixes li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
  }
  .node-problem-fixes li + li {
    margin-top: 0.5rem;
  }
  .node-problem-link {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .node-problem-actions {
    margin-top: 0.75rem;
    justify-content: flex-end;
  }
</style>
