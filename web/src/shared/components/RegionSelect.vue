
<template>
  <a-select v-model:value="model" style="min-width: 200px" :options="options" placeholder="选择区域" allow-clear show-search />
</template>
<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ regions: Record<string, string> }>()
const model = defineModel<string | undefined>({ default: undefined })
const options = computed(() => Object.entries(props.regions || {}).map(([value, label]) => ({ value, label: `${label} (${value})` })))
</script>
