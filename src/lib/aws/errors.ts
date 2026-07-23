import { ApiError } from '../http/api-error.js'

function pickAwsMessage(e: any): string {
  return String(e?.message || e?.Message || e?.$fault || 'AWS request failed')
}

function pickAwsCode(e: any): string {
  return String(e?.name || e?.Code || e?.code || e?.__type || 'aws_request_failed')
}

function isCredentialError(code: string, message: string): boolean {
  const blob = `${code} ${message}`
  return /security token.*invalid|InvalidClientTokenId|UnrecognizedClientException|ExpiredToken|invalid.*access.?key|SignatureDoesNotMatch|AuthFailure|InvalidAccessKeyId/i.test(
    blob,
  )
}

export function toAwsApiError(error: unknown, operation: string): ApiError {
  if (error instanceof ApiError) return error
  const e = error as any
  const message = pickAwsMessage(e)
  const awsCode = pickAwsCode(e)
  const status = Number(e?.$metadata?.httpStatusCode || e?.statusCode || 502)
  const code = isCredentialError(awsCode, message) ? 'aws_credentials_invalid' : 'aws_request_failed'
  return new ApiError(code, message, status >= 400 ? status : 502, {
    operation,
    aws_error_code: awsCode,
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
