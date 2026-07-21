<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Copy, Plus, RefreshCw } from '@lucide/vue'
import { AccountSelect, RegionSelect } from '@/shared/components'
import CloudInstanceTable from '@/shared/components/CloudInstanceTable.vue'
import InstanceRemarkDialog from '@/shared/components/InstanceRemarkDialog.vue'
import Ec2ActionSelect from '@/features/ec2/components/Ec2ActionSelect.vue'
import Ec2IpCell from '@/features/ec2/components/Ec2IpCell.vue'
import CreateEc2Dialog from '@/features/ec2/components/CreateEc2Dialog.vue'
import { PageHeader } from '@/shared/ui/page-header'
import { Button } from '@/shared/ui/button'
import { ec2Api } from '@/features/ec2/api/ec2'
import { loadConfig, useConfigStore } from '@/features/config/stores/config'
import { apiList, apiObject } from '@/shared/api/http'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { copyText } from '@/shared/lib/clipboard'
import { withMinLoading } from '@/shared/lib/loading'
import { confirmDialog } from '@/shared/ui/confirm'
import { regionName } from '@/shared/lib/format'
import type { AwsInstance } from '@/shared/types'

const loading = ref(false)
const syncing = ref(false)
const actionLoadingKey = ref('')
const accountId = ref('')
const region = ref('')
const instances = ref<AwsInstance[]>([])
const loadToken = ref(0)
const createOpen = ref(false)
const remarkOpen = ref(false)
const remarkSaving = ref(false)
const remarkForm = reactive({
  account_id: '',
  region: '',
  instance_id: '',
  name: '',
  remark: '',
})

const configStore = useConfigStore()
const regions = computed(
  () => (configStore.config?.ec2_regions || configStore.config?.regions || {}) as Record<string, string>,
)
const busy = computed(() => loading.value || syncing.value || !!actionLoadingKey.value)

function rowKey(row: AwsInstance) {
  return `${row.account_id}:${row.region}:${row.id}`
}

async function loadInstances() {
  const token = ++loadToken.value
  await withMinLoading(loading, async () => {
    try {
      const response = await ec2Api.instances()
      if (token !== loadToken.value) return
      instances.value = apiList<AwsInstance>(response, ['items'])
    } catch (e) {
      if (token !== loadToken.value) return
      instances.value = []
      toast.error(errorMessage(e, '加载 EC2 实例失败'))
    }
  })
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
  syncing.value = true
  try {
    const result = apiObject(await syncScope(accountId.value, region.value)) as { count?: number }
    toast.success(`同步完成，共 ${result.count ?? 0} 台 EC2`)
    await loadInstances()
  } catch (e) {
    toast.error(errorMessage(e, '同步 EC2 失败'))
  } finally {
    syncing.value = false
  }
}

async function onCreated() {
  try {
    await syncScope(accountId.value, region.value)
  } catch (e) {
    toast.warning(errorMessage(e, '创建成功，但同步列表失败'))
  }
  await loadInstances()
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
  if (syncing.value) {
    toast.warning('已有同步任务正在进行')
    return
  }
  const name = ACTION_NAMES[action] || action
  const risk = ACTION_RISKS[action] || ''
  const ok = await confirmDialog({
    title: `确认${name}`,
    description: `确定对 ${row.name || row.id} 执行“${name}”？\n${risk}`,
    confirmText: '确认',
    cancelText: '取消',
    destructive: ['terminate', 'open_ports', 'release_static_ip'].includes(action),
  })
  if (!ok) return
  await runAction(row, action)
}

async function runAction(row: AwsInstance, action: string) {
  const key = `${row.id}:${action}`
  if (actionLoadingKey.value) {
    toast.warning('已有 EC2 操作正在进行')
    return
  }
  actionLoadingKey.value = key
  try {
    const response = await ec2Api.action({
      instance_id: row.id,
      account_id: row.account_id,
      region: row.region,
      action,
      confirm: action,
    })
    toast.success((apiObject(response) as { message?: string }).message || '命令已提交')
    await syncScope(String(row.account_id), String(row.region))
    await loadInstances()
  } catch (e) {
    toast.error(errorMessage(e, 'EC2 操作失败'))
  } finally {
    actionLoadingKey.value = ''
  }
}

function openRemark(row: AwsInstance) {
  remarkForm.account_id = String(row.account_id || '')
  remarkForm.region = String(row.region || '')
  remarkForm.instance_id = String(row.id || '')
  remarkForm.name = String(row.name || row.id || '')
  remarkForm.remark = String(row.remark || '')
  remarkOpen.value = true
}

async function saveRemark() {
  remarkForm.remark = remarkForm.remark.trim()
  remarkSaving.value = true
  try {
    const response = await ec2Api.updateRemark({
      account_id: remarkForm.account_id,
      region: remarkForm.region,
      instance_id: remarkForm.instance_id,
      remark: remarkForm.remark,
    })
    const updated = apiObject(response) as AwsInstance
    instances.value = instances.value.map((item) => {
      if (
        item.account_id === updated.account_id &&
        item.region === updated.region &&
        item.id === updated.id
      ) {
        return updated
      }
      return item
    })
    remarkOpen.value = false
    toast.success('备注已保存')
  } catch (e) {
    toast.error(errorMessage(e, '备注保存失败'))
  } finally {
    remarkSaving.value = false
  }
}

async function copyInstanceList() {
  const lines = instances.value
    .map((row) => {
      const ip = (row as any).public_ipv4 || row.public_ip || row.static_ip || ''
      return ip
        ? `${ip} | root | pass | ${regionName(regions.value, row.region)} | ${row.account_id}`
        : ''
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
  await loadInstances()
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4">
    <PageHeader title="EC2" description="实例列表、同步、创建与运维操作">
      <div class="w-44"><AccountSelect v-model="accountId" /></div>
      <div class="w-48"><RegionSelect v-model="region" source="ec2_regions" /></div>
      <Button size="sm" variant="outline" :disabled="busy" @click="copyInstanceList">
        <Copy class="size-4" />
        一键复制
      </Button>
      <Button size="sm" variant="outline" :disabled="busy" @click="openCreate">
        <Plus class="size-4" />
        创建
      </Button>
      <Button size="sm" :disabled="busy || !accountId || !region" :loading="syncing" @click="sync">
        <RefreshCw class="size-4" :class="syncing && 'animate-spin'" />
        同步
      </Button>
    </PageHeader>

    <CloudInstanceTable
      :loading="loading"
      :instances="instances"
      :regions="regions"
      package-key="instance_type"
      :row-key="rowKey"
      :state-labels="{ running: '运行中', stopped: '已停止', pending: '处理中', terminated: '已终止' }"
      empty-text="暂无 EC2 实例，请选择账号和区域后同步。"
      @operate="operate"
      @remark="openRemark"
    >
      <template #ip="{ record }">
        <Ec2IpCell :row="record" />
      </template>
      <template #actions="{ record }">
        <Ec2ActionSelect :row="record" @operate="operate" />
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
      @save="saveRemark"
    />
  </div>
</template>
