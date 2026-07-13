import http from '../../shared/utils/request.js';

export const lightsailApi = {
    instances(params = {}) {
        return http.get('/lightsail/instances', { params });
    },
    sync(data) {
        return http.post('/lightsail/instances/sync', data);
    },
    createOptions(params) {
        return http.get('/lightsail/create-options', { params });
    },
    create(data) {
        return http.post('/lightsail/instances', data);
    },
    updateRemark(data) {
        return http.put(`/lightsail/instances/${encodeURIComponent(data.instance_name)}/remark`, data);
    },
    action(data) {
        return http.post(`/lightsail/instances/${encodeURIComponent(data.instance_name)}/actions`, data);
    }
};
