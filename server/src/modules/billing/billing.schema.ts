import { bool, objectSchema, requestSchema, text } from '../../shared/http/request-schema.js'

export const billingYearlySchema = requestSchema({
  querystring: objectSchema({}),
  body: objectSchema({ account_id: text(64), refresh: bool, cache_only: bool }, ['account_id']),
})
