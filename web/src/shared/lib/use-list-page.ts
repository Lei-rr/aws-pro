import { onScopeDispose, ref, type Ref } from 'vue'
import { loadPageSize, savePageSize } from '@/shared/lib/page-size'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'

type LoadContext = {
  refresh?: boolean
  isLatest?: () => boolean
}

type LoadFn = (options?: LoadContext) => Promise<boolean | void>

/** Shared list ownership: latest request and live component alone may commit UI feedback. */
export function useListPage(options: { pageSizeScope: string; defaultPageSize?: number; load: LoadFn }) {
  const loading = ref(false)
  const refreshing = ref(false)
  const pageSize = ref(loadPageSize(options.pageSizeScope, options.defaultPageSize ?? 20))
  let requestVersion = 0
  let refreshVersion = 0
  let activeLoads = 0
  let disposed = false

  function claimLoad(refresh?: boolean) {
    if (!refresh && refreshing.value) {
      refreshVersion += 1
      refreshing.value = false
    }
    const version = ++requestVersion
    const isLatest = () => !disposed && version === requestVersion
    return { version, isLatest }
  }

  async function trackedLoad(refresh?: boolean) {
    const owner = claimLoad(refresh)
    activeLoads += 1
    if (!disposed) loading.value = true
    try {
      const result = await options.load({ refresh, isLatest: owner.isLatest })
      return { succeeded: result !== false, isLatest: owner.isLatest }
    } finally {
      activeLoads -= 1
      if (!disposed) loading.value = activeLoads > 0
    }
  }

  async function runLoad(opts: { refresh?: boolean; silent?: boolean } = {}) {
    await trackedLoad(opts.refresh)
  }

  async function onRefresh() {
    if (disposed || refreshing.value || loading.value) return
    const owner = ++refreshVersion
    refreshing.value = true
    const started = Date.now()
    try {
      const load = await trackedLoad(true)
      if (!load.succeeded || !load.isLatest() || owner !== refreshVersion) return
      const wait = Math.max(0, 120 - (Date.now() - started))
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
      if (!load.isLatest() || owner !== refreshVersion) return
      toast.success('已刷新')
    } finally {
      if (!disposed && owner === refreshVersion) refreshing.value = false
    }
  }

  function onPageSizeChange(next: number) {
    if (disposed) return
    pageSize.value = next
    savePageSize(options.pageSizeScope, next)
  }

  function fail(error: unknown) {
    if (!disposed) toast.error(errorMessage(error))
  }

  onScopeDispose(() => {
    disposed = true
    requestVersion += 1
    refreshVersion += 1
  })

  return {
    loading,
    refreshing,
    pageSize,
    runLoad,
    onRefresh,
    onPageSizeChange,
    fail,
  }
}

export type ListPageControls = {
  loading: Ref<boolean>
  refreshing: Ref<boolean>
  pageSize: Ref<number>
}
