import { authApi } from '../api/auth.js';
import { menuPath, selectedMenuKey } from '../../../routes/utils.js';
import { appPaths, moduleMenuItems } from '../../../routes/paths.js';

const { h } = Vue;
const { RouterLink } = VueRouter;

export default {
    name: 'AppLayout',
    data() {
        return {
            navItems: moduleMenuItems.map((item) => ({
                ...item,
                label: h(RouterLink, { to: item.path }, { default: () => item.label })
            }))
        };
    },
    computed: {
        selectedKeys() {
            return [selectedMenuKey(this.$route.path)];
        },
    },
    methods: {
        async logout() {
            await authApi.logout().catch(() => {});
            this.$router.replace(appPaths.login);
        },
        openMenu({ key }) {
            const path = menuPath(moduleMenuItems, key);
            if (path !== this.$route.path) this.$router.push(path);
        },
        handleUserMenu({ key }) {
            if (key === 'user') this.$router.push(appPaths.user);
            if (key === 'accounts') this.$router.push(appPaths.accounts);
            if (key === 'logout') this.logout();
        }
    },
    template: `
        <a-layout style="min-height: 100vh; background: #fff">
            <a-layout-header style="position: sticky; top: 0; z-index: 10; background: #fff; padding: 0">
                <div class="app-container app-header-inner">
                    <a-space class="app-brand-nav" :size="24">
                        <router-link to="/" class="app-brand">
                            <a-avatar shape="square" style="background: #1677ff">A</a-avatar>
                            <a-typography-text strong style="font-size: 16px">AWS-PRO</a-typography-text>
                        </router-link>
                        <a-menu class="app-menu" mode="horizontal" :selected-keys="selectedKeys" :items="navItems" @click="openMenu" />
                    </a-space>
                    <a-dropdown :trigger="['click']">
                        <a-button shape="circle" title="管理" aria-label="管理">☰</a-button>
                        <template #overlay>
                            <a-menu @click="handleUserMenu">
                                <a-menu-item key="user">个人中心</a-menu-item>
                                <a-menu-item key="accounts">账号管理</a-menu-item>
                                <a-menu-divider />
                                <a-menu-item key="logout" danger>退出</a-menu-item>
                            </a-menu>
                        </template>
                    </a-dropdown>
                </div>
            </a-layout-header>
            <a-layout-content>
                <div class="app-container app-main">
                    <router-view />
                </div>
            </a-layout-content>
        </a-layout>
    `
};
