<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Copy, Plus, RefreshCw } from '@lucide/vue'
import { AccountSelect } from '@/features/accounts'
import { RegionSelect } from '@/features/config'
import CloudInstanceTable from '@/shared/components/CloudInstanceTable.vue'
import InstanceRemarkDialog from '@/shared/components/InstanceRemarkDialog.vue'
import { Ec2ActionSelect } from '@/features/ec2'
import { Ec2IpCell } from '@/features/ec2'
import { CreateEc2Dialog } from '@/features/ec2'
import { PageHeader } from '@/shared/ui/page-header'
import { Button, LoadingButton } from '@/shared/ui/button'
import { ec2Api } from '@/features/ec2'
import { loadConfig, useConfigStore } from '@/features/config'
import { apiList, apiObject } from '@/shared/api/http'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { copyText } from '@/shared/lib/clipboard'
import { useListPage } from '@/shared/lib/use-list-page'
import { createScopeGeneration, type ScopeOwner } from '@/shared/lib/scope-generation'
import { confirmDialog } from '@/shared/ui/confirm'
import { regionName } from '@/shared/lib/format'
import type { AwsInstance } from '@/shared/api/types'

const syncing = ref(false)
const actionLoadingKey = ref('')
const actionLoadingLabel = ref('')
const accountId = ref('')
const region = ref('')
const instances = ref<AwsInstance[]>([])
const syncGeneration = createScopeGeneration()
const actionGeneration = createScopeGeneration()
let activeActionToastId: string | number | undefined

type InstanceActionScope = {
  accountId: string
  region: string
  instanceId: string
  action: string
}

function patchSyncedScope(result: { instances?: AwsInstance[]; account_id?: string; region?: string }) {
  if (!Array.isArray(result.instances) || !result.account_id || !result.region) return
  instances.value = [
    ...instances.value.filter((item) => item.account_id !== result.account_id || item.region !== result.region),
    ...result.instances,
  ]
}

const { loading, refreshing, runLoad, fail } = useListPage({
  pageSizeScope: 'aws-ec2',
  load: async (options = {}) => {
    try {
      // 表格始终显示全部已缓存实例，不按顶部下拉过滤
      const response = await ec2Api.instances({})
      if (options.isLatest && !options.isLatest()) return false
      instances.value = apiList<AwsInstance>(response, ['items'])
    } catch (e) {
      if (options.isLatest && !options.isLatest()) return false
      fail(e)
      return false
    }
  },
})
const createOpen = ref(false)
const remarkOpen = ref(false)
const remarkSaving = ref(false)
// 备注弹窗代际：关闭时 invalidate，旧保存响应只认自己 generation + 实例 identity，避免同 scope 关闭-重开 ABA
const remarkGeneration = createScopeGeneration()
const remarkForm = reactive({
  account_id: '',
  region: '',
  instance_id: '',
  name: '',
  remark: '',
})

const configStore = useConfigStore()
const regions = computed(
  () => (configStore.config?.ec2_regions || configStore.config?.regions || {}) as Record<string, string>
)
const busy = computed(() => loading.value || syncing.value || !!actionLoadingKey.value)

watch([accountId, region], () => {
  syncGeneration.invalidate()
  actionGeneration.invalidate()
  if (activeActionToastId !== undefined) toast.dismiss(activeActionToastId)
  activeActionToastId = undefined
  syncing.value = false
  actionLoadingKey.value = ''
  actionLoadingLabel.value = ''
  createOpen.value = false
  remarkOpen.value = false
  remarkSaving.value = false
  // 不再按下拉过滤表格，保持当前全部实例显示
})

function rowKey(row: AwsInstance) {
  return `${row.account_id}:${row.region}:${row.id}`
}

function isRowActionBusy(row: AwsInstance) {
  return actionLoadingKey.value.startsWith(`${row.id}:`)
}

async function syncScope(aid: string, reg: string) {
  return ec2Api.sync({ account_id: aid, region: reg })
}

async function sync() {
  if (!accountId.value || !region.value) {
    toast.warning('请选择账号和区域')
    return
  }
  if (syncing.value) {
    toast.warning('已有同步任务正在进行')
    return
  }
  const owner = syncGeneration.claim({ accountId: accountId.value, region: region.value })
  const { accountId: scopeAccountId, region: scopeRegion } = owner.value
  syncing.value = true
  try {
    const result = apiObject(await syncScope(scopeAccountId, scopeRegion)) as {
      count?: number
      instances?: AwsInstance[]
      account_id?: string
      region?: string
    }
    if (!owner.active() || scopeAccountId !== accountId.value || scopeRegion !== region.value) return
    patchSyncedScope(result)
    toast.success(`同步完成，共 ${result.count ?? 0} 台 EC2`)
  } catch (e) {
    if (!owner.active() || scopeAccountId !== accountId.value || scopeRegion !== region.value) return
    toast.error(errorMessage(e, '同步 EC2 失败'))
  } finally {
    if (owner.active()) syncing.value = false
  }
}

async function onCreated() {
  await runLoad({ silent: true })
}

const ACTION_NAMES: Record<string, string> = {
  allocate_static_ip: '获取静态 IP',
  release_static_ip: '释放静态 IP',
  start: '启动',
  stop: '停止',
  reboot: '重启',
  terminate: '终止',
  open_ports: '全端口',
}
const ACTION_RISKS: Record<string, string> = {
  allocate_static_ip: '获取静态 IP 会创建并绑定新的 Elastic IP，请确认当前实例需要固定公网 IPv4。',
  release_static_ip: '释放静态 IP 后该 Elastic IP 将解绑并释放。',
  start: '启动实例会恢复运行并可能产生费用，请确认需要启动。',
  stop: '停止实例会中断当前服务，请确认业务可以暂停。',
  reboot: '重启实例会造成短暂不可用，请确认可以中断。',
  terminate: '终止实例不可恢复，已绑定的 Elastic IP 会一并释放，请确认数据已备份。',
  open_ports: '全端口会对实例安全组开放 IPv4/IPv6 所有端口，请确认这是你想要的操作。',
}

async function operate(row: AwsInstance, action: string) {
  if (action === 'remark') {
    openRemark(row)
    return
  }
  if (syncing.value || actionLoadingKey.value) {
    toast.warning(syncing.value ? '已有同步任务正在进行' : '已有 EC2 操作正在进行')
    return
  }
  const owner = actionGeneration.claim({
    accountId: String(row.account_id || ''),
    region: String(row.region || ''),
    instanceId: String(row.id || ''),
    action,
  })
  const name = ACTION_NAMES[action] || action
  const risk = ACTION_RISKS[action] || ''
  const ok = await confirmDialog({
    title: `确认${name}`,
    description: `确定对 ${row.name || row.id} 执行“${name}”？\n${risk}`,
    confirmText: '确认',
    cancelText: '取消',
    destructive: ['terminate', 'open_ports', 'release_static_ip'].includes(action),
  })
  if (
    !ok ||
    !owner.active() ||
    String(row.account_id) !== owner.value.accountId ||
    String(row.region) !== owner.value.region ||
    String(row.id) !== owner.value.instanceId ||
    action !== owner.value.action
  )
    return
  await runAction(row, action, owner)
}

async function syncAfterAction(owner: ScopeOwner<InstanceActionScope>) {
  const { accountId: scopeAccountId, region: targetRegion } = owner.value
  try {
    const result = apiObject(await syncScope(scopeAccountId, targetRegion)) as {
      instances?: AwsInstance[]
      account_id?: string
      region?: string
    }
    if (!owner.active()) return
    patchSyncedScope(result)
  } catch (error) {
    if (!owner.active()) return
    toast.warning(errorMessage(error, '操作已提交，但同步列表失败'))
  }
}

async function runAction(row: AwsInstance, action: string, owner: ScopeOwner<InstanceActionScope>) {
  const key = `${row.id}:${action}`
  if (actionLoadingKey.value) {
    toast.warning('已有 EC2 操作正在进行')
    return
  }
  const name = ACTION_NAMES[action] || action
  const target = String(row.name || row.id || '')
  actionLoadingKey.value = key
  actionLoadingLabel.value = `${name}中`
  const loadingToastId = toast.loading(`正在${name} ${target}…`)
  activeActionToastId = loadingToastId
  try {
    const response = await ec2Api.action({
      instance_id: row.id,
      account_id: row.account_id,
      region: row.region,
      action,
      confirm: action,
    })
    if (!owner.active()) return
    toast.success((apiObject(response) as { message?: string }).message || `${name}已提交`)
    if (action === 'terminate') {
      instances.value = instances.value.filter((item) => rowKey(item) !== rowKey(row))
    }
    await syncAfterAction(owner)
  } catch (e) {
    if (owner.active()) toast.error(errorMessage(e, `${name}失败`))
  } finally {
    toast.dismiss(loadingToastId)
    if (activeActionToastId === loadingToastId) activeActionToastId = undefined
    if (owner.active()) {
      actionLoadingKey.value = ''
      actionLoadingLabel.value = ''
    }
  }
}

function openRemark(row: AwsInstance) {
  remarkGeneration.invalidate()
  remarkForm.account_id = String(row.account_id || '')
  remarkForm.region = String(row.region || '')
  remarkForm.instance_id = String(row.id || '')
  remarkForm.name = String(row.name || row.id || '')
  remarkForm.remark = String(row.remark || '')
  remarkOpen.value = true
}

watch(remarkOpen, (v) => {
  if (!v) {
    remarkGeneration.invalidate()
    remarkSaving.value = false
  }
})

async function saveRemark() {
  if (remarkSaving.value) return
  const owner = remarkGeneration.claim()
  const ownerAccountId = remarkForm.account_id
  const ownerRegion = remarkForm.region
  const ownerInstanceId = remarkForm.instance_id
  const remark = remarkForm.remark.trim()
  const ownerKey = `${ownerAccountId}::${ownerRegion}::${ownerInstanceId}`
  if (!remarkOpen.value || ownerKey !== `${remarkForm.account_id}::${remarkForm.region}::${remarkForm.instance_id}`)
    return
  remarkSaving.value = true
  try {
    const response = await ec2Api.updateRemark({
      account_id: ownerAccountId,
      region: ownerRegion,
      instance_id: ownerInstanceId,
      remark,
    })
    if (
      !owner.active() ||
      !remarkOpen.value ||
      ownerKey !== `${remarkForm.account_id}::${remarkForm.region}::${remarkForm.instance_id}`
    )
      return
    const updated = apiObject(response) as AwsInstance
    instances.value = instances.value.map((item) => {
      if (item.account_id === updated.account_id && item.region === updated.region && item.id === updated.id) {
        return updated
      }
      return item
    })
    remarkOpen.value = false
    toast.success('备注已保存')
  } catch (e) {
    if (owner.active() && ownerKey === `${remarkForm.account_id}::${remarkForm.region}::${remarkForm.instance_id}`)
      toast.error(errorMessage(e, '备注保存失败'))
  } finally {
    if (owner.active() && ownerKey === `${remarkForm.account_id}::${remarkForm.region}::${remarkForm.instance_id}`)
      remarkSaving.value = false
  }
}

async function copyInstanceList() {
  const lines = instances.value
    .map((row) => {
      const ip = row.public_ipv4 || row.public_ip || row.static_ip || ''
      return ip ? `${ip} | root | pass | ${regionName(regions.value, row.region)} | ${row.account_id}` : ''
    })
    .filter(Boolean)
  if (!lines.length) {
    toast.warning('没有可复制的实例 IP')
    return
  }
  await copyText(lines.join('\r\n'))
}

function openCreate() {
  if (!accountId.value || !region.value) {
    toast.warning('请选择账号和区域')
    return
  }
  createOpen.value = true
}

onMounted(async () => {
  try {
    await loadConfig()
  } catch (e) {
    toast.error(errorMessage(e, '加载 EC2 配置失败'))
  }
  await runLoad()
})
onBeforeUnmount(() => {
  syncGeneration.invalidate()
  actionGeneration.invalidate()
  if (activeActionToastId !== undefined) toast.dismiss(activeActionToastId)
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4">
    <PageHeader title="EC2" description="实例列表、同步、创建与运维操作">
      <div class="w-44"><AccountSelect v-model="accountId" :disabled="syncing || !!actionLoadingKey" /></div>
      <div class="w-48">
        <RegionSelect v-model="region" source="ec2_regions" :disabled="syncing || !!actionLoadingKey" />
      </div>
      <Button size="sm" variant="outline" :disabled="busy" @click="copyInstanceList">
        <Copy class="size-4" />
        一键复制
      </Button>
      <Button size="sm" variant="outline" :disabled="busy" @click="openCreate">
        <Plus class="size-4" />
        创建
      </Button>
      <LoadingButton size="sm" :disabled="busy || !accountId || !region" :loading="syncing" @click="sync">
        <RefreshCw class="size-4" />
        同步
      </LoadingButton>
    </PageHeader>

    <CloudInstanceTable
      :loading="loading"
      :refreshing="refreshing"
      :instances="instances"
      :regions="regions"
      package-key="instance_type"
      page-size-scope="aws-ec2"
      :row-key="rowKey"
      :row-busy="isRowActionBusy"
      :state-labels="{ running: '运行中', stopped: '已停止', pending: '处理中', terminated: '已终止' }"
      empty-text="暂无 EC2 实例，请选择账号和区域后同步。"
      @operate="operate"
      @remark="openRemark"
    >
      <template #ip="{ record }">
        <Ec2IpCell :row="record" />
      </template>
      <template #actions="{ record }">
        <Ec2ActionSelect
          :row="record"
          :busy="isRowActionBusy(record)"
          :busy-label="isRowActionBusy(record) ? actionLoadingLabel : ''"
          @operate="operate"
        />
      </template>
    </CloudInstanceTable>

    <CreateEc2Dialog
      v-model:open="createOpen"
      :account-id="accountId"
      :region="region"
      :regions="regions"
      @created="onCreated"
    />
    <InstanceRemarkDialog
      v-model:open="remarkOpen"
      :saving="remarkSaving"
      :form="remarkForm"
      @update:remark="remarkForm.remark = $event"
      @save="saveRemark"
    />
  </div>
</template>
