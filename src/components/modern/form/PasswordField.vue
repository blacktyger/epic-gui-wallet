<template>
  <div class="e-input-wrap">
    <input
      class="e-input"
      :type="reveal ? 'text' : 'password'"
      :name="name"
      :placeholder="placeholder"
      :required="required"
      autocomplete="off"
      spellcheck="false"
      :aria-invalid="errors[name] ? 'true' : null"
      :aria-describedby="describedBy"
      v-model="input"
      @keyup="loadcaps"
    />
    <div class="e-trail">
      <button type="button" class="e-icon-btn" :aria-pressed="reveal ? 'true' : 'false'"
        :aria-label="reveal ? $t('msg.modern.hide_password') : $t('msg.modern.show_password')"
        @click="reveal = !reveal"><EIcon :name="reveal ? 'eyeoff' : 'eye'" /></button>
    </div>
  </div>
  <p v-if="isCapslock" :id="uid + '-c'" class="e-help"><EIcon name="capslock" size="sm" style="vertical-align:-3px" /> {{ $t('msg.modern.caps_lock') }}</p>
  <p v-if="errors[name]" :id="uid + '-e'" class="e-error-msg" role="alert"><EIcon name="alertc" /><span>{{ errors[name] }}</span></p>
</template>

<script>
  import Base from '@/components/form/passwordField.vue';
  import EIcon from '@/components/modern/ui/EIcon.vue';
  import { reskin } from '@/components/modern/reskin';
  let seq = 0;
  export default reskin(Base, {
    components: { EIcon },
    data() {
      return { uid: 'e-pw-' + (++seq), reveal: false };
    },
    computed: {
      describedBy() {
        const ids = [];
        if (this.errors[this.name]) ids.push(this.uid + '-e');
        if (this.isCapslock) ids.push(this.uid + '-c');
        return ids.length ? ids.join(' ') : null;
      },
    },
  });
</script>
