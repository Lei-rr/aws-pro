import http from '../../../shared/utils/request.js';

export const configApi = {
    all() {
        return http.get('/config');
    }
};
