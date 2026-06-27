import http from '../../api/http.js';

export const quotaApi = {
    vcpu(data, options = {}) {
        return http.post('/quotas/vcpu', { ...data, ...options });
    }
};
