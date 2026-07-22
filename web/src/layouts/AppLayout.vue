<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { ChevronDown, LogOut, Moon, UserRound } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useSessionStore } from '@/features/auth/stores/session'
import { cn } from '@/shared/lib/utils'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()

/** 顶栏业务入口：不含账号管理（仅右上角账户下拉） */
const navItems = [
  { path: '/', label: '控制台' },
  { path: '/lightsail', label: 'Lightsail' },
  { path: '/ec2', label: 'EC2' },
  { path: '/newbie', label: '新手任务' },
  { path: '/regions', label: '区域' },
  { path: '/quota', label: '配额' },
  { path: '/billing', label: '账单' },
]

function isActivePath(href: string) {
  if (href === '/') return route.path === '/'
  return route.path === href || route.path.startsWith(`${href}/`)
}

/** 手机顶栏折叠：显示当前模块名；账号管理页单独标名 */
const currentNavLabel = computed(() => {
  if (route.path === '/accounts' || route.path.startsWith('/accounts/')) return '账号管理'
  const exact = navItems.find((item) => item.path !== '/' && isActivePath(item.path))
  if (exact) return exact.label
  return '控制台'
})

async function logout() {
  await session.logout()
  router.replace('/login')
}

function toggleDark() {
  document.documentElement.classList.toggle('dark')
}
</script>

<template>
  <div class="bg-background relative flex min-h-svh flex-col">
    <header class="bg-background sticky top-0 z-50 w-full">
      <div
        class="mx-auto flex h-14 w-full max-w-none min-w-0 items-center gap-2 px-4 sm:h-16 sm:px-6 md:w-[80vw] md:px-0"
      >
        <RouterLink to="/" class="mr-1 flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span class="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">A</span>
          <span class="hidden sm:inline">AWS-PRO</span>
        </RouterLink>

        <nav class="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex">
          <Button
            v-for="item in navItems"
            :key="item.path"
            variant="ghost"
            as-child
            size="sm"
            class="h-9 shrink-0 px-3 text-[15px]"
          >
            <RouterLink :to="item.path" :class="cn(isActivePath(item.path) && 'bg-accent text-accent-foreground')">
              {{ item.label }}
            </RouterLink>
          </Button>
        </nav>

        <div class="min-w-0 flex-1 lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="sm" class="h-9 max-w-full gap-1 px-2 text-[15px]">
                <span class="truncate">{{ currentNavLabel }}</span>
                <ChevronDown class="size-4 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-52">
              <DropdownMenuItem v-for="item in navItems" :key="item.path" as-child>
                <RouterLink
                  :to="item.path"
                  class="w-full"
                  :class="cn(isActivePath(item.path) && 'bg-accent text-accent-foreground')"
                >
                  {{ item.label }}
                </RouterLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div class="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" class="size-9" title="主题" @click="toggleDark">
            <Moon class="size-4" />
          </Button>

          <!-- 右上角账户下拉：显示用户名 + 账号管理 + 退出（对齐 dns-pro） -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" class="h-9 gap-1.5 px-3 text-[15px]">
                <UserRound class="size-4" />
                <span class="hidden max-w-[7rem] truncate sm:inline">{{ session.username || '账户' }}</span>
                <ChevronDown class="size-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuLabel class="truncate">{{ session.username || '账户' }}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem as-child>
                <RouterLink to="/accounts" class="w-full">账号管理</RouterLink>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="text-destructive focus:text-destructive" @click="logout">
                <LogOut class="size-4" />
                退出
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full flex-1 px-4 py-4 sm:px-6 md:w-[80vw] md:px-0 md:py-6">
      <RouterView v-slot="{ Component }">
        <Transition name="page-fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>
