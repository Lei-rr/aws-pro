<template>
  <a-layout style="min-height: 100vh; background: #fff">
    <a-layout-header class="app-header" style="background: #fff">
      <div class="app-container app-header-inner">
        <div class="app-header-top">
          <router-link to="/" class="app-brand">
            <a-avatar shape="square" size="small" style="background: #1677ff">A</a-avatar>
            <a-typography-text strong style="font-size: 16px">AWS-PRO</a-typography-text>
          </router-link>
          <a-dropdown class="app-header-user" :trigger="['click']" :get-popup-container="getPopupContainer">
            <a-button shape="circle" title="管理" aria-label="管理">☰</a-button>
            <template #overlay>
              <a-menu>
                <a-menu-item key="accounts" @click="handleUserMenu('accounts')">账号管理</a-menu-item>
                <a-menu-divider />
                <a-menu-item key="logout" danger @click="handleUserMenu('logout')">退出</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
        <a-menu
          class="app-menu"
          mode="horizontal"
          theme="light"
          :selected-keys="selectedKeys"
          :items="navItems"
          @click="openMenu"
        />
      </div>
    </a-layout-header>
    <a-layout-content>
      <div class="app-container app-main">
        <router-view />
      </div>
    </a-layout-content>
  </a-layout>
</template>

<script>
import { authApi } from '../api/auth.js'
import { menuPath, selectedMenuKey } from '../../../routes/utils.js'
import { appPaths, moduleMenuItems } from '../../../routes/paths.js'
import { h } from 'vue'
import { RouterLink } from 'vue-router'

export default {
  name: 'AppLayout',
  data() {
    return {
      navItems: moduleMenuItems.map((item) => ({
        ...item,
        label: h(RouterLink, { to: item.path }, { default: () => item.label }),
      })),
    }
  },
  computed: {
    selectedKeys() {
      return [selectedMenuKey(this.$route.path)]
    },
  },
  methods: {
    getPopupContainer() {
      return document.body
    },
    async logout() {
      await authApi.logout().catch(() => {})
      this.$router.replace(appPaths.login)
    },
    openMenu({ key }) {
      const path = menuPath(moduleMenuItems, key)
      if (path !== this.$route.path) this.$router.push(path)
    },
    handleUserMenu(key) {
      if (key === 'accounts') this.$router.push(appPaths.accounts)
      if (key === 'logout') this.logout()
    },
  },
}
</script>
