import { ApiError } from '../http/api-error.js'

export function toAwsApiError(error: unknown, operation: string): ApiError {
  if (error instanceof ApiError) return error
  const e = error as any
  const message = e?.message || e?.Message || 'AWS request failed'
  const status = Number(e?.$metadata?.httpStatusCode || e?.statusCode || 502)
  const code = String(e?.name || e?.Code || e?.code || 'aws_request_failed')
  return new ApiError('aws_request_failed', message, status >= 400 ? status : 502, {
    operation,
    aws_error_code: code,
    aws_request_id: e?.$metadata?.requestId,
  })
}

export async function awsCall<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw toAwsApiError(error, operation)
  }
}
