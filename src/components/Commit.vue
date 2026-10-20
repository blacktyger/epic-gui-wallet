<template>
  <div class="card has-table has-mobile-sort-spaced">
    <header class="card-header">
      <p class="card-header-title">

        <mdicon name="hand-coin-outline" size="18" />&nbsp;{{ $t("msg.commit.coins") }}
      </p>
      <button :disabled="isRefresh" type="button" class="button is-small" @click="this.getCommits()"><span class="icon"><mdicon name="refresh" /></span><span>{{ $t("msg.refresh") }}</span></button>

    </header>
    <div class="notification is-card-toolbar is-upper">
      <div class="level">
        <div class="level-left">
          <div class="level-item">
            <div class="buttons has-addons">
              <button v-bind:class="{'is-active': currentFilter == 'unspent'}" @click="filter('unspent', 0, true)" class="button">{{ $t("msg.commit.unspent") }}</button>
              <button v-bind:class="{'is-active': currentFilter == 'unconfirmed'}" @click="filter('unconfirmed', 0, true)" class="button">{{ $t("msg.commit.unconfirmed") }}</button>
            </div>
          </div>
        </div>
        <div class="level-right">
          <div class="level-item">
            <form v-on:submit.prevent="search" >
              <div class="field has-addons">
                <div class="control">

                  <input class="input" type="text" :placeholder="$t('msg.placeholder_search')" v-model="keyword" @keyup.enter="search" v-bind:disabled="searched">
                </div>
                <div class="control">

                  <button v-show="!searched" class="button is-primary"><span class="icon"><mdicon name="dots-horizontal" /></span></button>
                  <button @click.prevent v-show="searched" class="button is-primary"><span class="icon"><mdicon name="close-circle-outline" /></span></button>


                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
    <div class="card-content">
      <div class="b-table has-pagination">
        <div class="table-wrapper has-mobile-cards">

          <table class="table is-fullwidth is-striped is-hoverable">
            <thead>
              <tr class="th">
                <th width="60">#</th>
                <th>{{ $t("msg.commit.coin_id") }}</th>
                <th>{{ $t("msg.commit.heightCreated") }}</th>
                <th>{{ $t("msg.commit.value") }}</th>
                <th>{{ $t("msg.commit.status") }}</th>
              </tr>
            </thead>
            <tbody v-if="current_commits.length">

              <tr v-for="(ct, index) in current_commits" :key="ct.commit" @mouseover="(event)=>mouseover(index)" @mouseleave="mouseLeave" style="width:46px;" >
                      <td >

                          <span :title="$t('msg.copy_title')" v-if="showCopy===index" @click="copy(index)">
                              <mdicon name="content-copy" size="18" />
                          </span>
                          <span v-if="copied===index">
                              <mdicon name="checkbox-marked-circle-outline" size="18" />
                          </span>

                      </td>
                      <td>

                        <span v-if="ct.status=='Unconfirmed'" >{{ $filters.truncate(ct.commit, 35 ) }}</span>
                        <a v-else @click="open(`${ct.commit}`)">{{ $filters.truncate(ct.commit, 35 ) }}</a>

                      </td>
                      <td>

                        <span  v-if="ct.status=='Unconfirmed'">{{ct.height}}</span>
                       <a v-else @click="open(`${ct.height}`)">{{ct.height}}</a>

                      </td>
                      <td><span v-bind:class="{'amount-hidden': store.state.hideValues }" >{{ ct.value/100000000 }}</span></td>
                      <td>
                        <div class="coin-status">
                          <confirmation-ring v-if="ringState(ct)" :state="ringState(ct)" :confirmations="coinState(ct).confirmations" />
                          <span v-if="coinState(ct).state=='confirming'" class="tag is-warning is-normal">{{ $t("msg.confirmations.confirming") }}</span>
                          <span v-else-if="coinState(ct).state=='immature'" class="tag is-warning is-normal">{{ $t("msg.info.immature") }}</span>
                          <span v-else-if="coinState(ct).state=='confirmed'" class="tag is-success is-normal">{{ $t("msg.commit.unspent") }}</span>
                          <span v-else-if="coinState(ct).state=='waiting'" class="tag is-warning is-normal">{{ $t("msg.info.unfinalization") }}</span>
                          <span v-else-if="ct.status=='Locked'" class="tag is-danger is-normal">{{ $t("msg.locked") }}</span>
                          <span v-else-if="ct.status=='Spent'" class="tag is-warning is-normal">{{ $t("msg.commit.spent") }}</span>
                        </div>
                      </td>

              </tr>

            </tbody>
            <tbody v-else >
            <tr class="is-empty" >
              <td colspan="7">
                <section class="section">
                  <div class="content has-text-grey has-text-centered">
                    <p>

                      <span v-if="this.store.state.walletSync == 'loading'">{{ $t("msg.app.loading_wallet_data") }}</span>
                      <span v-else-if="this.store.state.nodeStatus.sync_status == 'synced'" class="icon is-large"><mdicon name="circle-off-outline" size="48" /></span>
                      <span v-else>{{ $t("msg.waiting_for_nodesync") }}</span>
                    </p>

                  </div>
                </section>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
        <div class="top level">
          <div class="level-left">
            <div class="level-item">
              <div class="buttons has-addons">

                <button :disabled="current_page_index <= 1" class="button" @click="prev">&lt;</button>

                <template v-for="index in pages_count" :key="index">

                  <button v-if="index <= Math.round(maxButtons/2) || index > (pages_count-Math.round(maxButtons/2)) " @click="page(index)" v-bind:class="{'is-active': current_page_index == index}" class="button" >
                    {{ index }}
                  </button>
                  <button v-else-if="index == Math.round(pages_count/2)" v-bind:class="{'is-active': current_page_index > Math.round(maxButtons/2) && current_page_index <= (pages_count-Math.round(maxButtons/2))}" class="button" >
                  <span class="pager-activepage" v-if="current_page_index > Math.round(maxButtons/2) && current_page_index <= (pages_count-Math.round(maxButtons/2))">{{current_page_index}}</span>...
                  </button>

                </template>

                <button :disabled="current_page_index >= pages_count" class="button" @click="next">&gt;</button>

              </div>
            </div>
          </div>
          <div class="level-right">
            <div class="level-item">
              <small>{{ $t("msg.page_of", [current_page_index, pages_count]) }}</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

</template>

<script>

  const clipboard = window.clipboard

  import { ref, computed } from 'vue';
  import { useStore } from '@/store'
  import { outputConfirmationState } from '@/shared/confirmations';
  import ConfirmationRing from '@/components/layout/ConfirmationRing.vue';

  export default {
    name: 'commit',
    components: {
      ConfirmationRing
    },
    props:{

      nodeHeight:{
        type:Number,
        default:function(){
          return 0
        }
      }
    },

    setup(){

      const store = useStore();
      const count_per_page = ref(10);
      const total_commits = computed(() => store.state.commits);
      const isRefresh = ref(false);
      const maxButtons = ref(6);
      const currentFilter = ref('');
      const pages_count = ref(1);
      const current_page_index = ref(1);
      const searched = ref(false);
      const keyword =  ref("");
      const locale = ref('en');


      return{
        store,
        total_commits,
        count_per_page,
        isRefresh,
        maxButtons,
        currentFilter,
        pages_count,
        current_page_index,
        searched,
        keyword,
        locale
      }
    },
    watch: {
        total_commits: function (newVal) {
          this.isRefresh = false;
          if(newVal){
            let s = (this.current_page_index-1)*this.count_per_page
            if(this.currentFilter == ''){
              this.current_commits = newVal.slice(s, s+this.count_per_page);
              if (newVal.length % this.count_per_page == 0){
                this.pages_count = parseInt(newVal.length/this.count_per_page)
              }else{
                this.pages_count = parseInt(newVal.length/this.count_per_page) + 1
              }
            }else{
              //filter() sets the page count of the filtered list
              this.current_commits = this.filter(this.currentFilter, s, false);
            }
          }
        },
    },
    mounted() {

      this.current_commits = this.total_commits.slice(0, this.count_per_page);
      if (this.total_commits.length % this.count_per_page == 0){
        this.pages_count = parseInt(this.total_commits.length/this.count_per_page)
      }else{
        this.pages_count = parseInt(this.total_commits.length/this.count_per_page) + 1
      }

    },
    async created(){
      this.locale = await window.api.locale();
    },
    data() {
      return {
        current_commits: [],
        showCopy: -1,
        copied: -1,
      }
    },

    beforeUnmount() {
      clearTimeout(this.refreshTimer);
    },
    methods: {
      coinState(ct){
        return outputConfirmationState(ct, this.store.getters.tipHeight);
      },
      /* the ring of a coin, or null for immature, locked and spent coins */
      ringState(ct){
        const s = this.coinState(ct).state;
        return ['waiting', 'confirming', 'confirmed'].includes(s) ? s : null;
      },
      mouseover(index){
        if(this.copied===-1){
          this.showCopy = index
        }
      },
      mouseLeave(){
        this.showCopy = -1,
        this.copied =  -1
      },
      copy(index){
        let ct = this.current_commits[index]
        clipboard.writeText(ct.commit);
        this.$toast.success(this.$t("msg.commit.copy"));
        this.copied = index
        this.showCopy = -1
      },

      /* the full refresh in App.vue: summary (the tip), txs and outputs together, so all views agree */
      getCommits() {
          this.isRefresh = true;
          this.emitter.emit('app.update');
          clearTimeout(this.refreshTimer);
          this.refreshTimer = setTimeout(() => { this.isRefresh = false; }, 15000);
      },



      next(){
        this.current_page_index += 1
        let s = (this.current_page_index-1)*this.count_per_page
        this.current_commits = this.currentFilter == '' ? this.total_commits.slice(s, s+this.count_per_page) : this.filter(this.currentFilter, s, false)
      },
      prev(){
        this.current_page_index -= 1
        let s = (this.current_page_index-1)*this.count_per_page
        this.current_commits = this.currentFilter == '' ? this.total_commits.slice(s, s+this.count_per_page) : this.filter(this.currentFilter, s, false)
      },
      page(index){
        this.current_page_index = index
        let s = (this.current_page_index-1)*this.count_per_page
        this.current_commits = this.currentFilter == '' ? this.total_commits.slice(s, s+this.count_per_page) : this.filter(this.currentFilter, s, false)
      },

      filter(type, isSlice, toggleFilter){

        if(type == this.currentFilter && toggleFilter){
          type = '';
        }

        if(isSlice == 0){
          this.current_page_index = 1;
        }

        let filterCommits = [];
        this.currentFilter = type;


        if(type == 'unspent'){
          for(let commit of this.total_commits){

            if(commit.status == 'Unspent'){
              filterCommits.push(commit);
            }
          }
        }else if(type == 'unconfirmed'){
          for(let commit of this.total_commits){
            if(commit.status == 'Unconfirmed'){
              filterCommits.push(commit);
            }
          }
        }else{
          filterCommits = this.total_commits
        }


        this.current_commits = filterCommits.slice(isSlice, isSlice+this.count_per_page);
        if (filterCommits.length % this.count_per_page == 0){
          this.pages_count = parseInt(filterCommits.length/this.count_per_page)
        }else{
          this.pages_count = parseInt(filterCommits.length/this.count_per_page) + 1
        }

        return this.current_commits;

      },

      search(){

        let keyword = this.keyword
        if(this.keyword){
          if(this.currentFilter != ''){
            let filtered_commits = this.filter(this.currentFilter, 0, false);
            this.current_commits = filtered_commits.filter(function(ct){
              if(ct.commit.search(keyword) != -1){
                return ct
              }
            });
          }else{
            this.current_commits = this.total_commits.filter(function(ct){
              if(ct.commit.search(keyword) != -1){
                return ct
              }
            });
          }

          this.searched = true

        }

      },

      clearup(){

        this.keyword = ""
        this.searched = false

        let s = (this.current_page_index-1)*this.count_per_page
        this.current_commits = this.currentFilter == '' ? this.total_commits.slice(s, s+this.count_per_page) : this.filter(this.currentFilter, s, false);
      },
      open (link) {
        //window.explorer.open(link);
      }
    }
  }
</script>

<style scoped>
  .coin-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
