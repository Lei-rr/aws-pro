import http from '../../shared/utils/request.js';

export const newbieApi = {
    createTask(data) {
        return http.post('/newbie/tasks', data);
    },
    streamUrl(id) {
        return `/api/newbie/tasks/${encodeURIComponent(id)}/stream`;
    }
};
