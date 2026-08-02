import type { AppConfig } from './app-config.js'
import { createModules } from './create-modules.js'
import { createPlatform } from './create-platform.js'
import { createWorkflows } from './create-workflows.js'

export async function createAppContext(config: AppConfig) {
  const platform = createPlatform()
  const modules = await createModules()
  const workflows = createWorkflows(modules)
  return { config, platform, modules, workflows }
}

export type AppContext = Awaited<ReturnType<typeof createAppContext>>

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext
  }
}
