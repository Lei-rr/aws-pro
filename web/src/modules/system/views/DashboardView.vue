
<template>
  <a-space direction="vertical" :size="16" style="width: 100%">
    <a-typography-title :level="3" style="margin: 0">控制台</a-typography-title>
    <a-row :gutter="[16, 16]">
      <a-col v-for="card in cards" :key="card.path" :xs="24" :sm="12" :md="8">
        <a-card hoverable @click="$router.push(card.path)">
          <a-card-meta :title="card.title" :description="card.desc" />
        </a-card>
      </a-col>
    </a-row>
  </a-space>
</template>

<script setup lang="ts">
const cards = [
  { title: 'Lightsail', desc: '跨区域实例运维', path: '/lightsail' },
  { title: 'EC2', desc: '实例创建与生命周期', path: '/ec2' },
  { title: '新手任务', desc: 'Budget / EC2 / Lambda / RDS', path: '/newbie' },
  { title: '区域', desc: '启用与查看区域', path: '/regions' },
  { title: '配额', desc: 'vCPU 配额查询', path: '/quota' },
  { title: '账单', desc: '年度费用与抵扣', path: '/billing' },
  { title: '账号管理', desc: 'AWS Access Key 管理', path: '/accounts' },
]
</script>
