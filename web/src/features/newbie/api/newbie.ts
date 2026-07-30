import http from '@/shared/api/http'
import { encodePath } from '@/shared/lib/path'

export const newbieApi = {
  createTask(data: Record<string, unknown>) {
    return http.post('/newbie/tasks', data)
  },
  getRecentTask() {
    return http.get('/newbie/tasks/recent')
  },
  getTask(id: string) {
    return http.get(`/newbie/tasks/${encodePath(id)}`)
  },
  cancelTask(id: string) {
    return http.post(`/newbie/tasks/${encodePath(id)}/cancel`)
  },
  streamUrl(id: string, afterSeq = 0) {
    return `/api/newbie/tasks/${encodePath(id)}/stream?after_seq=${Math.max(0, Math.trunc(afterSeq))}`
  },
}
