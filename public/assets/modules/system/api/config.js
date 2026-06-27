import http from '../../../api/http.js';

export const configApi = {
    all() {
        return http.get('/config');
    }
};
