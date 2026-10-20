<template>
  <div class="modal"
    v-bind:class="{'is-active': isModalActive}"
  >
    <div class="modal-background"></div>
    <div class="modal-card">
      <header class="modal-card-head">
        <p class="modal-card-title">
          {{ $t('msg.confirm_action') }}
        </p>
        <button
          type="button"
          class="delete"
          @click="cancel"
        />
      </header>
      <section class="modal-card-body">
        <i18n-t keypath="msg.delete_permanently" tag="p"><b>{{ trashObjectName }}</b></i18n-t>
        <p>{{ $t('msg.cannot_undo') }}</p>
      </section>
      <footer class="modal-card-foot">
        <button class="button is-danger" @click="cancel">
          {{ $t('msg.cancel') }}
        </button>
        <button class="button is-danger" @click="confirm">
          {{ $t('msg.delete') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'ModalBox',
  props: {
    isActive: Boolean,
    trashObjectName: {
      type: String,
      default: null
    }
  },
  emits: ['cancel', 'confirm'],
  setup (props, { emit }) {
    const isModalActive = computed({
      get: () => props.isActive,
      set: value => {
        if (!value) {
          cancel()
        }
      }
    })

    const confirm = () => {
      emit('confirm')
    }

    const cancel = () => {
      emit('cancel')
    }

    return {
      isModalActive,
      confirm,
      cancel
    }
  }
}
</script>
