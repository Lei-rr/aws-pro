<template>
  <a-alert
    v-if="visible"
    :type="alertType"
    show-icon
    style="margin-bottom: 12px"
    :message="titleText"
    :description="description || undefined"
  />
</template>

<script>
export default {
  name: 'JobProgressAlert',
  props: {
    running: { type: Boolean, default: false },
    text: { type: String, default: '' },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    status: { type: String, default: '' },
    /** default warning while running */
    tone: { type: String, default: 'warning' },
  },
  computed: {
    visible() {
      return Boolean(this.running || this.text)
    },
    titleText() {
      return this.title || this.text || '任务执行中...'
    },
    alertType() {
      if (this.status === 'failed') return 'error'
      if (this.status === 'completed') return 'success'
      return this.tone === 'info' ? 'info' : 'warning'
    },
  },
}
</script>
