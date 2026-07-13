
<template>
  <a-space direction="vertical" :size="16" style="width: 100%">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <a-typography-title :level="3" style="margin:0">Lightsail</a-typography-title>
      <a-space wrap>
        <AccountSelect v-model="accountId" />
        <RegionSelect v-model="region" :regions="regions" />
        <a-button :loading="syncing" type="primary" @click="sync">同步</a-button>
        <a-button @click="openCreate">创建实例</a-button>
        <a-button @click="load">刷新本地</a-button>
      </a-space>
    </div>
    <a-table :data-source="rows" :loading="loading" row-key="rowKey" :pagination="{ pageSize: 20 }">
      <a-table-column title="账号" data-index="account_id" :width="140" />
      <a-table-column title="区域" data-index="region" :width="120" />
      <a-table-column title="名称" data-index="name" />
      <a-table-column title="状态" data-index="state" :width="100" />
      <a-table-column title="公网 IP" data-index="public_ip" />
      <a-table-column title="静态 IP" data-index="static_ip" />
      <a-table-column title="IPv6" data-index="ipv6" />
      <a-table-column title="备注" data-index="remark" />
      <a-table-column title="操作" :width="320">
        <template #default="{ record }">
          <a-space wrap>
            <a-button size="small" @click="doAction(record, 'start')">启动</a-button>
            <a-button size="small" @click="doAction(record, 'stop')">停止</a-button>
            <a-button size="small" @click="doAction(record, 'reboot')">重启</a-button>
            <a-button size="small" @click="doAction(record, 'allocate_static_ip')">分配静态IP</a-button>
            <a-button size="small" @click="doAction(record, 'release_static_ip')">释放静态IP</a-button>
            <a-button size="small" @click="doAction(record, 'open_ports')">开放端口</a-button>
            <a-button size="small" @click="editRemark(record)">备注</a-button>
            <a-popconfirm title="确认删除？" @confirm="doAction(record, 'delete')">
              <a-button size="small" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table-column>
    </a-table>

    <a-modal v-model:open="createOpen" title="创建 Lightsail 实例" @ok="create" :confirm-loading="creating" width="640px">
      <a-form layout="vertical">
        <a-form-item label="账号" required><AccountSelect v-model="createForm.account_id" /></a-form-item>
        <a-form-item label="区域" required><RegionSelect v-model="createForm.region" :regions="regions" /></a-form-item>
        <a-form-item label="名称" required><a-input v-model:value="createForm.name" /></a-form-item>
        <a-form-item label="可用区" required>
          <a-select v-model:value="createForm.zone" :options="zoneOptions" @dropdownVisibleChange="(o:boolean)=>o && loadOptions()" />
        </a-form-item>
        <a-form-item label="镜像" required>
          <a-select v-model:value="createForm.blueprint" :options="blueprintOptions" />
        </a-form-item>
        <a-form-item label="套餐" required>
          <a-select v-model:value="createForm.bundle" :options="bundleOptions" @dropdownVisibleChange="(o:boolean)=>o && loadOptions()" />
        </a-form-item>
        <a-form-item label="IP 类型">
          <a-select v-model:value="createForm.ip_address_type" :options="[{value:'dualstack',label:'dualstack'},{value:'ipv4',label:'ipv4'},{value:'ipv6',label:'ipv6'}]" />
        </a-form-item>
        <a-form-item label="root 密码（可选）"><a-input-password v-model:value="createForm.root_password" /></a-form-item>
      </a-form>
    </a-modal>
  </a-space>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AccountSelect from '@/shared/components/AccountSelect.vue'
import RegionSelect from '@/shared/components/RegionSelect.vue'
import { lightsailApi } from '../api'
import http from '@/shared/utils/request'
import { message } from '@/shared/plugins/antDesignVue'
import { errorMessage } from '@/shared/utils/errors'

const accountId = ref<string>()
const region = ref<string>()
const regions = ref<Record<string, string>>({})
const items = ref<any[]>([])
const loading = ref(false)
const syncing = ref(false)
const createOpen = ref(false)
const creating = ref(false)
const zoneOptions = ref<any[]>([])
const bundleOptions = ref<any[]>([])
const blueprintOptions = ref<any[]>([])
const createForm = reactive<any>({
  account_id: '', region: '', name: '', zone: '', blueprint: 'ubuntu_24_04', bundle: '', ip_address_type: 'dualstack', root_password: '',
})
const rows = computed(() => items.value.map((i) => ({ ...i, rowKey: `${i.account_id}|${i.region}|${i.name}` })))

async function loadConfig() {
  const res = await http.get<any>('/config')
  regions.value = res.data?.regions || {}
  const bps = res.data?.blueprints || {}
  blueprintOptions.value = Object.entries(bps).map(([value, label]) => ({ value, label: String(label) }))
}
async function load() {
  loading.value = true
  try {
    const res = await lightsailApi.list({ account_id: accountId.value, region: region.value })
    items.value = (res.data as any)?.items || []
  } catch (error) {
    message.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}
async function sync() {
  if (!accountId.value || !region.value) return message.warning('请选择账号和区域')
  syncing.value = true
  try {
    await lightsailApi.sync(accountId.value, region.value)
    await load()
    message.success('同步完成')
  } catch (error) {
    message.error(errorMessage(error))
  } finally {
    syncing.value = false
  }
}
async function loadOptions() {
  const acc = createForm.account_id || accountId.value
  const reg = createForm.region || region.value
  if (!acc || !reg) return
  try {
    const res = await lightsailApi.options(acc, reg)
    zoneOptions.value = ((res.data as any)?.zones || []).map((z: string) => ({ value: z, label: z }))
    const bundles = (res.data as any)?.bundles || {}
    bundleOptions.value = Object.entries(bundles).map(([value, label]) => ({ value, label: String(label) }))
  } catch (error) {
    message.error(errorMessage(error))
  }
}
function openCreate() {
  createForm.account_id = accountId.value || ''
  createForm.region = region.value || ''
  createOpen.value = true
  void loadOptions()
}
async function create() {
  creating.value = true
  try {
    await lightsailApi.create({ ...createForm })
    createOpen.value = false
    accountId.value = createForm.account_id
    region.value = createForm.region
    await load()
    message.success('创建成功')
  } catch (error) {
    message.error(errorMessage(error))
  } finally {
    creating.value = false
  }
}
async function doAction(record: any, action: string) {
  try {
    await lightsailApi.action(record.name, { account_id: record.account_id, region: record.region, action, confirm: action })
    message.success(`${action} 已提交`)
    await load()
  } catch (error) {
    message.error(errorMessage(error))
  }
}
async function editRemark(record: any) {
  const next = window.prompt('备注', record.remark || '')
  if (next === null) return
  try {
    await lightsailApi.remark(record.name, { account_id: record.account_id, region: record.region, remark: next })
    await load()
  } catch (error) {
    message.error(errorMessage(error))
  }
}
onMounted(async () => {
  await loadConfig()
  await load()
})
</script>
