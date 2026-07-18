<template>
  <div class="page-toolbar">
    <div class="page-toolbar-title">
      <a-button v-if="backText" type="link" style="padding: 0" @click="$emit('back')">{{ backText }}</a-button>
      <a-typography-title :level="3" :style="backText ? { margin: '4px 0' } : { marginBottom: '4px' }">{{
        title
      }}</a-typography-title>
      <slot name="subtitle">
        <a-typography-text v-if="subtitle" type="secondary">{{ subtitle }}</a-typography-text>
      </slot>
    </div>
    <div class="page-actions">
      <a-input-search
        v-if="showSearch"
        class="page-search"
        :value="keyword"
        :style="searchWidth ? { width: searchWidth } : undefined"
        :placeholder="searchPlaceholder"
        allow-clear
        @update:value="$emit('update:keyword', $event)"
        @search="$emit('search')"
      />
      <slot name="actions" />
    </div>
  </div>
</template>

<script>
export default {
  name: 'ListToolbar',
  props: {
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    backText: { type: String, default: '' },
    keyword: { type: String, default: '' },
    searchPlaceholder: { type: String, default: '搜索' },
    showSearch: { type: Boolean, default: true },
    searchWidth: { type: String, default: '' },
  },
  emits: ['update:keyword', 'search', 'back'],
}
</script>
