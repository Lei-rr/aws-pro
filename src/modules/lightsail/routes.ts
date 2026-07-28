
import type { FastifyInstance } from 'fastify'
import {
  lightsailAction,
  lightsailCreateOptions,
  lightsailInstances,
  lightsailRemark,
  lightsailStore,
  lightsailSync,
} from './controllers/lightsail-controller.js'

export async function routes(app: FastifyInstance) {
  app.get('/lightsail/instances', lightsailInstances)
  app.post('/lightsail/instances/sync', lightsailSync)
  app.get('/lightsail/create-options', lightsailCreateOptions)
  app.post('/lightsail/instances', lightsailStore)
  app.put('/lightsail/instances/:instance/remark', lightsailRemark)
  app.post('/lightsail/instances/:instance/actions', lightsailAction)
}
