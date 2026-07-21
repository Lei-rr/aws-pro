<script setup lang="ts">
import { computed } from 'vue'
import { EllipsisVertical } from '@lucide/vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Button } from '@/shared/ui/button'
import type { AwsInstance } from '@/shared/types'

type ActionItem = { key: string; label: string; danger?: boolean }

const props = defineProps<{ row: AwsInstance }>()
const emit = defineEmits<{ operate: [row: AwsInstance, action: string] }>()

const actions = computed<ActionItem[]>(() => {
  if (props.row.state === 'running') {
    const staticIpAction: ActionItem = props.row.static_ip
      ? { key: 'release_static_ip', label: '释放静态 IP', danger: true }
      : { key: 'allocate_static_ip', label: '获取静态 IP' }
    return [
      staticIpAction,
      { key: 'stop', label: '停止' },
      { key: 'reboot', label: '重启' },
      { key: 'open_ports', label: '全端口', danger: true },
      { key: 'terminate', label: '终止', danger: true },
    ]
  }
  if (props.row.state === 'stopped') {
    const list: ActionItem[] = []
    if (props.row.static_ip) list.push({ key: 'release_static_ip', label: '释放静态 IP', danger: true })
    list.push({ key: 'start', label: '启动' }, { key: 'terminate', label: '终止', danger: true })
    return list
  }
  return [{ key: 'terminate', label: '终止', danger: true }]
})
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="size-8">
        <EllipsisVertical class="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-44">
      <DropdownMenuItem
        v-for="action in actions"
        :key="action.key"
        :variant="action.danger ? 'destructive' : 'default'"
        @click="emit('operate', row, action.key)"
      >
        {{ action.label }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
