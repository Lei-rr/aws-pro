import { ApiError } from '../http/api-error.js'

function pickAwsMessage(e: unknown): string {
  if (!e || typeof e !== 'object') return 'AWS request failed'
  const record = e as Record<string, unknown>
  return String(record.message || record.Message || record.$fault || 'AWS request failed')
}

function pickAwsCode(e: unknown): string {
  if (!e || typeof e !== 'object') return 'aws_request_failed'
  const record = e as Record<string, unknown>
  return String(record.name || record.Code || record.code || record.__type || 'aws_request_failed')
}

function isCredentialError(code: string, message: string): boolean {
  const blob = `${code} ${message}`
  return /security token.*invalid|InvalidClientTokenId|UnrecognizedClientException|ExpiredToken|invalid.*access.?key|SignatureDoesNotMatch|AuthFailure|InvalidAccessKeyId/i.test(
    blob
  )
}

type AwsErrorShape = {
  code: string
  status: number
  requestId: string | undefined
}

/** Breadth-first walk over cause / errors / cleanupErrors chains; earlier nodes win ties. */
function collectErrorNodes(error: unknown): unknown[] {
  const nodes: unknown[] = []
  const seen = new Set<unknown>()
  const queue: unknown[] = [error]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node || typeof node !== 'object' || seen.has(node)) continue
    seen.add(node)
    nodes.push(node)
    const record = node as Record<string, unknown>
    if (record.cause !== undefined) queue.push(record.cause)
    for (const list of [record.errors, record.cleanupErrors]) {
      if (Array.isArray(list)) for (const child of list) queue.push(child)
    }
  }
  return nodes
}

function nodeShape(node: unknown): AwsErrorShape {
  if (node instanceof ApiError) {
    const details = node.details as { aws_error_code?: unknown; aws_request_id?: unknown } | undefined
    return {
      code: typeof details?.aws_error_code === 'string' && details.aws_error_code ? details.aws_error_code : node.code,
      status: node.statusCode,
      requestId: typeof details?.aws_request_id === 'string' ? details.aws_request_id : undefined,
    }
  }
  const record = (node && typeof node === 'object' ? node : {}) as Record<string, unknown>
  const meta = (record.$metadata && typeof record.$metadata === 'object' ? record.$metadata : {}) as Record<
    string,
    unknown
  >
  return {
    code: pickAwsCode(node),
    status: Number(meta.httpStatusCode || record.statusCode || 0),
    requestId:
      typeof meta.requestId === 'string'
        ? meta.requestId
        : typeof record.requestId === 'string'
          ? record.requestId
          : undefined,
  }
}

function nodeFidelity(node: unknown): number {
  if (node instanceof ApiError) return 1000
  const shape = nodeShape(node)
  let score = 0
  if (shape.code && shape.code !== 'aws_request_failed') score += 4
  if (shape.requestId) score += 2
  if (shape.status >= 400) score += 1
  const record = (node && typeof node === 'object' ? node : {}) as Record<string, unknown>
  if (record.$fault || record.Code || record.__type) score += 2
  return score
}

export function toAwsApiError(error: unknown, operation: string): ApiError {
  if (error instanceof ApiError) return error
  const nodes = collectErrorNodes(error)
  let best: unknown = nodes[0] ?? error
  for (const node of nodes) {
    if (nodeFidelity(node) > nodeFidelity(best)) best = node
  }
  const shape = nodeShape(best)
  const message = pickAwsMessage(error)
  const code = isCredentialError(shape.code, message) ? 'aws_credentials_invalid' : 'aws_request_failed'
  return new ApiError(code, message, shape.status >= 400 ? shape.status : 502, {
    operation,
    aws_error_code: shape.code,
    aws_request_id: shape.requestId,
  })
}

/** Fail-closed error for a malformed HTTP 200 whose expected list field is absent. */
export function malformedAwsResponse(operation: string, missingField: string): ApiError {
  return new ApiError(
    'aws_malformed_response',
    `AWS ${operation} returned a malformed response; missing field "${missingField}"`,
    502,
    { operation, missing_field: missingField }
  )
}

export async function awsCall<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw toAwsApiError(error, operation)
  }
}
