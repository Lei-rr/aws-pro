import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/app/App.vue'
import router from '@/app/router'
import { useSessionStore } from '@/features/auth'
import { setUnauthorizedHandler } from '@/shared/api/http'
import '@/app/styles/index.css'

const app = createApp(App)
const pinia = createPinia()

let redirectingToLogin = false

setUnauthorizedHandler(() => {
  const session = useSessionStore(pinia)
  session.invalidate()
  const path = router.currentRoute.value.path
  if (path === '/login' || redirectingToLogin) return
  redirectingToLogin = true
  void router.replace('/login').finally(() => {
    redirectingToLogin = false
  })
})

app.config.errorHandler = (err, _instance, info) => {
  if (import.meta.env.DEV) console.error('[Vue error]', info, err)
}

app.use(pinia)
app.use(router)
app.mount('#app')
