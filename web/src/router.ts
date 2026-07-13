
import { createRouter, createWebHashHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const AppLayout = () => import('@/modules/system/layouts/AppLayout.vue')
const LoginView = () => import('@/modules/system/views/LoginView.vue')
const DashboardView = () => import('@/modules/system/views/DashboardView.vue')
const AccountsView = () => import('@/modules/accounts/AccountsView.vue')
const LightsailView = () => import('@/modules/lightsail/views/LightsailView.vue')
const Ec2View = () => import('@/modules/ec2/views/Ec2View.vue')
const NewbieView = () => import('@/modules/newbie/views/NewbieView.vue')
const RegionsView = () => import('@/modules/regions/RegionsView.vue')
const QuotaView = () => import('@/modules/quota/QuotaView.vue')
const BillingView = () => import('@/modules/billing/BillingView.vue')

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: LoginView, meta: { public: true } },
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', component: DashboardView },
        { path: 'accounts', component: AccountsView },
        { path: 'lightsail', component: LightsailView },
        { path: 'ec2', component: Ec2View },
        { path: 'newbie', component: NewbieView },
        { path: 'regions', component: RegionsView },
        { path: 'quota', component: QuotaView },
        { path: 'billing', component: BillingView },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const sessionStore = useSessionStore()
  try {
    const session = await sessionStore.load()
    if (to.path === '/login') return session.authenticated ? '/' : true
    if (!session.authenticated) return '/login'
    return true
  } catch {
    return to.path === '/login' ? true : '/login'
  }
})

export default router
