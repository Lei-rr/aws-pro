import { objectSchema, paramsSchema, requestSchema, text, unsignedIntQuery } from '../../shared/http/request-schema.js'

export const newbieStoreSchema = requestSchema({
  body: objectSchema(
    {
      account_id: text(64),
      step: { type: 'string', enum: ['all', 'budget', 'ec2', 'lambda', 'rds'] },
    },
    ['account_id']
  ),
})
export const newbieTaskParamsSchema = requestSchema({ params: paramsSchema('task') })
export const newbieStreamSchema = requestSchema({
  params: paramsSchema('task'),
  querystring: objectSchema({ after_seq: unsignedIntQuery }),
})
