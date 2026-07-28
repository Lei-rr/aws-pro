<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { PageHeader } from '@/shared/ui/page-header'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableLoading } from '@/shared/ui/table'
import AccountSelect from '@/shared/components/AccountSelect.vue'
import RegionSelect from '@/shared/components/RegionSelect.vue'
import { quotaApi } from '@/features/quota/api/quota'
import { apiList } from '@/shared/api/http'
import { regionName } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { useListPage } from '@/shared/lib/use-list-page'

type QuotaRow = { name: string; account_id?: string; region?: string; value?: unknown; error?: boolean }

const accountId = ref('')
const region = ref('')
const regions = ref<Record<string, string>>({})
const items = ref<QuotaRow[]>([])
const loadToken = ref(0)

const { loading, refreshing, runLoad, onRefresh, fail } = useListPage({
  pageSizeScope: 'aws-quota',
  load: async (options = {}) => {
    if (!accountId.value || !region.value) return
    const token = ++loadToken.value
    try {
      const response = await quotaApi.vcpu(
        { account_id: accountId.value, region: region.value },
        { refresh: options.refresh },
      )
      if (token !== loadToken.value) return
      items.value = apiList<QuotaRow>(response, ['items'])
    } catch (e) {
      if (token !== loadToken.value) return
      fail(e)
    }
  },
})

async function loadFromCache() {
  if (!accountId.value || !region.value) return
  const token = ++loadToken.value
  try {
    const response = await quotaApi.vcpu({ account_id: accountId.value, region: region.value }, { cache_only: true })
    if (token !== loadToken.value) return
    const list = apiList<QuotaRow>(response, ['items'])
    if (list.length) items.value = list
  } catch { /* silent */ }
}

async function query() {
  if (!accountId.value || !region.value) {
    toast.warning('请选择账号和区域')
    return
  }
  await onRefresh()
}

watch([accountId, region], () => {
  items.value = []
  if (accountId.value && region.value) void loadFromCache()
})

onMounted(() => {
  if (accountId.value && region.value) void loadFromCache()
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4">
    <PageHeader title="vCPU 配额" description="按账号和区域查询 Lightsail 相关服务配额。">
      <div class="w-44"><AccountSelect v-model="accountId" /></div>
      <div class="w-44"><RegionSelect v-model="region" @loaded="(r) => (regions = r)" /></div>
      <Button size="sm" :disabled="!accountId || !region || loading || refreshing" @click="query">
        <RefreshCw class="size-4" :class="refreshing && 'animate-spin'" />
        刷新配额
      </Button>
    </PageHeader>

    <TableLoading :loading="loading" :empty="!items.length">
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
          <TableRow v-for="record in items" :key="`${record.account_id}:${record.region}:${record.name}`">
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
    </TableLoading>
  </div>
</template>
