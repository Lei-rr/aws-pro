import http from '../../shared/utils/request.js';

export const ec2Api = {
    instances(params = {}) {
        return http.get('/ec2/instances', { params });
    },
    sync(data) {
        return http.post('/ec2/instances/sync', data);
    },
    createOptions() {
        return http.get('/ec2/create-options');
    },
    create(data) {
        return http.post('/ec2/instances', data);
    },
    action(data) {
        return http.post(`/ec2/instances/${encodeURIComponent(data.instance_id)}/actions`, data);
    }
};
