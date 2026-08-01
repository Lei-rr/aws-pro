import {
  boolQuery,
  objectSchema,
  optionalText,
  paramsSchema,
  requestSchema,
  text,
} from '../../shared/http/request-schema.js'

const accountRegion = { account_id: text(64), region: text(64) }
const actionValues = ['allocate_static_ip', 'release_static_ip', 'start', 'stop', 'reboot', 'delete', 'open_ports']

export const lightsailInstancesSchema = requestSchema({
  querystring: objectSchema({ account_id: optionalText(64), region: optionalText(64), refresh: boolQuery }),
})
export const lightsailSyncSchema = requestSchema({ body: objectSchema(accountRegion, ['account_id', 'region']) })
export const lightsailCreateOptionsSchema = requestSchema({
  querystring: objectSchema(accountRegion, ['account_id', 'region']),
})
export const lightsailStoreSchema = requestSchema({
  body: objectSchema(
    {
      ...accountRegion,
      name: text(128),
      zone: text(128),
      blueprint: text(255),
      bundle: text(255),
      ip_address_type: { type: 'string', enum: ['dualstack', 'ipv4', 'ipv6'] },
      root_password: optionalText(1024),
    },
    ['account_id', 'region', 'name', 'zone', 'blueprint', 'bundle']
  ),
})
const instanceParams = paramsSchema('instance')

export const lightsailRemarkSchema = requestSchema({
  params: instanceParams,
  body: objectSchema({ ...accountRegion, instance_name: text(128), remark: optionalText(4096) }, [
    'account_id',
    'region',
    'remark',
  ]),
})
export const lightsailActionSchema = requestSchema({
  params: instanceParams,
  body: objectSchema(
    {
      ...accountRegion,
      instance_name: text(128),
      action: { type: 'string', enum: actionValues },
      confirm: { type: 'string', enum: actionValues },
    },
    ['account_id', 'region', 'action', 'confirm']
  ),
})
