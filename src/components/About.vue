<template>
  <section class="section is-main-section" id="aboutPage">

      <h1 class="is-size-5">{{ $t('msg.about.title', ['v6.1.6']) }}</h1>
      <p>

        <br/>

      </p>
      <h1 class="is-size-5">{{ $t('msg.about.source') }}</h1>
      <p>
      <a @click="open('https://github.com/EpicCash/epic-gui-wallet')" >https://github.com/EpicCash/epic-gui-wallet</a>
      <br/>
      <br/>
      </p>
        <h1 class="is-size-5">{{ $t('msg.about.thanks') }}</h1>
      <p>
        {{ $t('msg.modern.settings.thanks') }}<br/>
        <br/>
      </p>
      <br/>
    <h1 class="is-size-5">{{ $t('msg.about.community') }}</h1>
    <p>
      {{ $t('msg.modern.settings.community_hint') }}<br/>
      <a @click="open('https://epiccash.com/')" >https://epiccash.com/</a>
    </p>

  </section>

</template>

<script>

  import { useStore } from '@/store';

  import { ref,onMounted } from 'vue';

  export default {
    name: 'about',
    setup(){

      const version = ref('');

      return {
        version,

      }
    },
    async mounted(){
      this.version = await window.api.version();

    //  console.log(this.configService);
    },
    methods: {
      open (link) {
        window.openlink.open(link);
      }

    }
}

</script>
