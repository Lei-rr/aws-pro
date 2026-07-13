
import http from '@/shared/utils/request'

export interface SessionState {
  authenticated: boolean
  username: string | null
}

export const authApi = {
  me: () => http.get<SessionState>('/session'),
  login: (username: string, password: string) => http.post<SessionState>('/session', { username, password }),
  logout: () => http.delete('/session'),
}
