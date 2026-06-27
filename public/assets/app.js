import router from './router.js';
import { antDesignVue } from './shared/plugins/antDesignVue.js';
import { ignoreResizeObserverNoise } from './shared/utils/browserErrors.js';

const { createApp } = Vue;
const { createPinia } = Pinia;

ignoreResizeObserverNoise();

const app = createApp({
    template: '<router-view />'
});

app
    .use(createPinia())
    .use(antDesignVue)
    .use(router)
    .mount('#app');
