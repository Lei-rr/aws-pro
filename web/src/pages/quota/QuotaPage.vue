<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { PageHeader } from '@/shared/ui/page-header'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableLoading } from '@/shared/ui/table'
import { TablePagination } from '@/shared/ui/pagination'
import { AccountSelect } from '@/features/accounts'
import { RegionSelect } from '@/features/config'
import { quotaApi } from '@/features/quota'
import { apiList } from '@/shared/api/http'
import { regionName } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { useListPage } from '@/shared/lib/use-list-page'
import { useLocalPagination } from '@/shared/lib/use-local-pagination'

type QuotaRow = { name: string; account_id?: string; region?: string; value?: unknown; error?: boolean }

const accountId = ref('')
const region = ref('')
const regions = ref<Record<string, string>>({})
const items = ref<QuotaRow[]>([])

const { loading, refreshing, pageSize, runLoad, onRefresh, onPageSizeChange, fail } = useListPage({
  pageSizeScope: 'aws-quota',
  load: async (options = {}) => {
    const scopeAccountId = accountId.value
    const scopeRegion = region.value
    if (!scopeAccountId || !scopeRegion) return
    try {
      const response = await quotaApi.vcpu(
        { account_id: scopeAccountId, region: scopeRegion },
        { refresh: options.refresh, cacheOnly: !options.refresh }
      )
      if (
        (options.isLatest && !options.isLatest()) ||
        scopeAccountId !== accountId.value ||
        scopeRegion !== region.value
      )
        return false
      items.value = apiList<QuotaRow>(response, ['items'])
    } catch (e) {
      if (
        (options.isLatest && !options.isLatest()) ||
        scopeAccountId !== accountId.value ||
        scopeRegion !== region.value
      )
        return false
      fail(e)
      return false
    }
  },
})
const { page, total, pagedItems, resetPage } = useLocalPagination(items, pageSize)

async function query() {
  if (!accountId.value || !region.value) {
    toast.warning('请选择账号和区域')
    return
  }
  await onRefresh()
}

watch([accountId, region], () => {
  resetPage()
  items.value = []
  if (accountId.value && region.value) void runLoad()
})

onMounted(() => {
  if (accountId.value && region.value) void runLoad()
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4">
    <PageHeader title="vCPU 配额" description="按账号和区域查询 Lightsail 相关服务配额。">
      <div class="w-44"><AccountSelect v-model="accountId" :auto-select="false" /></div>
      <div class="w-44"><RegionSelect v-model="region" :auto-select="false" @loaded="(r) => (regions = r)" /></div>
      <Button size="sm" :disabled="!accountId || !region || loading || refreshing" @click="query">
        <RefreshCw class="size-4" :class="refreshing && 'animate-spin'" />
        刷新配额
      </Button>
    </PageHeader>

    <TableLoading :loading="loading" :refreshing="refreshing" :empty="!items.length">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow class="!border-0">
            <TableHead class="rounded-l-lg px-4">配额名称</TableHead>
            <TableHead>账号</TableHead>
            <TableHead>区域</TableHead>
            <TableHead class="rounded-r-lg">值</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody class="**:data-[slot=table-cell]:py-2.5">
          <TableRow v-if="!items.length && !loading">
            <TableCell colspan="4" class="text-muted-foreground py-10 text-center">
              请选择账号和区域后点击刷新按钮查询 vCPU 配额。
            </TableCell>
          </TableRow>
          <TableRow v-for="record in pagedItems" :key="`${record.account_id}:${record.region}:${record.name}`">
            <TableCell class="px-4 font-medium">{{ record.name }}</TableCell>
            <TableCell>{{ record.account_id }}</TableCell>
            <TableCell>{{ regionName(regions, record.region) }}</TableCell>
            <TableCell>
              <Badge :variant="record.error ? 'outline' : 'secondary'">
                {{ record.error ? '查询失败' : record.value }}
              </Badge>
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
