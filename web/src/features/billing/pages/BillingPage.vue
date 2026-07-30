<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { PageHeader } from '@/shared/ui/page-header'
import { Button } from '@/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableLoading } from '@/shared/ui/table'
import { TablePagination } from '@/shared/ui/pagination'
import AccountSelect from '@/shared/components/AccountSelect.vue'
import { billingApi } from '@/features/billing/api/billing'
import { apiObject } from '@/shared/api/http'
import { toast } from '@/shared/lib/toast'
import { useListPage } from '@/shared/lib/use-list-page'
import { useLocalPagination } from '@/shared/lib/use-local-pagination'

type BillRow = {
  month: string
  account_id?: string
  cost?: number
  credit?: number
  unit?: string
  summary?: boolean
  months?: number
}

const accountId = ref('')
const bills = ref<BillRow[]>([])
const summary = ref({ total_cost: 0, total_credit: 0 })

const { loading, refreshing, pageSize, runLoad, onRefresh, onPageSizeChange, fail } = useListPage({
  pageSizeScope: 'aws-billing',
  load: async (options = {}) => {
    if (!accountId.value) return
    try {
      const response = await billingApi.yearly(
        { account_id: accountId.value },
        { refresh: options.refresh },
      )
      if (options.isLatest && !options.isLatest()) return false
      const billing = apiObject(response) as {
        items?: BillRow[]
        total_cost?: number
        total_credit?: number
      }
      bills.value = billing.items || []
      summary.value = {
        total_cost: billing.total_cost || 0,
        total_credit: billing.total_credit || 0,
      }
    } catch (e) {
      if (options.isLatest && !options.isLatest()) return false
      fail(e)
      return false
    }
  },
})

const tableRows = computed(() => {
  if (!bills.value.length) return [] as BillRow[]
  return [
    {
      month: '__summary__',
      account_id: '合计',
      cost: summary.value.total_cost,
      credit: summary.value.total_credit,
      unit: 'USD',
      months: bills.value.length,
      summary: true,
    },
    ...bills.value,
  ]
})
const { page, total, pagedItems: pagedRows, resetPage } = useLocalPagination(tableRows, pageSize)

function money(value: unknown) {
  const n = Number(value || 0)
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function query() {
  if (!accountId.value) {
    toast.warning('请选择账号')
    return
  }
  await onRefresh()
}

watch(accountId, () => {
  resetPage()
  bills.value = []
  summary.value = { total_cost: 0, total_credit: 0 }
  if (accountId.value) void runLoad()
})

onMounted(() => {
  if (accountId.value) void runLoad()
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4">
    <PageHeader title="账单概览" description="查询最近 12 个完整月和当月费用。">
      <div class="w-48"><AccountSelect v-model="accountId" /></div>
      <Button size="sm" :disabled="!accountId || loading || refreshing" @click="query">
        <RefreshCw class="size-4" :class="refreshing && 'animate-spin'" />
        刷新账单
      </Button>
    </PageHeader>

    <TableLoading :loading="loading" :empty="!tableRows.length">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow class="!border-0">
            <TableHead class="rounded-l-lg px-4">账号</TableHead>
            <TableHead>月份</TableHead>
            <TableHead>费用</TableHead>
            <TableHead>抵扣</TableHead>
            <TableHead class="rounded-r-lg">币种</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody class="**:data-[slot=table-cell]:py-2.5">
          <TableRow v-if="!tableRows.length && !loading">
            <TableCell colspan="5" class="text-muted-foreground py-10 text-center">
              请选择账号后点击刷新按钮查询账单。
            </TableCell>
          </TableRow>
          <TableRow v-for="record in pagedRows" :key="record.month + String(record.account_id)" :class="record.summary && 'bg-muted/30 font-medium'">
            <TableCell class="px-4">{{ record.account_id }}</TableCell>
            <TableCell>{{ record.summary ? `${record.months} 个月` : record.month }}</TableCell>
            <TableCell class="tabular-nums">$ {{ money(record.cost) }}</TableCell>
            <TableCell class="tabular-nums">$ {{ money(record.credit) }}</TableCell>
            <TableCell>{{ record.unit || 'USD' }}</TableCell>
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
