<template>
  <div v-if="count" class="batch-toolbar" aria-live="polite">
    <span class="batch-toolbar-count">已选择 {{ count }} 项</span>
    <a-space class="batch-toolbar-actions" size="small" wrap>
      <a-button
        v-for="action in actions"
        :key="action.key"
        size="small"
        :type="action.type || 'default'"
        :danger="!!action.danger"
        :loading="!!action.loading"
        :disabled="deleting || !!action.disabled"
        @click="$emit('action', action.key)"
        >{{ action.label }}</a-button
      >
      <a-button
        size="small"
        danger
        :loading="deleting"
        :disabled="deleting || deleteDisabled"
        @click="$emit('delete')"
        >{{ deleteText }}</a-button
      >
      <a-button size="small" :disabled="deleting" @click="$emit('clear')">取消选择</a-button>
    </a-space>
  </div>
</template>

<script>
export default {
  name: 'BatchToolbar',
  props: {
    count: { type: Number, default: 0 },
    deleting: { type: Boolean, default: false },
    deleteDisabled: { type: Boolean, default: false },
    deleteText: { type: String, default: '批量删除' },
    actions: { type: Array, default: () => [] },
  },
  emits: ['delete', 'clear', 'action'],
}
</script>
