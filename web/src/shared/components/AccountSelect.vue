
<template>
  <a-select
    v-model:value="model"
    style="min-width: 220px"
    :options="options"
    :loading="loading"
    placeholder="选择账号"
    allow-clear
  />
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'

const model = defineModel<string | undefined>({ default: undefined })
const accountsStore = useAccountsStore()
const loading = ref(false)
const options = computed(() => accountsStore.items.map((a) => ({ label: a.remark ? `${a.id} (${a.remark})` : a.id, value: a.id })))
onMounted(async () => {
  loading.value = true
  try { await accountsStore.load() } finally { loading.value = false }
})
</script>
