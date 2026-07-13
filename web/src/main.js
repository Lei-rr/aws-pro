import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/app.css'
import App from './App.vue'
import router from './router.js'
import { installAntDesignVue } from './shared/plugins/antDesignVue.js'
import { ignoreResizeObserverNoise } from './shared/utils/browserErrors.js'

ignoreResizeObserverNoise()

const app = createApp(App)
app.use(createPinia())
installAntDesignVue(app)
app.use(router)
app.mount('#app')
