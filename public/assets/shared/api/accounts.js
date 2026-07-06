import http from '../utils/request.js';

export const accountApi = {
    list() {
        return http.get('/accounts');
    },
    save(account) {
        if (account.original_id) {
            return http.put(`/accounts/${encodeURIComponent(account.original_id)}`, account);
        }
        return http.post('/accounts', account);
    },
    remove(id) {
        return http.delete(`/accounts/${encodeURIComponent(id)}`);
    }
};
