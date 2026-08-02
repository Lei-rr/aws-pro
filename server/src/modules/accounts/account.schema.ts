import { objectSchema, optionalText, paramsSchema, requestSchema, text } from '../../shared/http/request-schema.js'

const writeFields = {
  id: text(64),
  access_key: text(256),
  secret_key: optionalText(512),
  remark: optionalText(1024),
}

export const accountParamsSchema = requestSchema({ params: paramsSchema('id') })
export const accountStoreSchema = requestSchema({
  body: objectSchema(writeFields, ['id', 'access_key', 'secret_key']),
})
export const accountUpdateSchema = requestSchema({
  params: paramsSchema('id'),
  body: objectSchema(writeFields),
})
