
<template>
  <a-space direction="vertical" :size="16" style="width:100%">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <a-typography-title :level="3" style="margin:0">区域</a-typography-title>
      <a-space>
        <AccountSelect v-model="accountId" />
        <a-button type="primary" :loading="loading" @click="load(true)">刷新</a-button>
      </a-space>
    </div>
    <a-table :data-source="items" :loading="loading" row-key="region" :pagination="false">
      <a-table-column title="区域" data-index="region" />
      <a-table-column title="名称">
        <template #default="{ record }">{{ regionNames[record.region] || record.region }}</template>
      </a-table-column>
      <a-table-column title="状态" data-index="status" />
    </a-table>
    <a-card title="启用区域" size="small">
      <a-space>
        <RegionSelect v-model="enableRegion" :regions="regionNames" />
        <a-button type="primary" :loading="enabling" @click="enable">启用</a-button>
      </a-space>
    </a-card>
  </a-space>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AccountSelect from '@/shared/components/AccountSelect.vue'
import RegionSelect from '@/shared/components/RegionSelect.vue'
import { regionApi } from './api'
import http from '@/shared/utils/request'
import { message } from '@/shared/plugins/antDesignVue'
import { errorMessage } from '@/shared/utils/errors'

const accountId = ref<string>()
const items = ref<any[]>([])
const loading = ref(false)
const enabling = ref(false)
const enableRegion = ref<string>()
const regionNames = ref<Record<string,string>>({})

async function loadConfig() {
  const res = await http.get<any>('/config')
  regionNames.value = res.data?.regions || {}
}
async function load(refresh=false) {
  if (!accountId.value) return
  loading.value = true
  try {
    const res = await regionApi.list(accountId.value, refresh)
    items.value = (res.data as any)?.items || []
  } catch (e) { message.error(errorMessage(e)) } finally { loading.value = false }
}
async function enable() {
  if (!accountId.value || !enableRegion.value) return message.warning('请选择账号和区域')
  enabling.value = true
  try {
    await regionApi.enable(accountId.value, enableRegion.value)
    message.success('已提交启用')
    await load(true)
  } catch (e) { message.error(errorMessage(e)) } finally { enabling.value = false }
}
onMounted(loadConfig)
</script>
