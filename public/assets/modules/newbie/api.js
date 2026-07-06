import http from '../../shared/utils/request.js';

export const newbieApi = {
    createTask(data) {
        return http.post('/newbie/tasks', data);
    },
    cancelTask(id) {
        return http.post(`/newbie/tasks/${encodeURIComponent(id)}/cancel`);
    },
    streamUrl(id) {
        return `/api/newbie/tasks/${encodeURIComponent(id)}/stream`;
    }
};
