const CODE_HINTS: Record<string, string> = {
  validation_failed: '参数不完整或格式不正确',
  unauthenticated: '登录已失效，请重新登录',
  invalid_credentials: '用户名或密码错误',
  account_not_found: 'AWS 账号不存在',
  account_already_exists: 'AWS 账号已存在',
  aws_credentials_invalid: 'AWS 密钥无效或已失效，请到「账号管理」重新填写',
  aws_request_failed: 'AWS 请求失败，请稍后重试',
  forbidden: '权限不足，请检查 IAM 策略',
  newbie_task_running: '已有新手任务正在执行',
  newbie_task_not_found: '新手任务不存在',
  newbie_task_cancel_invalid: '当前任务状态不可终止',
}

export function errorMessage(error: unknown, fallback = '请求失败'): string {
  if (typeof error === 'string' && error.trim()) return error

  const err = error as {
    message?: string
    code?: string
    status?: number
    details?: unknown
    response?: { data?: { message?: string; code?: string; details?: unknown }; status?: number }
  }

  const code = String(err?.code || err?.response?.data?.code || '').trim()
  const serverMessage = String(err?.response?.data?.message || err?.message || '').trim()
  const status = Number(err?.status || err?.response?.status || 0)

  if (code === 'invalid_credentials') return '用户名或密码错误'
  if (code && CODE_HINTS[code]) return CODE_HINTS[code]
  if (serverMessage) {
    if (/permission|unauthorized|forbidden|invalid.*(token|key|secret)|auth/i.test(serverMessage)) {
      return `${serverMessage}（请检查 AWS 密钥与 IAM 权限）`
    }
    if (/rate|too many|throttl/i.test(serverMessage)) {
      return `${serverMessage}（请求过快，请稍后重试）`
    }
    if (/timeout|timed out|gateway/i.test(serverMessage)) {
      return `${serverMessage}（上游超时，请稍后重试）`
    }
    // Prefer Chinese-looking server messages as-is
    if (/[\u4e00-\u9fff]/.test(serverMessage)) return serverMessage
    if (status === 401 || status === 403) return `${serverMessage}（认证/权限失败）`
    return serverMessage
  }

  if (status === 401) return '登录已失效，请重新登录'
  if (status === 403) return '没有权限执行该操作'
  if (status === 404) return '资源不存在'
  if (status >= 500) return '服务暂时异常，请稍后重试'

  return fallback
}
