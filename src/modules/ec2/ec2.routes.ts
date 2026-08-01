import type { FastifyInstance } from 'fastify'
import { ec2Action, ec2Instances, ec2Options, ec2Remark, ec2Store, ec2Sync } from './ec2.handlers.js'
import { noRequestSchema } from '../../shared/http/request-schema.js'
import { ec2ActionSchema, ec2InstancesSchema, ec2RemarkSchema, ec2StoreSchema, ec2SyncSchema } from './ec2.schema.js'

export async function routes(app: FastifyInstance) {
  app.get('/ec2/instances', { schema: ec2InstancesSchema }, ec2Instances)
  app.post('/ec2/instances/sync', { schema: ec2SyncSchema }, ec2Sync)
  app.get('/ec2/create-options', { schema: noRequestSchema }, ec2Options)
  app.post('/ec2/instances', { schema: ec2StoreSchema }, ec2Store)
  app.put('/ec2/instances/:instance/remark', { schema: ec2RemarkSchema }, ec2Remark)
  app.post('/ec2/instances/:instance/actions', { schema: ec2ActionSchema }, ec2Action)
}
