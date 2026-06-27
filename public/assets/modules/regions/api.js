import http, { withRefresh } from '../../api/http.js';

export const regionsApi = {
    list(accountId, options = {}) {
        const params = { account_id: accountId };
        if (options.refresh) params.refresh = 1;
        if (options.cache_only) params.cache_only = 1;
        return http.get('/regions', { params });
    },
    enable(data) {
        return http.post('/regions/enable', data);
    }
};
