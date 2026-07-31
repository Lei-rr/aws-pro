import { bool, boolQuery, objectSchema, requestSchema, text } from '../../lib/http/request-schema.js'

export const regionsIndexSchema = requestSchema({
  querystring: objectSchema({ account_id: text(64), refresh: boolQuery, cache_only: boolQuery }, ['account_id']),
})
export const regionsEnableSchema = requestSchema({
  body: objectSchema({ account_id: text(64), region: text(64) }, ['account_id', 'region']),
})

export const quotaVcpuSchema = requestSchema({
  querystring: objectSchema({}),
  body: objectSchema({ account_id: text(64), region: text(64), refresh: bool, cache_only: bool }, ['account_id', 'region']),
})

export const billingYearlySchema = requestSchema({
  querystring: objectSchema({}),
  body: objectSchema({ account_id: text(64), refresh: bool, cache_only: bool }, ['account_id']),
})
