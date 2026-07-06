import http from '../utils/request.js';

export const instanceApi = {
    lightsail(params = {}) {
        return http.get('/lightsail/instances', { params });
    },
    ec2(params = {}) {
        return http.get('/ec2/instances', { params });
    }
};
