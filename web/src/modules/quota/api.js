import http from '../../shared/utils/request.js';

export const quotaApi = {
    vcpu(data, options = {}) {
        return http.post('/quotas/vcpu', { ...data, ...options });
    }
};
