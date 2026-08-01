import type { FastifyInstance } from 'fastify'
import {
  lightsailAction,
  lightsailCreateOptions,
  lightsailInstances,
  lightsailRemark,
  lightsailStore,
  lightsailSync,
} from './lightsail.handlers.js'
import {
  lightsailActionSchema,
  lightsailCreateOptionsSchema,
  lightsailInstancesSchema,
  lightsailRemarkSchema,
  lightsailStoreSchema,
  lightsailSyncSchema,
} from './lightsail.schema.js'

export async function routes(app: FastifyInstance) {
  app.get('/lightsail/instances', { schema: lightsailInstancesSchema }, lightsailInstances)
  app.post('/lightsail/instances/sync', { schema: lightsailSyncSchema }, lightsailSync)
  app.get('/lightsail/create-options', { schema: lightsailCreateOptionsSchema }, lightsailCreateOptions)
  app.post('/lightsail/instances', { schema: lightsailStoreSchema }, lightsailStore)
  app.put('/lightsail/instances/:instance/remark', { schema: lightsailRemarkSchema }, lightsailRemark)
  app.post('/lightsail/instances/:instance/actions', { schema: lightsailActionSchema }, lightsailAction)
}
