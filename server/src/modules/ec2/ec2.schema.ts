import {
  bool,
  boolQuery,
  objectSchema,
  optionalText,
  paramsSchema,
  requestSchema,
  text,
} from '../../shared/http/request-schema.js'

const accountRegion = { account_id: text(64), region: text(64) }
const actionValues = ['allocate_static_ip', 'release_static_ip', 'start', 'stop', 'reboot', 'terminate', 'open_ports']

export const ec2InstancesSchema = requestSchema({
  querystring: objectSchema({ account_id: optionalText(64), region: optionalText(64), refresh: boolQuery }),
})
export const ec2SyncSchema = requestSchema({ body: objectSchema(accountRegion, ['account_id', 'region']) })
export const ec2StoreSchema = requestSchema({
  body: objectSchema(
    {
      ...accountRegion,
      name: text(128),
      ami: text(255),
      instance_type: text(128),
      root_password: optionalText(1024),
      enable_ipv6: bool,
      client_token: optionalText(255),
    },
    ['account_id', 'region', 'name', 'ami', 'instance_type']
  ),
})
const instanceParams = paramsSchema('instance')

export const ec2RemarkSchema = requestSchema({
  params: instanceParams,
  body: objectSchema({ ...accountRegion, instance_id: text(128), remark: optionalText(4096) }, [
    'account_id',
    'region',
    'remark',
  ]),
})
export const ec2ActionSchema = requestSchema({
  params: instanceParams,
  body: objectSchema(
    {
      ...accountRegion,
      instance_id: text(128),
      action: { type: 'string', enum: actionValues },
      confirm: { type: 'string', enum: actionValues },
    },
    ['account_id', 'region', 'action', 'confirm']
  ),
})
