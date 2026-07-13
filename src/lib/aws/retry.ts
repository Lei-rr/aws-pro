const RETRYABLE = new Set([
  'RequestLimitExceeded',
  'Throttling',
  'ThrottlingException',
  'ThrottledException',
  'TooManyRequests',
  'TooManyRequestsException',
  'ProvisionedThroughputExceededException',
  'SlowDown',
  'ServiceUnavailable',
  'ServiceUnavailableException',
  'InternalError',
  'TimeoutError',
  'RequestTimeout',
])

function awsCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const e = error as any
  return String(e.name || e.Code || e.code || e.$metadata?.httpStatusCode || '')
}

function statusCode(error: unknown): number {
  if (!error || typeof error !== 'object') return 0
  const e = error as any
  return Number(e.$metadata?.httpStatusCode || e.statusCode || 0)
}

export function isRetryableAwsError(error: unknown): boolean {
  const code = awsCode(error)
  if (RETRYABLE.has(code)) return true
  const status = statusCode(error)
  return status >= 500
}

export function isAwsErrorCode(error: unknown, codes: string[]): boolean {
  return codes.includes(awsCode(error))
}

export async function withAwsRetry<T>(action: string, fn: () => Promise<T>, successCodes: string[] = []): Promise<T | null> {
  let last: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (successCodes.length && isAwsErrorCode(error, successCodes)) return null
      last = error
      if (!isRetryableAwsError(error) || attempt === 4) break
      await new Promise((r) => setTimeout(r, 400 * (1 + attempt * 0.5)))
    }
  }
  const message = last instanceof Error ? last.message : String(last ?? 'unknown error')
  throw new Error(`${action} failed: ${message}`)
}
