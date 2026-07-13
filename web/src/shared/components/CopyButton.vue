<template>

    <a-button type="link" size="small" title="复制" class="copy-button" @click="copy">
      <template #icon><span aria-hidden="true">⧉</span></template>
    </a-button>
  
</template>

<script>
import { copyText } from '../utils/clipboard.js'

export default {
  props: { value: [String, Number] },
  methods: {
    copy() {
      copyText(this.value)
    },
  }
  };
</script>
