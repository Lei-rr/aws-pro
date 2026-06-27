import { moduleChildRoutes, modulePublicRoutes } from './modules/manifest.js'
import { systemRouteIds, systemRoutes } from './modules/system/routes.js'
import { authApi } from './modules/system/api/auth.js'
import { message } from './shared/plugins/antDesignVue.js'

const { createRouter, createWebHashHistory } = VueRouter

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
  if (to.path === '/login') return true

  try {
    await authApi.me()
  } catch {
    return '/login'
  }

  const first = to.path.split('/').filter(Boolean)[0] || ''
  if (systemRouteIds.has(first)) return true

  message.warning('页面不存在或不可用')
  return '/'
})

export default router
