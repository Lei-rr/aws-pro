<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle,
  ChevronDown,
  Cloud,
  Coins,
  Globe2,
  Layers,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Server,
  Sparkles,
  Sun,
  UserRound,
  Users,
} from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import { AppDialog } from '@/shared/ui/dialog'
import { Badge } from '@/shared/ui/badge'
import { AppTooltip } from '@/shared/ui/tooltip'
import { CommandDialog, type CommandItem } from '@/shared/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useSessionStore } from '@/features/auth'
import { cn } from '@/shared/lib/utils'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const securityAlertOpen = ref(false)

const commandOpen = ref(false)
const isDark = ref(false)

/** 顶栏业务入口：不含账号管理（仅右上角账户下拉） */
const navItems = [
  { path: '/', label: '控制台', icon: LayoutDashboard },
  { path: '/lightsail', label: 'Lightsail', icon: Cloud },
  { path: '/ec2', label: 'EC2', icon: Server },
  { path: '/newbie', label: '新手任务', icon: Sparkles },
  { path: '/regions', label: '区域', icon: Globe2 },
  { path: '/quota', label: '配额', icon: Layers },
  { path: '/billing', label: '账单', icon: Coins },
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

const commandItems = computed<CommandItem[]>(() => {
  const list: CommandItem[] = [
    ...navItems.map((item) => ({
      id: `nav-${item.path}`,
      title: item.label,
      subtitle: `跳转至 ${item.label} 页面`,
      category: '导航',
      icon: item.icon,
      action: () => {
        commandOpen.value = false
        router.push(item.path)
      },
    })),
    {
      id: 'nav-accounts',
      title: '账号管理',
      subtitle: '添加、配置与管理 AWS 访问密钥',
      category: '导航',
      icon: Users,
      action: () => {
        commandOpen.value = false
        router.push('/accounts')
      },
    },
    {
      id: 'action-theme',
      title: isDark.value ? '切换为浅色模式' : '切换为深色模式',
      category: '快捷操作',
      icon: isDark.value ? Sun : Moon,
      action: () => {
        commandOpen.value = false
        toggleDark()
      },
    },
    {
      id: 'action-logout',
      title: '退出登录',
      category: '快捷操作',
      icon: LogOut,
      action: () => {
        commandOpen.value = false
        void logout()
      },
    },
  ]

  return list
})

function initTheme() {
  const saved = localStorage.getItem('theme')
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark')
    isDark.value = true
  } else {
    document.documentElement.classList.remove('dark')
    isDark.value = false
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    commandOpen.value = !commandOpen.value
  }
}

function closeSecurityAlert() {
  securityAlertOpen.value = false
  sessionStorage.setItem('dismiss_default_credential_alert', '1')
}

onMounted(async () => {
  initTheme()
  window.addEventListener('keydown', handleGlobalKeydown)
  try {
    const s = await session.load()
    if (s.is_default_credential && !sessionStorage.getItem('dismiss_default_credential_alert')) {
      securityAlertOpen.value = true
    }
  } catch {
    // ignore
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

async function logout() {
  sessionStorage.removeItem('dismiss_default_credential_alert')
  await session.logout()
  router.replace('/login')
}

function toggleDark() {
  const dark = document.documentElement.classList.toggle('dark')
  isDark.value = dark
  localStorage.setItem('theme', dark ? 'dark' : 'light')
}
</script>

<template>
  <div class="bg-background relative flex min-h-svh flex-col">
    <header class="bg-background/80 backdrop-blur-md sticky top-0 z-50 w-full border-b border-border/40">
      <div class="mx-auto flex h-14 w-full max-w-6xl min-w-0 items-center gap-2 px-4 sm:h-16 sm:px-6 lg:px-8">
        <RouterLink to="/" class="mr-2 flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span
            class="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold shadow-xs"
          >
            A
          </span>
          <span class="hidden sm:inline">AWS-PRO</span>
        </RouterLink>

        <!-- 常驻导航（字号 text-[15px]） -->
        <nav class="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex">
          <Button
            v-for="item in navItems"
            :key="item.path"
            variant="ghost"
            as-child
            size="sm"
            class="h-9 shrink-0 px-3 text-[15px] cursor-pointer"
          >
            <RouterLink
              :to="item.path"
              :class="cn(isActivePath(item.path) && 'bg-accent text-accent-foreground font-medium')"
            >
              {{ item.label }}
            </RouterLink>
          </Button>
        </nav>

        <!-- 手机：折叠业务导航 -->
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

        <div class="ml-auto flex shrink-0 items-center gap-1.5">
          <!-- 快捷搜索命令入口 -->
          <AppTooltip content="快捷搜索与跳转 (⌘K)">
            <Button
              variant="outline"
              size="sm"
              class="h-8 gap-1.5 text-xs text-muted-foreground px-2.5 hidden sm:flex cursor-pointer border-border/60"
              @click="commandOpen = true"
            >
              <Search class="size-3.5" />
              <span>搜索导航...</span>
              <kbd
                class="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
              >
                ⌘K
              </kbd>
            </Button>
          </AppTooltip>

          <AppTooltip :content="isDark ? '切换为浅色模式' : '切换为深色模式'">
            <Button variant="ghost" size="icon" class="size-9 cursor-pointer" @click="toggleDark">
              <Sun v-if="isDark" class="size-4" />
              <Moon v-else class="size-4" />
            </Button>
          </AppTooltip>

          <!-- 右上角账户下拉：显示用户名 + 账号管理 + 退出 -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" class="h-9 gap-1.5 px-3 text-[15px] cursor-pointer">
                <UserRound class="size-4 text-muted-foreground" />
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

    <!-- 全局快捷跳转对话框 (Command Palette) -->
    <CommandDialog v-model:open="commandOpen" :items="commandItems" />

    <!-- 默认密码安全提示弹窗 (Modal) -->
    <AppDialog v-model:open="securityAlertOpen" title="安全提示" content-class="sm:max-w-md">
      <div class="flex items-start gap-3 py-1">
        <div
          class="size-9 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 mt-0.5"
        >
          <AlertTriangle class="size-5" />
        </div>
        <div class="space-y-2 text-sm">
          <div class="font-medium text-foreground">当前仍在使用默认初始密码</div>
          <p class="text-xs text-muted-foreground leading-relaxed">
            系统检测到当前账户密码仍为初始默认凭据
            <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground font-semibold">admin / admin</code>。
          </p>
          <p class="text-xs text-muted-foreground leading-relaxed">
            如已将面板部署至公网环境，为防止被未授权扫描和访问，请尽快在服务器
            <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">data/config.json</code>
            中修改密码并重启服务。
          </p>
        </div>
      </div>
      <template #footer>
        <Button class="w-full sm:w-auto" @click="closeSecurityAlert"> 我知道了 </Button>
      </template>
    </AppDialog>

    <main class="flex flex-1 flex-col">
      <div class="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <RouterView v-slot="{ Component, route: currentRoute }">
          <Transition name="page-fade" mode="out-in">
            <component :is="Component" :key="currentRoute.fullPath" />
          </Transition>
        </RouterView>
      </div>
    </main>

    <!-- 页脚：版本号与项目链接 -->
    <footer class="mt-auto border-t border-border/40 py-5 text-xs text-muted-foreground">
      <div
        class="mx-auto flex h-6 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8 whitespace-nowrap"
      >
        <div class="flex items-center gap-2 overflow-hidden text-ellipsis">
          <span class="font-semibold text-foreground/90">AWS-PRO</span>
          <Badge variant="outline" class="h-4.5 px-1.5 text-[10px] font-normal shrink-0 border-border/60"
            >v{{ session.version }}</Badge
          >
          <span class="hidden sm:inline text-muted-foreground/70">· AWS 云资源与管理面板</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <AppTooltip content="GitHub 源码仓库">
            <a
              href="https://github.com/lei-rr/aws-pro"
              target="_blank"
              rel="noreferrer"
              class="p-1.5 rounded-md hover:text-foreground hover:bg-accent transition-colors flex items-center justify-center cursor-pointer"
            >
              <svg class="size-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </a>
          </AppTooltip>
        </div>
      </div>
    </footer>
  </div>
</template>
