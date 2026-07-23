import type { SideEffects } from '../utils/side-effect-result.js'
import { translateError } from './error-messages.js'

export interface SuccessResponseBody<T = unknown> {
  code: 0
  message: 'success'
  data: T
  side_effects?: SideEffects
}

export interface ErrorResponseBody {
  message: string
  code: string
  status: number
  details: unknown
}

export type ApiResponseBody<T = unknown> = SuccessResponseBody<T> | ErrorResponseBody

export function success<T>(data: T, sideEffects?: SideEffects): SuccessResponseBody<T> {
  return {
    code: 0,
    message: 'success',
    data,
    side_effects: sideEffects,
  }
}

export function error(
  messageOrCode: string,
  statusCode: number = 400,
  errorCode?: string,
  details: unknown = undefined
): ErrorResponseBody {
  const code = errorCode ?? 'error'
  const mapped = translateError(code, '')
  // Prefer Chinese map; keep vendor detail for AWS failures when present
  let message = mapped || messageOrCode || code
  if (
    (code === 'aws_request_failed' || code === 'aws_credentials_invalid') &&
    messageOrCode &&
    messageOrCode !== mapped &&
    messageOrCode !== code
  ) {
    message = mapped ? `${mapped}：${messageOrCode}` : messageOrCode
  }
  return {
    message,
    code,
    status: statusCode,
    details,
  }
}

export function noContent(): null {
  return null
}
