
<template>
  <a-space direction="vertical" :size="16" style="width:100%">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <a-typography-title :level="3" style="margin:0">EC2</a-typography-title>
      <a-space wrap>
        <AccountSelect v-model="accountId" />
        <RegionSelect v-model="region" :regions="regions" />
        <a-button type="primary" :loading="syncing" @click="sync">同步</a-button>
        <a-button @click="openCreate">创建实例</a-button>
        <a-button @click="load">刷新本地</a-button>
      </a-space>
    </div>
    <a-table :data-source="rows" :loading="loading" row-key="id" :pagination="{ pageSize: 20 }">
      <a-table-column title="账号" data-index="account_id" :width="140" />
      <a-table-column title="区域" data-index="region" :width="120" />
      <a-table-column title="ID" data-index="id" />
      <a-table-column title="名称" data-index="name" />
      <a-table-column title="状态" data-index="state" :width="100" />
      <a-table-column title="类型" data-index="instance_type" />
      <a-table-column title="公网 IP" data-index="public_ip" />
      <a-table-column title="静态 IP" data-index="static_ip" />
      <a-table-column title="备注" data-index="remark" />
      <a-table-column title="操作" :width="320">
        <template #default="{ record }">
          <a-space wrap>
            <a-button size="small" @click="doAction(record,'start')">启动</a-button>
            <a-button size="small" @click="doAction(record,'stop')">停止</a-button>
            <a-button size="small" @click="doAction(record,'reboot')">重启</a-button>
            <a-button size="small" @click="doAction(record,'allocate_static_ip')">分配EIP</a-button>
            <a-button size="small" @click="doAction(record,'release_static_ip')">释放EIP</a-button>
            <a-button size="small" @click="doAction(record,'open_ports')">开放端口</a-button>
            <a-button size="small" @click="editRemark(record)">备注</a-button>
            <a-popconfirm title="确认终止？" @confirm="doAction(record,'terminate')">
              <a-button size="small" danger>终止</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table-column>
    </a-table>

    <a-modal v-model:open="createOpen" title="创建 EC2 实例" @ok="create" :confirm-loading="creating" width="640px">
      <a-form layout="vertical">
        <a-form-item label="账号" required><AccountSelect v-model="createForm.account_id" /></a-form-item>
        <a-form-item label="区域" required><RegionSelect v-model="createForm.region" :regions="regions" /></a-form-item>
        <a-form-item label="名称" required><a-input v-model:value="createForm.name" /></a-form-item>
        <a-form-item label="AMI" required>
          <a-select v-model:value="createForm.ami" :options="amiOptions" />
        </a-form-item>
        <a-form-item label="实例类型" required>
          <a-select v-model:value="createForm.instance_type" :options="typeOptions" />
        </a-form-item>
        <a-form-item label="启用 IPv6"><a-switch v-model:checked="createForm.enable_ipv6" /></a-form-item>
        <a-form-item label="root 密码（可选）"><a-input-password v-model:value="createForm.root_password" /></a-form-item>
      </a-form>
    </a-modal>
  </a-space>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AccountSelect from '@/shared/components/AccountSelect.vue'
import RegionSelect from '@/shared/components/RegionSelect.vue'
import { ec2Api } from '../api'
import http from '@/shared/utils/request'
import { message } from '@/shared/plugins/antDesignVue'
import { errorMessage } from '@/shared/utils/errors'

const accountId = ref<string>()
const region = ref<string>()
const regions = ref<Record<string,string>>({})
const items = ref<any[]>([])
const loading = ref(false)
const syncing = ref(false)
const createOpen = ref(false)
const creating = ref(false)
const amiOptions = ref<any[]>([])
const typeOptions = ref<any[]>([])
const createForm = reactive<any>({ account_id:'', region:'', name:'', ami:'ubuntu-24.04', instance_type:'t3.micro', enable_ipv6:false, root_password:'' })
const rows = computed(() => items.value)

async function loadConfig() {
  const res = await http.get<any>('/config')
  regions.value = res.data?.ec2_regions || res.data?.regions || {}
  const opt = await ec2Api.options()
  amiOptions.value = Object.entries((opt.data as any)?.amis || {}).map(([value,label]) => ({ value, label:String(label) }))
  typeOptions.value = Object.entries((opt.data as any)?.instance_types || {}).map(([value,label]) => ({ value, label:String(label) }))
}
async function load() {
  loading.value = true
  try {
    const res = await ec2Api.list({ account_id: accountId.value, region: region.value })
    items.value = (res.data as any)?.items || []
  } catch (e) { message.error(errorMessage(e)) } finally { loading.value = false }
}
async function sync() {
  if (!accountId.value || !region.value) return message.warning('请选择账号和区域')
  syncing.value = true
  try { await ec2Api.sync(accountId.value, region.value); await load(); message.success('同步完成') }
  catch (e) { message.error(errorMessage(e)) } finally { syncing.value = false }
}
function openCreate() {
  createForm.account_id = accountId.value || ''
  createForm.region = region.value || ''
  createOpen.value = true
}
async function create() {
  creating.value = true
  try {
    await ec2Api.create({ ...createForm })
    createOpen.value = false
    accountId.value = createForm.account_id
    region.value = createForm.region
    await load()
    message.success('创建成功')
  } catch (e) { message.error(errorMessage(e)) } finally { creating.value = false }
}
async function doAction(record:any, action:string) {
  try {
    await ec2Api.action(record.id, { account_id: record.account_id, region: record.region, action, confirm: action })
    message.success(`${action} 已提交`)
    await load()
  } catch (e) { message.error(errorMessage(e)) }
}
async function editRemark(record:any) {
  const next = window.prompt('备注', record.remark || '')
  if (next === null) return
  try {
    await ec2Api.remark(record.id, { account_id: record.account_id, region: record.region, remark: next })
    await load()
  } catch (e) { message.error(errorMessage(e)) }
}
onMounted(async () => { await loadConfig(); await load() })
</script>
