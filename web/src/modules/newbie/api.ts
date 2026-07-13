
import http from '@/shared/utils/request'
export const newbieApi = {
  create: (account_id: string, step = 'all') => http.post('/newbie/tasks', { account_id, step }),
  show: (task: string) => http.get(`/newbie/tasks/${encodeURIComponent(task)}`),
  cancel: (task: string) => http.post(`/newbie/tasks/${encodeURIComponent(task)}/cancel`),
  streamUrl: (task: string) => `/api/newbie/tasks/${encodeURIComponent(task)}/stream`,
}
