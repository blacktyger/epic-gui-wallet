<template>
  <div class="e-field">
    <span class="e-label" :id="uid + '-l'">{{ $t("msg.node_server") }}</span>
    <div class="e-choices e-two" role="radiogroup" :aria-labelledby="uid + '-l'">
      <label class="e-choice">
        <input type="radio" :name="uid" value="internal" v-model="select" @change="nodeserverFieldChanged" />
        <span class="e-card"><EIcon name="server" /><b>{{ $t("msg.node_server_builtin") }}</b></span>
      </label>
      <label class="e-choice">
        <input type="radio" :name="uid" value="external" v-model="select" @change="nodeserverFieldChanged" />
        <span class="e-card"><EIcon name="web" /><b>{{ $t("msg.node_server_external") }}</b></span>
      </label>
    </div>
  </div>
  <div class="e-field" v-if="select == 'external'">
    <label class="e-label" :for="uid + '-a'">{{ $t("msg.node_server_address") }}</label>
    <div class="e-nodeaddr-row">
    <div class="e-input-wrap">
      <input
        :id="uid + '-a'"
        class="e-input e-mono"
        type="text"
        required
        spellcheck="false"
        translate="no"
        :aria-invalid="errors.nodeaddress ? 'true' : null"
        :aria-describedby="errors.nodeaddress ? uid + '-e' : null"
        v-model="input"
        :disabled="checking"
        @paste="pasted = true"
      />
      <div class="e-trail" v-if="checking"><span class="e-spinner" role="status" :aria-label="$t('msg.modern.checking')"></span></div>
    </div>
    <button v-if="myNodesReady" type="button" class="e-btn e-nodeaddr-add" :class="{ 'e-btn-ghost': inMyNodes }" :disabled="checking || !canAddMyNode" @click="openAddMyNode">
      <EIcon :name="inMyNodes ? 'check' : 'plus'" size="sm" />{{ inMyNodes ? $t('msg.mynodes.in_list') : $t('msg.mynodes.add') }}
    </button>
    </div>
  <p v-if="errors.nodeaddress" :id="uid + '-e'" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ errors.nodeaddress }}</span></p>
  <NodeCheckStatus v-if="liveCheck" :state="check" @recheck="recheck" />
  </div>
  <!-- My nodes: saved addresses with a label (logic: components/form/myNodesField.js); only when there are some -->
  <MyNodesList
    v-if="select == 'external' && myNodesReady"
    :nodes="myNodes"
    :views="myNodeViews"
    :checking="myNodesChecking"
    :current="String(input || '')"
    :disabled="checking"
    @use="useMyNode"
    @edit="openEditMyNode"
    @remove="removeMyNode"
  />
  <!-- live public nodes from status.btlabs.uk (logic in the Classic base): picking one only fills the address; hidden when unavailable -->
  <NodeDirectory
    v-if="select == 'external' && !directoryFailed"
    :address="String(input || '')"
    :chain="directoryChain"
    :disabled="checking"
    @pick="pickPublicNode"
    @loaded="directoryLoaded"
  />
  <MyNodeDialog
    v-if="myNodeDialog"
    :mode="myNodeDialog.mode"
    :initial-address="myNodeDialog.address"
    :initial-label="myNodeDialog.label"
    :was="myNodeDialog.was"
    :nodes="myNodes"
    :error="myNodeDialog.error"
    :probe="probe"
    :cache="checkCache"
    @save="saveMyNode"
    @close="myNodeDialog = null"
  />
</template>

<script>
  import Base from '@/components/form/nodeserverField.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import NodeDirectory from '@/components/modern/form/NodeDirectory.vue';
  import NodeCheckStatus from '@/components/modern/form/NodeCheckStatus.vue';
  import MyNodesList from '@/components/modern/form/MyNodesList.vue';
  import MyNodeDialog from '@/components/modern/form/MyNodeDialog.vue';
  import { reskin } from '@/components/modern/reskin';
  let seq = 0;
  export default reskin(Base, {
    components: { EIcon, NodeDirectory, NodeCheckStatus, MyNodesList, MyNodeDialog },
    data() { return { uid: 'e-nodeserverField-' + (++seq) }; },
  });
</script>
