import { bool, objectSchema, requestSchema, text } from '../../shared/http/request-schema.js'

export const quotaVcpuSchema = requestSchema({
  querystring: objectSchema({}),
  body: objectSchema({ account_id: text(64), region: text(64), refresh: bool, cache_only: bool }, [
    'account_id',
    'region',
  ]),
})
