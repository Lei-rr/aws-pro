import path from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'
import fastifyCompress from '@fastify/compress'

const distDir = path.resolve(process.cwd(), 'web/dist')

const staticPluginImpl: FastifyPluginAsync = async (app) => {
  await app.register(fastifyCompress)

  // Hashed Vite assets: always resolve from disk so rebuilds work without process restart.
  await app.register(fastifyStatic, {
    root: path.join(distDir, 'assets'),
    prefix: '/assets/',
    wildcard: true,
    decorateReply: false,
    maxAge: 365 * 24 * 60 * 60 * 1000,
    immutable: true,
  })

  // App shell and other root files.
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: '/',
    wildcard: false,
    index: false,
    decorateReply: true,
    setHeaders(reply, filePath) {
      if (filePath.endsWith('index.html')) {
        reply.header('Cache-Control', 'no-store, must-revalidate')
      } else {
        reply.header('Cache-Control', 'public, max-age=3600')
      }
    },
  })

  app.addHook('onSend', async (request, reply) => {
    if (request.raw.url?.startsWith('/assets/')) {
      reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    }
  })
}

/** Breaks encapsulation so reply.sendFile is available for SPA fallback. */
export const staticPlugin = fp(staticPluginImpl, {
  name: 'static',
  fastify: '5.x',
})
