import { lightsailApi } from './api.js';

const { defineStore } = Pinia;

let instancesPromise = null;

export const useLightsailStore = defineStore('lightsail', {
    state: () => ({ instances: null, loading: false, error: null }),
    actions: {
        async loadInstances(options = {}) {
            if (options.refresh) {
                instancesPromise = null;
                this.instances = null;
            }
            if (this.instances) return this.instances;

            if (!instancesPromise) {
                this.loading = true;
                this.error = null;
                instancesPromise = lightsailApi.instances()
                    .then((response) => {
                        this.instances = response.data.items || response.data || [];
                        return this.instances;
                    })
                    .catch((error) => {
                        this.error = error;
                        throw error;
                    })
                    .finally(() => {
                        instancesPromise = null;
                        this.loading = false;
                    });
            }

            return instancesPromise;
        },
        clear() {
            instancesPromise = null;
            this.instances = null;
            this.error = null;
        }
    }
});

export async function loadInstances(options = {}) {
    return useLightsailStore().loadInstances(options);
}

export function clearInstancesCache() {
    useLightsailStore().clear();
}

window.addEventListener('instances-updated', clearInstancesCache);
