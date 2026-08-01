import { createRouter, createWebHashHistory } from 'vue-router'
import { useSessionStore } from '@/features/auth'
import AppLayout from '@/app/layouts/AppLayout.vue'
import LoginPage from '@/pages/login/LoginPage.vue'
import DashboardPage from '@/pages/dashboard/DashboardPage.vue'
import AccountsPage from '@/pages/accounts/AccountsPage.vue'
import LightsailPage from '@/pages/lightsail/LightsailPage.vue'
import Ec2Page from '@/pages/ec2/Ec2Page.vue'
import NewbiePage from '@/pages/newbie/NewbiePage.vue'
import RegionsPage from '@/pages/regions/RegionsPage.vue'
import QuotaPage from '@/pages/quota/QuotaPage.vue'
import BillingPage from '@/pages/billing/BillingPage.vue'

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
