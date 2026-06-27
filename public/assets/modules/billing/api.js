import http from '../../api/http.js';

export const billingApi = {
    yearly(data, options = {}) {
        return http.post('/billing/yearly', { ...data, ...options });
    }
};
