import { defineStore } from 'pinia'
import { configApi } from '@/features/config/api/config'
import { apiObject } from '@/shared/api/http'
import type { AppConfig } from '@/shared/types'

let configPromise: Promise<AppConfig> | null = null

export const useConfigStore = defineStore('config', {
  state: () => ({
    config: null as AppConfig | null,
    loading: false,
    error: null as unknown,
  }),
  actions: {
    async load(options: { refresh?: boolean } = {}) {
      if (options.refresh) {
        configPromise = null
        this.config = null
      }
      if (this.config) return this.config
      if (!configPromise) {
        this.loading = true
        this.error = null
        configPromise = configApi
          .all()
          .then((response) => {
            this.config = apiObject<AppConfig>(response)
            return this.config
          })
          .catch((error) => {
            this.error = error
            throw error
          })
          .finally(() => {
            configPromise = null
            this.loading = false
          })
      }
      return configPromise
    },
    clear() {
      configPromise = null
      this.config = null
      this.error = null
    },
  },
})

export async function loadConfig(options: { refresh?: boolean } = {}) {
  return useConfigStore().load(options)
}
