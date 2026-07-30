<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { loadConfig, useConfigStore } from '@/features/config/stores/config'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    source?: 'regions' | 'ec2_regions'
    autoSelect?: boolean
  }>(),
  { source: 'regions', autoSelect: true },
)
const emit = defineEmits<{ 'update:modelValue': [string]; loaded: [Record<string, string>] }>()

const configStore = useConfigStore()
const regions = computed(() => {
  const cfg = configStore.config
  if (!cfg) return {} as Record<string, string>
  if (props.source === 'ec2_regions') return (cfg.ec2_regions || cfg.regions || {}) as Record<string, string>
  return (cfg.regions || {}) as Record<string, string>
})
const entries = computed(() => Object.entries(regions.value))

async function ensureLoaded() {
  try {
    await loadConfig()
    emit('loaded', regions.value)
    if (props.autoSelect && !props.modelValue) {
      const first = Object.keys(regions.value)[0] || 'us-east-1'
      emit('update:modelValue', first)
    }
  } catch (e) {
    emit('loaded', regions.value)
    toast.error(errorMessage(e, '加载区域失败'))
  }
}

onMounted(() => {
  void ensureLoaded()
})
watch(
  () => props.source,
  () => {
    void ensureLoaded()
  },
)
</script>

<template>
  <Select
    :model-value="modelValue || ''"
    @update:model-value="(v) => emit('update:modelValue', String(v || ''))"
  >
    <SelectTrigger class="w-full min-w-[10rem]">
      <SelectValue placeholder="选择区域" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="[id, name] in entries" :key="id" :value="id">
        {{ name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
