import { defineStore } from 'pinia'
import { configApi } from '@/features/config/api/config'
import { apiObject } from '@/shared/api/http'
import type { AppConfig } from '@/shared/types'

let configPromise: Promise<AppConfig | null> | null = null
let configRequestToken = 0

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
        configRequestToken += 1
      }
      if (!options.refresh && this.config) return this.config
      if (!configPromise) {
        const token = ++configRequestToken
        this.loading = true
        this.error = null
        const promise = configApi
          .all()
          .then((response) => {
            if (token !== configRequestToken) return this.config
            this.config = apiObject<AppConfig>(response)
            return this.config
          })
          .catch((error) => {
            if (token !== configRequestToken) return this.config
            this.error = error
            throw error
          })
          .finally(() => {
            if (token !== configRequestToken) return
            if (configPromise === promise) configPromise = null
            this.loading = false
          })
        configPromise = promise
      }
      return configPromise
    },
    clear() {
      configPromise = null
      configRequestToken += 1
      this.config = null
      this.error = null
      this.loading = false
    },
  },
})

export async function loadConfig(options: { refresh?: boolean } = {}) {
  return useConfigStore().load(options)
}
