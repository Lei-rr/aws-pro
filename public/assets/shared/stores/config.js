import { configApi } from '../api/config.js';

const { defineStore } = Pinia;

let configPromise = null;

export const useConfigStore = defineStore('config', {
    state: () => ({ config: null, loading: false, error: null }),
    actions: {
        async load(options = {}) {
            if (options.refresh) {
                configPromise = null;
                this.config = null;
            }
            if (this.config) return this.config;

            if (!configPromise) {
                this.loading = true;
                this.error = null;
                configPromise = configApi.all()
                    .then((response) => {
                        this.config = response.data;
                        return this.config;
                    })
                    .catch((error) => {
                        this.error = error;
                        throw error;
                    })
                    .finally(() => {
                        configPromise = null;
                        this.loading = false;
                    });
            }

            return configPromise;
        },
        clear() {
            configPromise = null;
            this.config = null;
            this.error = null;
        }
    }
});

export async function loadConfig(options = {}) {
    return useConfigStore().load(options);
}
