import http from '@/shared/api/http'

export const newbieApi = {
  createTask(data: Record<string, unknown>) {
    return http.post('/newbie/tasks', data)
  },
  getActiveTask() {
    return http.get('/newbie/tasks/active')
  },
  getTask(id: string) {
    return http.get(`/newbie/tasks/${encodeURIComponent(id)}`)
  },
  cancelTask(id: string) {
    return http.post(`/newbie/tasks/${encodeURIComponent(id)}/cancel`)
  },
  streamUrl(id: string) {
    return `/api/newbie/tasks/${encodeURIComponent(id)}/stream`
  },
}
