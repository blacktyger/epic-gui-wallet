<template>
  <!-- The three ways to add a wallet, the same on Welcome (first start, and Unlock › Add a wallet) and in
       Settings › All wallets. Each one adds a new wallet to the list; none replaces one.
       One component for both interfaces (modern: the Modern option rows). -->
  <ul :class="modern ? 'e-add-opts' : 'add-opts'" :aria-label="label || null">
    <li v-for="o in options" :key="o.key">
      <!-- named by its title, the one-line explanation as its description -->
      <router-link :to="o.to" :class="modern ? ['e-add-opt', { 'e-primary': o.primary }] : ['add-opt', { 'is-primary': o.primary }]" :data-add="o.key"
        :aria-labelledby="uid + '-' + o.key + '-t'" :aria-describedby="o.hint ? uid + '-' + o.key : null">
        <EIcon v-if="modern" :name="o.icon" />
        <mdicon v-else :name="o.mdi" size="22" aria-hidden="true" />
        <span :class="modern ? 'e-add-opt-text' : 'add-opt-text'">
          <b :id="uid + '-' + o.key + '-t'">{{ o.title }}</b>
          <span v-if="o.hint" :id="uid + '-' + o.key">{{ o.hint }}</span>
        </span>
        <EIcon v-if="modern" name="chevr" class="e-add-opt-go" />
      </router-link>
    </li>
  </ul>
</template>

<script>
  import EIcon from '@/components/modern/ui/EIcon.vue';
  let seq = 0;

  export default {
    name: 'AddWalletOptions',
    components: { EIcon },
    props: {
      //'new' (Welcome) | 'settings' (Settings › All wallets): where Back on each flow returns to
      from: { type: String, default: 'new' },
      //the network new wallets are made on (Welcome › Advanced; in Settings the open wallet's)
      network: { type: String, default: 'mainnet' },
      modern: { type: Boolean, default: false },
      label: { type: String, default: '' },
    },
    data() {
      return { uid: 'addopt-' + (++seq) };
    },
    computed: {
      options() {
        const net = this.network && this.network !== 'mainnet' ? { network: this.network } : {};
        //Create and Restore: from Settings as "another wallet" (add=1), from Welcome back to Welcome
        const flow = (name) => this.from === 'settings'
          ? { name, query: { add: '1', ...net } }
          : { name, params: { from: 'new' }, query: net };
        return [
          { key: 'create', to: flow('create'), icon: 'plus', mdi: 'plus-circle-outline', primary: true,
            title: this.$t('msg.wallets.add_create'), hint: this.modern ? '' : this.$t('msg.wallets.add_create_hint') },
          { key: 'existing', to: { name: 'addExisting', query: { from: this.from, ...net } }, icon: 'folderopen', mdi: 'folder-open-outline',
            title: this.$t('msg.wallets.add_existing'), hint: this.$t(this.modern ? 'msg.wallets.add_existing_hint_m' : 'msg.wallets.add_existing_hint') },
          { key: 'restore', to: flow('restore'), icon: 'backup', mdi: 'backup-restore',
            title: this.$t('msg.wallets.add_restore'), hint: this.modern ? '' : this.$t('msg.wallets.add_restore_hint') },
        ];
      },
    },
  };
</script>

<style scoped>
  /* Classic: drawn in the page's own colours (light and dark theme), not as a Bulma box (white in dark) */
  .add-opts { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
  .add-opt { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; text-align: left; color: inherit;
    border: 1px solid rgba(128, 128, 128, 0.45); border-radius: 6px; background: transparent; }
  .add-opt:hover { background: rgba(128, 128, 128, 0.12); color: inherit; }
  .add-opt.is-primary { border-color: currentColor; }
  .add-opt:focus-visible { outline: 2px solid #3e8ed0; outline-offset: 2px; }
  .add-opt-text { display: flex; flex-direction: column; min-width: 0; }
  .add-opt-text span { font-size: 0.85rem; opacity: 0.8; }
</style>
