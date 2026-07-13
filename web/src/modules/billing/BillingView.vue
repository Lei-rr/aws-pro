
<template>
  <a-space direction="vertical" :size="16" style="width:100%">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <a-typography-title :level="3" style="margin:0">账单</a-typography-title>
      <a-space>
        <AccountSelect v-model="accountId" />
        <a-button type="primary" :loading="loading" @click="load(true)">查询年度账单</a-button>
      </a-space>
    </div>
    <a-row :gutter="16">
      <a-col :span="12"><a-statistic title="总费用 (USD)" :value="totalCost" :precision="2" /></a-col>
      <a-col :span="12"><a-statistic title="总抵扣 (USD)" :value="totalCredit" :precision="2" /></a-col>
    </a-row>
    <a-table :data-source="items" :loading="loading" row-key="month" :pagination="false">
      <a-table-column title="月份" data-index="month" />
      <a-table-column title="费用" data-index="cost" />
      <a-table-column title="抵扣" data-index="credit" />
      <a-table-column title="单位" data-index="unit" />
    </a-table>
  </a-space>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import AccountSelect from '@/shared/components/AccountSelect.vue'
import { billingApi } from './api'
import { message } from '@/shared/plugins/antDesignVue'
import { errorMessage } from '@/shared/utils/errors'
const accountId=ref<string>(); const items=ref<any[]>([]); const loading=ref(false)
const totalCost=ref(0); const totalCredit=ref(0)
async function load(refresh=false){
  if(!accountId.value) return message.warning('请选择账号')
  loading.value=true
  try{
    const res=await billingApi.yearly(accountId.value, refresh)
    const data=res.data as any
    items.value=data?.items||[]
    totalCost.value=Number(data?.total_cost||0)
    totalCredit.value=Number(data?.total_credit||0)
  }catch(e){ message.error(errorMessage(e)) } finally{ loading.value=false }
}
</script>
