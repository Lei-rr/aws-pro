import { createRouter, createWebHashHistory } from 'vue-router'
import { useSessionStore } from '@/features/auth/stores/session'
import AppLayout from '@/layouts/AppLayout.vue'
import LoginPage from '@/features/auth/pages/LoginPage.vue'
import DashboardPage from '@/features/dashboard/pages/DashboardPage.vue'
import AccountsPage from '@/features/accounts/pages/AccountsPage.vue'
import LightsailPage from '@/features/lightsail/pages/LightsailPage.vue'
import Ec2Page from '@/features/ec2/pages/Ec2Page.vue'
import NewbiePage from '@/features/newbie/pages/NewbiePage.vue'
import RegionsPage from '@/features/regions/pages/RegionsPage.vue'
import QuotaPage from '@/features/quota/pages/QuotaPage.vue'
import BillingPage from '@/features/billing/pages/BillingPage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: LoginPage, meta: { public: true } },
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', component: DashboardPage },
        { path: 'accounts', component: AccountsPage },
        { path: 'lightsail', component: LightsailPage },
        { path: 'ec2', component: Ec2Page },
        { path: 'newbie', component: NewbiePage },
        { path: 'regions', component: RegionsPage },
        { path: 'quota', component: QuotaPage },
        { path: 'billing', component: BillingPage },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const normalized = to.path.replace(/\/+$/, '') || '/'
  if (to.path !== normalized) return { path: normalized, query: to.query, hash: to.hash }

  const session = useSessionStore()
  const isLogin = normalized === '/login'

  try {
    // Force refresh when entering protected pages after invalidate
    await session.load({ refresh: isLogin ? false : !session.checked })
  } catch {
    if (isLogin) return true
    return '/login'
  }

  if (isLogin && session.authenticated) return '/'
  if (!isLogin && !session.authenticated) return '/login'
  return true
})

export default router
