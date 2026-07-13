
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { accountApi } from '@/modules/accounts/api'
import type { AwsAccount } from '@/types'

export const useAccountsStore = defineStore('accounts', () => {
  const items = ref<AwsAccount[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  async function load(force = false) {
    if (loaded.value && !force) return items.value
    loading.value = true
    try {
      const response = await accountApi.list()
      items.value = (response.data as AwsAccount[]) || []
      loaded.value = true
      return items.value
    } finally {
      loading.value = false
    }
  }

  function invalidate() {
    loaded.value = false
  }

  return { items, loaded, loading, load, invalidate }
})
