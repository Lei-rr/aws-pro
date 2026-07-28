import http from '@/shared/api/http'
import { encodePath } from '@/shared/lib/path'

export const newbieApi = {
  createTask(data: Record<string, unknown>) {
    return http.post('/newbie/tasks', data)
  },
  getActiveTask() {
    return http.get('/newbie/tasks/active')
  },
  getTask(id: string) {
    return http.get(`/newbie/tasks/${encodePath(id)}`)
  },
  cancelTask(id: string) {
    return http.post(`/newbie/tasks/${encodePath(id)}/cancel`)
  },
  streamUrl(id: string) {
    return `/api/newbie/tasks/${encodePath(id)}/stream`
  },
}
