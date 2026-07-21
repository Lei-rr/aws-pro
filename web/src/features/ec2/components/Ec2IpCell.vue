<script setup lang="ts">
import { computed } from 'vue'
import CopyButton from '@/shared/components/CopyButton.vue'
import type { AwsInstance } from '@/shared/types'

const props = defineProps<{ row: AwsInstance }>()
const ipv4 = computed(() => String((props.row as any).public_ipv4 || props.row.public_ip || ''))
const ipv6 = computed(() => String((props.row as any).public_ipv6 || props.row.ipv6 || ''))
function shortText(value: string, length = 16) {
  return value.length > length ? `${value.slice(0, length)}...` : value
}
</script>

<template>
  <div class="flex min-w-[9rem] flex-col gap-0.5">
    <div v-if="ipv4" class="flex items-center gap-0.5">
      <code class="max-w-[9rem] truncate text-xs" :title="ipv4">{{ ipv4 }}</code>
      <CopyButton :value="ipv4" />
    </div>
    <span v-else class="text-muted-foreground">—</span>
    <div v-if="ipv6" class="flex items-center gap-0.5">
      <code class="text-muted-foreground max-w-[9rem] truncate text-xs" :title="ipv6">{{ shortText(ipv6) }}</code>
      <CopyButton :value="ipv6" />
    </div>
  </div>
</template>
