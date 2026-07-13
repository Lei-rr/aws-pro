
<template>
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
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { moduleMenuItems } from '@/routes/paths'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()

const navItems = moduleMenuItems.map((item) => ({
  key: item.key,
  label: h(RouterLink, { to: item.path }, { default: () => item.label }),
}))

const selectedKeys = computed(() => {
  const first = route.path.split('/').filter(Boolean)[0] || 'home'
  return [first === '' ? 'home' : first]
})

function openMenu({ key }: { key: string }) {
  const item = moduleMenuItems.find((m) => m.key === key)
  if (item && item.path !== route.path) router.push(item.path)
}

async function handleUserMenu({ key }: { key: string }) {
  if (key === 'accounts') router.push('/accounts')
  if (key === 'logout') {
    await sessionStore.logout()
    router.replace('/login')
  }
}
</script>
