<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { RefreshCw, Server, CreditCard, Activity, KeyRound } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { TableLoading } from '@/shared/ui/table'
import { PageHeader } from '@/shared/ui/page-header'
import { loadAccounts, useAccountStore } from '@/features/accounts'
import { loadConfig, useConfigStore } from '@/features/config'
import { lightsailApi } from '@/features/lightsail'
import { ec2Api } from '@/features/ec2'
import { apiList } from '@/shared/api/http'
import { regionName } from '@/shared/lib/format'
import { useListPage } from '@/shared/lib/use-list-page'
import type { AwsInstance } from '@/shared/api/types'

const lightsailInstances = ref<AwsInstance[]>([])
const ec2Instances = ref<AwsInstance[]>([])
const accountStore = useAccountStore()
const configStore = useConfigStore()

const { loading, refreshing, runLoad, onRefresh, fail } = useListPage({
  pageSizeScope: 'aws-dashboard',
  load: async (options = {}) => {
    try {
      const [, , ls, ec2] = await Promise.all([
        loadAccounts({ force: options.refresh }),
        loadConfig({ force: options.refresh }),
        lightsailApi.instances(options.refresh ? { refresh: 'true' } : {}),
        ec2Api.instances(options.refresh ? { refresh: 'true' } : {}),
      ])
      if (options.isLatest && !options.isLatest()) return false
      lightsailInstances.value = apiList<AwsInstance>(ls, ['items'])
      ec2Instances.value = apiList<AwsInstance>(ec2, ['items'])
    } catch (e) {
      if (options.isLatest && !options.isLatest()) return false
      fail(e)
      return false
    }
  },
})

const accounts = computed(() => accountStore.accounts || [])
const instances = computed(() => [...lightsailInstances.value, ...ec2Instances.value])
const regions = computed(() => ({
  ...(configStore.config?.regions || {}),
  ...(configStore.config?.ec2_regions || {}),
}))
const runningCount = computed(() => instances.value.filter((i) => i.state === 'running').length)
const staticIpCount = computed(() => instances.value.filter((i) => !!i.static_ip).length)

const stats = computed(() => [
  { label: 'AWS 账号', value: accounts.value.length, desc: '已配置访问密钥', icon: KeyRound },
  { label: '实例总数', value: instances.value.length, desc: '本地缓存实例', icon: Server },
  { label: '运行中', value: runningCount.value, desc: '当前运行实例', icon: Activity },
  { label: '静态 IP', value: staticIpCount.value, desc: '已绑定静态 IP', icon: CreditCard },
])

type RegionRow = { key: string; label: string; total: number }
type AccountSummary = { key: string; accountId: string; total: number; regions: RegionRow[] }

const accountRegionSummary = computed((): AccountSummary[] => {
  const map = new Map<string, { accountId: string; total: number; regionMap: Map<string, RegionRow> }>()
  for (const account of accounts.value) {
    const id = String(account.id || '')
    if (id) map.set(id, { accountId: id, total: 0, regionMap: new Map() })
  }
  for (const item of instances.value) {
    const accountId = String(item.account_id || '-')
    const region = String(item.region || '-')
    const row = map.get(accountId) || { accountId, total: 0, regionMap: new Map() }
    const regionRow = row.regionMap.get(region) || {
      key: region,
      label: regionName(regions.value, region),
      total: 0,
    }
    row.total += 1
    regionRow.total += 1
    row.regionMap.set(region, regionRow)
    map.set(accountId, row)
  }
  return Array.from(map.values())
    .map((row) => ({
      key: row.accountId,
      accountId: row.accountId,
      total: row.total,
      regions: Array.from(row.regionMap.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.total - a.total || a.accountId.localeCompare(b.accountId))
})

onMounted(() => runLoad())
</script>

<template>
  <div class="flex flex-1 flex-col gap-5">
    <PageHeader title="控制台" description="查看 AWS 账号、实例和区域资源概览。">
      <Button variant="outline" size="sm" :disabled="loading" @click="onRefresh">
        <RefreshCw class="size-4" :class="refreshing && 'animate-spin'" />
        刷新
      </Button>
      <Button size="sm" as-child>
        <RouterLink to="/accounts">账号管理</RouterLink>
      </Button>
    </PageHeader>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div v-for="item in stats" :key="item.label" class="bg-muted/40 rounded-lg px-3 py-3">
        <div class="text-muted-foreground flex items-center gap-1.5 text-xs">
          <component :is="item.icon" class="size-3.5" />
          {{ item.label }}
        </div>
        <div class="mt-1 text-xl font-semibold tabular-nums">{{ item.value }}</div>
        <div class="text-muted-foreground mt-0.5 text-xs">{{ item.desc }}</div>
      </div>
    </div>

    <TableLoading :loading="loading" :refreshing="refreshing" :empty="!accountRegionSummary.length">
      <div>
        <div class="mb-3">
          <h2 class="text-base font-semibold">账号与区域资源分布</h2>
          <p class="text-muted-foreground text-sm">按账号汇总区域数量，并展示每个区域的实例分布。</p>
        </div>
        <div v-if="!accountRegionSummary.length" class="text-muted-foreground py-10 text-center text-sm">
          暂无账号区域资源
        </div>
        <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="record in accountRegionSummary" :key="record.key" class="bg-muted/30 rounded-lg px-3 py-3">
            <div class="mb-2 flex items-center justify-between gap-2">
              <div class="truncate font-medium">{{ record.accountId }}</div>
              <Badge variant="secondary">{{ record.total }} 台</Badge>
            </div>
            <div v-if="record.regions.length" class="space-y-1.5">
              <div
                v-for="region in record.regions"
                :key="region.key"
                class="flex items-center justify-between gap-2 text-sm"
              >
                <span class="text-muted-foreground truncate">{{ region.label }}</span>
                <span class="tabular-nums">{{ region.total }} 台</span>
              </div>
            </div>
            <div v-else class="text-muted-foreground text-sm">暂无区域</div>
          </div>
        </div>
      </div>
    </TableLoading>
  </div>
</template>
