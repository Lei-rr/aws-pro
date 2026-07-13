
import type { FastifyInstance } from 'fastify'
import { ec2Action, ec2Instances, ec2Options, ec2Remark, ec2Store, ec2Sync } from './controller.js'

export async function routes(app: FastifyInstance) {
  app.get('/ec2/instances', ec2Instances)
  app.post('/ec2/instances/sync', ec2Sync)
  app.get('/ec2/create-options', ec2Options)
  app.post('/ec2/instances', ec2Store)
  app.put('/ec2/instances/:instance/remark', ec2Remark)
  app.post('/ec2/instances/:instance/actions', ec2Action)
}
