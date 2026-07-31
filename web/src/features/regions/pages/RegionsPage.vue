<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { PageHeader } from '@/shared/ui/page-header'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableLoading } from '@/shared/ui/table'
import { TablePagination } from '@/shared/ui/pagination'
import AccountSelect from '@/shared/components/AccountSelect.vue'
import { regionsApi } from '@/features/regions/api/regions'
import { loadConfig, useConfigStore } from '@/features/config/stores/config'
import { apiList } from '@/shared/api/http'
import { regionName } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { confirmDialog } from '@/shared/ui/confirm'
import { useListPage } from '@/shared/lib/use-list-page'
import { useLocalPagination } from '@/shared/lib/use-local-pagination'

type RegionRow = { account_id?: string; region: string; status?: string }

const STATUS: Record<string, { text: string; ok?: boolean }> = {
  ENABLED: { text: '已启用', ok: true },
  ENABLING: { text: '启用中' },
  DISABLING: { text: '停用中' },
  DISABLED: { text: '未启用' },
  ENABLED_BY_DEFAULT: { text: '默认启用', ok: true },
}

const enabling = ref(new Set<string>())
const accountId = ref('')
const configuredRegions = ref<Record<string, string>>({})
const items = ref<RegionRow[]>([])
const configStore = useConfigStore()

const { loading, refreshing, pageSize, runLoad, onRefresh, onPageSizeChange, fail } = useListPage({
  pageSizeScope: 'aws-regions',
  load: async (options = {}) => {
    const scopeAccountId = accountId.value
    if (!scopeAccountId) return
    try {
      const response = await regionsApi.list(scopeAccountId, {
        refresh: options.refresh,
        cacheOnly: !options.refresh,
      })
      if ((options.isLatest && !options.isLatest()) || scopeAccountId !== accountId.value) return false
      items.value = apiList<RegionRow>(response, ['items'])
    } catch (e) {
      if ((options.isLatest && !options.isLatest()) || scopeAccountId !== accountId.value) return false
      fail(e)
      return false
    }
  },
})
const { page, total, pagedItems: pagedItems, resetPage } = useLocalPagination(items, pageSize)

function statusMeta(status?: string) {
  return STATUS[status || ''] || { text: status || '未知' }
}
function canEnable(row: RegionRow) {
  return row.status === 'DISABLED'
}
function label(id: string) {
  return regionName(configuredRegions.value, id)
}

async function loadRegionConfig() {
  try {
    await loadConfig()
    configuredRegions.value = configStore.config?.regions || {}
  } catch (e) {
    toast.error(errorMessage(e, '加载区域配置失败'))
  }
}

async function query(refresh = false) {
  if (!accountId.value) return
  if (refresh) await onRefresh()
  else await runLoad()
}

async function enableRegion(row: RegionRow) {
  if (!(await confirmDialog({
    title: '启用区域',
    description: `确定要为当前账号启用 ${label(row.region)} (${row.region}) 吗？AWS 启用区域通常需要等待一段时间。`,
    confirmText: '启用',
    destructive: false,
  }))) return
  enabling.value = new Set(enabling.value).add(row.region)
  try {
    await regionsApi.enable({ account_id: accountId.value, region: row.region })
    row.status = 'ENABLING'
    toast.success('已提交启用请求')
  } catch (e) {
    toast.error(errorMessage(e, '启用区域失败'))
  } finally {
    const next = new Set(enabling.value)
    next.delete(row.region)
    enabling.value = next
  }
}

watch(accountId, () => {
  resetPage()
  items.value = []
  if (accountId.value) void runLoad()
})

onMounted(async () => {
  await loadRegionConfig()
  if (accountId.value) await runLoad()
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4">
    <PageHeader title="区域管理" description="使用 AWS Account API 查询账号区域启用状态，并开启未启用区域。">
      <div class="w-48">
        <AccountSelect v-model="accountId" :auto-select="false" />
      </div>
      <Button size="sm" :disabled="!accountId || loading || refreshing" @click="query(true)">
        <RefreshCw class="size-4" :class="refreshing && 'animate-spin'" />
        刷新区域
      </Button>
    </PageHeader>

    <TableLoading :loading="loading" :refreshing="refreshing" :empty="!items.length">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow class="!border-0">
            <TableHead class="rounded-l-lg px-4">区域</TableHead>
            <TableHead>区域代码</TableHead>
            <TableHead>启用状态</TableHead>
            <TableHead class="rounded-r-lg w-24">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody class="**:data-[slot=table-cell]:py-2.5">
          <TableRow v-if="!items.length && !loading">
            <TableCell colspan="4" class="text-muted-foreground py-10 text-center">
              请选择账号后点击刷新按钮查询区域状态。
            </TableCell>
          </TableRow>
          <TableRow v-for="record in pagedItems" :key="`${record.account_id}:${record.region}`">
            <TableCell class="px-4 font-medium">{{ label(record.region) }}</TableCell>
            <TableCell class="text-muted-foreground">{{ record.region }}</TableCell>
            <TableCell>
              <Badge :variant="statusMeta(record.status).ok ? 'secondary' : 'outline'">
                {{ statusMeta(record.status).text }}
              </Badge>
            </TableCell>
            <TableCell>
              <Button
                v-if="canEnable(record)"
                variant="link"
                size="sm"
                class="h-auto px-0"
                :disabled="enabling.has(record.region)"
                @click="enableRegion(record)"
              >
                启用
              </Button>
              <span v-else class="text-muted-foreground">—</span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <TablePagination
        class="mt-2"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :disabled="loading"
        @update:page="page = $event"
        @update:page-size="onPageSizeChange"
      />
    </TableLoading>
  </div>
</template>
