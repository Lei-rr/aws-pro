import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify'
import { isSignedIn } from '../../shared/auth/auth-session.js'
import { ApiError } from '../../shared/http/api-error.js'

export function authRequired(request: FastifyRequest, _reply: FastifyReply, done: HookHandlerDoneFunction): void {
  if (!isSignedIn(request)) {
    done(new ApiError('unauthenticated', '请先登录', 401))
    return
  }
  done()
}
