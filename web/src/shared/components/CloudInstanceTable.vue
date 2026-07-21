<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableLoading,
} from '@/shared/ui/table'
import { TablePagination } from '@/shared/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { regionName } from '@/shared/lib/format'
import type { AwsInstance } from '@/shared/types'

const props = withDefaults(
  defineProps<{
    loading?: boolean
    instances?: AwsInstance[]
    regions?: Record<string, string>
    packageKey: string
    packageLabel?: (row: AwsInstance) => string
    rowKey: (row: AwsInstance) => string
    stateLabels?: Record<string, string>
    emptyText?: string
  }>(),
  {
    loading: false,
    instances: () => [],
    regions: () => ({}),
    packageLabel: undefined,
    stateLabels: () => ({}),
    emptyText: '暂无实例，请先选择账号和区域同步。',
  },
)

const emit = defineEmits<{
  operate: [row: AwsInstance, action: string]
  remark: [row: AwsInstance]
}>()

const page = ref(1)
const pageSize = ref(20)
const filterRegion = ref('all')
const filterAccount = ref('all')
const filterPackage = ref('all')
const filterState = ref('all')
const filterStatic = ref('all')

const accountOptions = computed(() =>
  Array.from(new Set((props.instances || []).map((r) => r.account_id).filter(Boolean) as string[])).sort(),
)
const packageOptions = computed(() =>
  Array.from(
    new Set((props.instances || []).map((r) => String(r[props.packageKey] || '')).filter(Boolean)),
  ).sort(),
)
const regionOptions = computed(() =>
  Array.from(new Set((props.instances || []).map((r) => r.region).filter(Boolean) as string[])).sort(),
)

const filtered = computed(() => {
  return (props.instances || []).filter((row) => {
    if (filterRegion.value !== 'all' && row.region !== filterRegion.value) return false
    if (filterAccount.value !== 'all' && row.account_id !== filterAccount.value) return false
    if (filterPackage.value !== 'all' && String(row[props.packageKey] || '') !== filterPackage.value) return false
    if (filterState.value !== 'all' && row.state !== filterState.value) return false
    if (filterStatic.value === 'yes' && !row.static_ip) return false
    if (filterStatic.value === 'no' && row.static_ip) return false
    return true
  })
})

const paged = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

watch([filterRegion, filterAccount, filterPackage, filterState, filterStatic, pageSize], () => {
  page.value = 1
})
watch(
  () => props.instances,
  () => {
    const maxPage = Math.max(1, Math.ceil(filtered.value.length / pageSize.value) || 1)
    if (page.value > maxPage) page.value = maxPage
  },
)

function stateLabel(state?: string) {
  return props.stateLabels?.[state || ''] || state || '—'
}
function packageText(row: AwsInstance) {
  if (props.packageLabel) return props.packageLabel(row)
  return String(row[props.packageKey] || '—')
}
function regionLabel(id?: string) {
  return regionName(props.regions, id)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <Select v-model="filterRegion">
        <SelectTrigger class="h-8 w-[9.5rem]"><SelectValue placeholder="区域" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部区域</SelectItem>
          <SelectItem v-for="id in regionOptions" :key="id" :value="id">{{ regionLabel(id) }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="filterAccount">
        <SelectTrigger class="h-8 w-[9.5rem]"><SelectValue placeholder="账号" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部账号</SelectItem>
          <SelectItem v-for="id in accountOptions" :key="id" :value="id">{{ id }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="filterPackage">
        <SelectTrigger class="h-8 w-[9.5rem]"><SelectValue placeholder="套餐" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部套餐</SelectItem>
          <SelectItem v-for="id in packageOptions" :key="id" :value="id">{{ id }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="filterState">
        <SelectTrigger class="h-8 w-[8rem]"><SelectValue placeholder="状态" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部状态</SelectItem>
          <SelectItem value="running">运行中</SelectItem>
          <SelectItem value="stopped">已停止</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="filterStatic">
        <SelectTrigger class="h-8 w-[8rem]"><SelectValue placeholder="静态 IP" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">静态 IP</SelectItem>
          <SelectItem value="yes">已绑定</SelectItem>
          <SelectItem value="no">未绑定</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <TableLoading :loading="loading" :empty="!filtered.length">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow class="!border-0">
            <TableHead class="rounded-l-lg px-4">区域</TableHead>
            <TableHead>实例</TableHead>
            <TableHead>IP</TableHead>
            <TableHead class="hidden md:table-cell">账号</TableHead>
            <TableHead class="hidden lg:table-cell">套餐</TableHead>
            <TableHead>状态</TableHead>
            <TableHead class="hidden md:table-cell">静态 IP</TableHead>
            <TableHead class="hidden md:table-cell">备注</TableHead>
            <TableHead class="rounded-r-lg w-16 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody class="**:data-[slot=table-cell]:py-2.5">
          <TableRow v-if="!paged.length && !loading">
            <TableCell colspan="9" class="text-muted-foreground py-10 text-center">
              {{ emptyText }}
            </TableCell>
          </TableRow>
          <TableRow v-for="record in paged" :key="rowKey(record)">
            <TableCell class="px-4">
              <div class="flex flex-col">
                <span class="font-medium">{{ regionLabel(record.region) }}</span>
                <span v-if="record.zone" class="text-muted-foreground text-xs">{{ record.zone }}</span>
              </div>
            </TableCell>
            <TableCell class="max-w-[10rem] truncate font-medium">{{ record.name || '—' }}</TableCell>
            <TableCell class="min-w-[10rem]">
              <slot name="ip" :record="record" />
            </TableCell>
            <TableCell class="hidden max-w-[10rem] truncate md:table-cell">{{ record.account_id || '—' }}</TableCell>
            <TableCell class="hidden max-w-[12rem] truncate lg:table-cell">
              <slot name="package" :record="record">{{ packageText(record) }}</slot>
            </TableCell>
            <TableCell>
              <Badge :variant="record.state === 'running' ? 'secondary' : 'outline'">
                {{ stateLabel(record.state) }}
              </Badge>
            </TableCell>
            <TableCell class="hidden md:table-cell">
              <slot name="static_ip" :record="record">
                <div class="flex items-center gap-1.5">
                  <Badge :variant="record.static_ip ? 'secondary' : 'outline'">
                    {{ record.static_ip ? '已绑定' : '未绑定' }}
                  </Badge>
                  <Button
                    v-if="record.static_ip"
                    variant="link"
                    size="sm"
                    class="text-destructive h-auto px-0"
                    @click="emit('operate', record, 'release_static_ip')"
                  >
                    释放
                  </Button>
                  <Button
                    v-else
                    variant="link"
                    size="sm"
                    class="h-auto px-0"
                    @click="emit('operate', record, 'allocate_static_ip')"
                  >
                    获取
                  </Button>
                </div>
              </slot>
            </TableCell>
            <TableCell class="hidden md:table-cell">
              <Button variant="link" size="sm" class="h-auto max-w-[8rem] truncate px-0" @click="emit('remark', record)">
                {{ record.remark || '添加' }}
              </Button>
            </TableCell>
            <TableCell class="text-right">
              <slot name="actions" :record="record" />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <TablePagination
        class="mt-2"
        :page="page"
        :page-size="pageSize"
        :total="filtered.length"
        :disabled="loading"
        @update:page="(v) => (page = v)"
        @update:page-size="(v) => (pageSize = v)"
      />
    </TableLoading>
  </div>
</template>
