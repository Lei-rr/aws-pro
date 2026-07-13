import http from '../../shared/utils/request.js';

export const billingApi = {
    yearly(data, options = {}) {
        return http.post('/billing/yearly', { ...data, ...options });
    }
};
