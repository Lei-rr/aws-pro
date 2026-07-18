<template>
  <a-space size="small" wrap class="table-actions">
    <a-button
      v-if="primary"
      type="link"
      size="small"
      :disabled="disabled || !!primary.disabled"
      @click="$emit('select', primary.key)"
      >{{ primary.label }}</a-button
    >
    <a-button v-else-if="showEdit" type="link" size="small" :disabled="disabled" @click="$emit('edit')">编辑</a-button>

    <template v-for="item in inlineItems" :key="item.key">
      <a-button
        type="link"
        size="small"
        :danger="!!item.danger"
        :disabled="disabled || !!item.disabled"
        @click="select(item)"
        >{{ item.label }}</a-button
      >
    </template>

    <a-dropdown v-if="menuItems.length">
      <a-button type="link" size="small" :disabled="disabled">更多</a-button>
      <template #overlay>
        <a-menu>
          <a-menu-item
            v-for="item in menuItems"
            :key="item.key"
            :danger="!!item.danger"
            :disabled="!!item.disabled"
            @click="select(item)"
            >{{ item.label }}</a-menu-item
          >
        </a-menu>
      </template>
    </a-dropdown>
  </a-space>
</template>

<script>
export default {
  name: 'TableActions',
  props: {
    primary: { type: Object, default: null },
    items: { type: Array, default: () => [] },
    disabled: { type: Boolean, default: false },
    showEdit: { type: Boolean, default: true },
  },
  emits: ['edit', 'select'],
  computed: {
    actionItems() {
      return this.items || []
    },
    inlineItems() {
      return this.actionItems.filter((item) => item.inline)
    },
    menuItems() {
      return this.actionItems.filter((item) => !item.inline)
    },
  },
  methods: {
    select(item) {
      if (!this.disabled && !item.disabled) this.$emit('select', item.key)
    },
  },
}
</script>
