<script setup lang="ts">
import { computed } from 'vue'
import CopyButton from '@/shared/components/CopyButton.vue'
import type { AwsInstance } from '@/shared/types'

const props = defineProps<{ row: AwsInstance }>()
const primaryIp = computed(() => String(props.row.static_ip || props.row.public_ip || ''))
const ipv6 = computed(() => {
  const v = props.row.ipv6
  if (Array.isArray(v)) return v[0] || ''
  return String(v || '')
})
function shortText(value: string, length = 16) {
  return value.length > length ? `${value.slice(0, length)}...` : value
}
</script>

<template>
  <div class="flex min-w-[9rem] flex-col gap-0.5">
    <div v-if="primaryIp" class="flex items-center gap-0.5">
      <code class="max-w-[9rem] truncate text-xs" :title="primaryIp">{{ primaryIp }}</code>
      <CopyButton :value="primaryIp" />
    </div>
    <span v-else class="text-muted-foreground">—</span>
    <div
      v-if="row.static_ip && row.public_ip && String(row.static_ip) !== String(row.public_ip)"
      class="text-muted-foreground text-xs"
    >
      公网 {{ row.public_ip }}
    </div>
    <div v-if="ipv6" class="flex items-center gap-0.5">
      <code class="text-muted-foreground max-w-[9rem] truncate text-xs" :title="ipv6">{{ shortText(ipv6) }}</code>
      <CopyButton :value="ipv6" />
    </div>
  </div>
</template>
