
<template>
  <a-space direction="vertical" :size="16" style="width:100%">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <a-typography-title :level="3" style="margin:0">配额</a-typography-title>
      <a-space>
        <AccountSelect v-model="accountId" />
        <RegionSelect v-model="region" :regions="regions" />
        <a-button type="primary" :loading="loading" @click="load(true)">查询</a-button>
      </a-space>
    </div>
    <a-table :data-source="items" :loading="loading" row-key="name" :pagination="false">
      <a-table-column title="名称" data-index="name" />
      <a-table-column title="区域" data-index="region" />
      <a-table-column title="值" data-index="value" />
    </a-table>
  </a-space>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AccountSelect from '@/shared/components/AccountSelect.vue'
import RegionSelect from '@/shared/components/RegionSelect.vue'
import { quotaApi } from './api'
import http from '@/shared/utils/request'
import { message } from '@/shared/plugins/antDesignVue'
import { errorMessage } from '@/shared/utils/errors'
const accountId=ref<string>(); const region=ref<string>(); const regions=ref<Record<string,string>>({})
const items=ref<any[]>([]); const loading=ref(false)
async function loadConfig(){ const res=await http.get<any>('/config'); regions.value=res.data?.ec2_regions||res.data?.regions||{} }
async function load(refresh=false){
  if(!accountId.value||!region.value) return message.warning('请选择账号和区域')
  loading.value=true
  try{ const res=await quotaApi.vcpu(accountId.value, region.value, refresh); items.value=(res.data as any)?.items||[] }
  catch(e){ message.error(errorMessage(e)) } finally{ loading.value=false }
}
onMounted(loadConfig)
</script>
