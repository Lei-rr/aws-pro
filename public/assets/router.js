import { moduleChildRoutes, modulePublicRoutes } from './modules/manifest.js'
import { systemRoutes } from './modules/system/routes.js'
import { authApi } from './modules/system/api/auth.js'
import { message } from './shared/plugins/antDesignVue.js'

const { createRouter, createWebHashHistory } = VueRouter

const protectedPaths = new Set([
  '/',
  ...moduleChildRoutes.map((route) => `/${String(route.path || '').replace(/^\/+/, '')}`),
])

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    ...modulePublicRoutes,
    {
      path: '/',
      component: systemRoutes.layout,
      children: moduleChildRoutes,
    },
  ],
})

router.beforeEach(async (to) => {
  const normalizedPath = to.path.replace(/\/+$/, '') || '/'
  if (to.path !== normalizedPath) return { path: normalizedPath, query: to.query, hash: to.hash }
  if (normalizedPath === '/login') return true

  try {
    await authApi.me()
  } catch {
    return '/login'
  }

  if (protectedPaths.has(normalizedPath)) return true

  message.warning('页面不存在或不可用')
  return '/'
})

export default router
