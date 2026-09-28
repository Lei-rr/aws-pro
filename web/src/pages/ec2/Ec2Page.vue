<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Copy, Plus, RefreshCw } from '@lucide/vue'
import { AccountSelect } from '@/features/accounts'
import { RegionSelect } from '@/features/config'
import CloudInstanceTable from '@/shared/components/CloudInstanceTable.vue'
import InstanceRemarkDialog from '@/shared/components/InstanceRemarkDialog.vue'
import { CreateEc2Dialog, Ec2ActionSelect, Ec2IpCell, ec2Api } from '@/features/ec2'
import { PageHeader } from '@/shared/ui/page-header'
import { Button, LoadingButton } from '@/shared/ui/button'
import { loadConfig, useConfigStore } from '@/features/config'
import { apiObject } from '@/shared/api/http'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { createScopeGeneration } from '@/shared/lib/scope-generation'
import { useInstancePage } from '@/shared/lib/use-instance-page'
import type { AwsInstance } from '@/shared/api/types'

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

function openRemark(row: AwsInstance) {
  remarkGeneration.invalidate()
  remarkForm.account_id = String(row.account_id || '')
  remarkForm.region = String(row.region || '')
  remarkForm.instance_id = String(row.id || '')
  remarkForm.name = String(row.name || row.id || '')
  remarkForm.remark = String(row.remark || '')
  remarkOpen.value = true
}

function rowKey(row: AwsInstance) {
  return `${row.account_id}:${row.region}:${row.id}`
}

const configStore = useConfigStore()
const regions = computed(
  () => (configStore.config?.ec2_regions || configStore.config?.regions || {}) as Record<string, string>
)

const {
  syncing,
  actionLoadingKey,
  actionLoadingLabel,
  accountId,
  region,
  instances,
  loading,
  refreshing,
  busy,
  sync,
  onCreated,
  operate,
  copyInstanceList,
  isRowActionBusy,
} = useInstancePage({
  api: ec2Api,
  pageSizeScope: 'aws-ec2',
  identityField: 'instance_id',
  identityOf: (row) => String(row.id || ''),
  rowKey,
  actionBusyPrefix: (row) => `${row.id}:`,
  actionNames: {
    allocate_static_ip: '获取静态 IP',
    release_static_ip: '释放静态 IP',
    start: '启动',
    stop: '停止',
    reboot: '重启',
    terminate: '终止',
    open_ports: '全端口',
  },
  actionRisks: {
    allocate_static_ip: '获取静态 IP 会创建并绑定新的 Elastic IP，请确认当前实例需要固定公网 IPv4。',
    release_static_ip: '释放静态 IP 后该 Elastic IP 将解绑并释放。',
    start: '启动实例会恢复运行并可能产生费用，请确认需要启动。',
    stop: '停止实例会中断当前服务，请确认业务可以暂停。',
    reboot: '重启实例会造成短暂不可用，请确认可以中断。',
    terminate: '终止实例不可恢复，已绑定的 Elastic IP 会一并释放，请确认数据已备份。',
    open_ports: '全端口会对实例安全组开放 IPv4/IPv6 所有端口，请确认这是你想要的操作。',
  },
  destructive: ['terminate', 'open_ports', 'release_static_ip'],
  removeAction: 'terminate',
  texts: {
    syncDone: (count) => `同步完成，共 ${count} 台 EC2`,
    syncFail: '同步 EC2 失败',
    busyAction: '已有 EC2 操作正在进行',
    busySync: '已有同步任务正在进行',
    configFail: '加载 EC2 配置失败',
  },
  ipOf: (row) => row.public_ipv4 || row.public_ip || row.static_ip || '',
  ensureConfig: loadConfig,
  onRemark: openRemark,
  onScopeReset: () => {
    createOpen.value = false
    remarkOpen.value = false
    remarkSaving.value = false
  },
})

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

function openCreate() {
  if (!accountId.value || !region.value) {
    toast.warning('请选择账号和区域')
    return
  }
  createOpen.value = true
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4">
    <PageHeader title="EC2" description="实例列表、同步、创建与运维操作">
      <div class="w-44"><AccountSelect v-model="accountId" :disabled="syncing || !!actionLoadingKey" /></div>
      <div class="w-48">
        <RegionSelect v-model="region" source="ec2_regions" :disabled="syncing || !!actionLoadingKey" />
      </div>
      <Button size="sm" variant="outline" :disabled="busy" @click="copyInstanceList(regions)">
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
