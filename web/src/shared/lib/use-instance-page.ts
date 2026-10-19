import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { apiList, apiObject } from '@/shared/api/http'
import { copyText } from '@/shared/lib/clipboard'
import { errorMessage } from '@/shared/lib/errors'
import { regionName } from '@/shared/lib/format'
import { createScopeGeneration, type ScopeOwner } from '@/shared/lib/scope-generation'
import { toast } from '@/shared/lib/toast'
import { useListPage } from '@/shared/lib/use-list-page'
import { confirmDialog } from '@/shared/ui/confirm'
import type { AwsInstance } from '@/shared/api/types'

/** 实例页共享的 API 形状：EC2 与 Lightsail 在字段名上不同，但调用签名一致。 */
export type InstancePageApi = {
  instances(params?: Record<string, unknown>): Promise<unknown>
  sync(data: Record<string, unknown>): Promise<unknown>
  action(data: Record<string, unknown>): Promise<unknown>
  updateRemark(data: Record<string, unknown>): Promise<unknown>
}

export type InstanceActionScope = {
  accountId: string
  region: string
  identity: string
  action: string
}

/** 云厂商中间态：实例正在迁移，启停按钮此时不可用。 */
const TRANSIENT_STATES = new Set(['pending', 'stopping', 'starting', 'rebooting', 'shutting-down'])

/** 动作提交后应追到的终态，用于把「停止中」自动刷成「已停止」并放出开机按钮。 */
const SETTLE_STATES: Record<string, string[]> = {
  stop: ['stopped', 'terminated'],
  start: ['running', 'terminated'],
  reboot: ['running'],
  terminate: ['terminated'],
}

const SETTLE_INTERVAL_MS = 4000
const SETTLE_MAX_ATTEMPTS = 30

export type InstancePageOptions = {
  api: InstancePageApi
  pageSizeScope: string
  /** 动作 payload 与备注 payload 中标识实例的字段名：instance_id | instance_name */
  identityField: 'instance_id' | 'instance_name'
  /** 从行数据取标识值（EC2 用 id，Lightsail 用 name） */
  identityOf: (row: AwsInstance) => string
  /** 表格行唯一键 */
  rowKey: (row: AwsInstance) => string
  /** 单行动作忙碌判定的键前缀 */
  actionBusyPrefix: (row: AwsInstance) => string
  actionNames: Record<string, string>
  actionRisks: Record<string, string>
  destructive: string[]
  /** 执行后需要从列表移除的动作名 */
  removeAction: string
  texts: {
    syncDone: (count: number) => string
    syncFail: string
    busyAction: string
    busySync: string
    configFail: string
  }
  /** 一键复制时提取 IP 的优先级；实例字段在不同后端形状下可能是布尔占位 */
  ipOf: (row: AwsInstance) => string | boolean | null | undefined
  /** 页面提供的配置加载（shared 层不可导入 features） */
  ensureConfig: () => Promise<unknown>
  /** scope 切换时让页面复位自己的弹窗状态 */
  onScopeReset?: () => void
  /** 行内 remark 动作由页面处理（页面持有 remark 弹窗与代际） */
  onRemark?: (row: AwsInstance) => void
}

/** EC2 / Lightsail 实例页共用的列表、同步与运维动作逻辑。 */
export function useInstancePage(options: InstancePageOptions) {
  const syncing = ref(false)
  const actionLoadingKey = ref('')
  const actionLoadingLabel = ref('')
  const accountId = ref('')
  const region = ref('')
  const instances = ref<AwsInstance[]>([])
  const syncGeneration = createScopeGeneration()
  const actionGeneration = createScopeGeneration()
  let activeActionToastId: string | number | undefined

  function patchSyncedScope(result: { instances?: AwsInstance[]; account_id?: string; region?: string }) {
    if (!Array.isArray(result.instances) || !result.account_id || !result.region) return
    instances.value = [
      ...instances.value.filter((item) => item.account_id !== result.account_id || item.region !== result.region),
      ...result.instances,
    ]
  }

  const { loading, refreshing, runLoad, fail } = useListPage({
    pageSizeScope: options.pageSizeScope,
    load: async (loadOptions = {}) => {
      try {
        // 表格始终显示全部已缓存实例，不按顶部下拉过滤
        const response = await options.api.instances({})
        if (loadOptions.isLatest && !loadOptions.isLatest()) return false
        instances.value = apiList<AwsInstance>(response, ['items'])
      } catch (e) {
        if (loadOptions.isLatest && !loadOptions.isLatest()) return false
        fail(e)
        return false
      }
    },
  })

  const busy = computed(() => loading.value || syncing.value || !!actionLoadingKey.value)

  watch([accountId, region], () => {
    syncGeneration.invalidate()
    actionGeneration.invalidate()
    if (activeActionToastId !== undefined) toast.dismiss(activeActionToastId)
    activeActionToastId = undefined
    syncing.value = false
    actionLoadingKey.value = ''
    actionLoadingLabel.value = ''
    options.onScopeReset?.()
    // 不再按下拉过滤表格，保持当前全部实例显示
  })

  function isRowActionBusy(row: AwsInstance) {
    return actionLoadingKey.value.startsWith(options.actionBusyPrefix(row))
  }

  async function sync() {
    if (!accountId.value || !region.value) {
      toast.warning('请选择账号和区域')
      return
    }
    if (syncing.value) {
      toast.warning(options.texts.busySync)
      return
    }
    const owner = syncGeneration.claim({ accountId: accountId.value, region: region.value })
    const { accountId: scopeAccountId, region: scopeRegion } = owner.value
    syncing.value = true
    try {
      const result = apiObject(await options.api.sync({ account_id: scopeAccountId, region: scopeRegion })) as {
        count?: number
        instances?: AwsInstance[]
        account_id?: string
        region?: string
        warnings?: Array<{ message?: string }>
      }
      if (!owner.active() || scopeAccountId !== accountId.value || scopeRegion !== region.value) return
      patchSyncedScope(result)
      toast.success(options.texts.syncDone(result.count ?? 0))
      for (const warning of result.warnings || []) {
        toast.warning(warning.message || '同步存在部分警告')
      }
    } catch (e) {
      if (!owner.active() || scopeAccountId !== accountId.value || scopeRegion !== region.value) return
      toast.error(errorMessage(e, options.texts.syncFail))
    } finally {
      if (owner.active()) syncing.value = false
    }
  }

  async function onCreated() {
    await runLoad({ silent: true })
  }

  async function operate(row: AwsInstance, action: string) {
    if (action === 'remark') {
      options.onRemark?.(row)
      return
    }
    if (syncing.value || actionLoadingKey.value) {
      toast.warning(syncing.value ? options.texts.busySync : options.texts.busyAction)
      return
    }
    const identity = options.identityOf(row)
    const owner = actionGeneration.claim({
      accountId: String(row.account_id || ''),
      region: String(row.region || ''),
      identity,
      action,
    })
    const name = options.actionNames[action] || action
    const risk = options.actionRisks[action] || ''
    const ok = await confirmDialog({
      title: `确认${name}`,
      description: `确定对 ${row.name || identity} 执行“${name}”？\n${risk}`,
      confirmText: '确认',
      cancelText: '取消',
      destructive: options.destructive.includes(action),
    })
    if (
      !ok ||
      !owner.active() ||
      String(row.account_id) !== owner.value.accountId ||
      String(row.region) !== owner.value.region ||
      identity !== owner.value.identity ||
      action !== owner.value.action
    )
      return
    await runAction(row, action, owner)
  }

  async function syncAfterAction(owner: ScopeOwner<InstanceActionScope>) {
    const { accountId: scopeAccountId, region: targetRegion } = owner.value
    try {
      const result = apiObject(await options.api.sync({ account_id: scopeAccountId, region: targetRegion })) as {
        instances?: AwsInstance[]
        account_id?: string
        region?: string
      }
      if (!owner.active()) return
      patchSyncedScope(result)
    } catch (error) {
      if (!owner.active()) return
      toast.warning(errorMessage(error, '操作已提交，但同步列表失败'))
    }
  }

  /** 静默同步单个 scope：不弹 toast，失败只抛出由调用方决定。 */
  async function syncScopeQuiet(accountId: string, region: string) {
    const result = apiObject(await options.api.sync({ account_id: accountId, region })) as {
      instances?: AwsInstance[]
      account_id?: string
      region?: string
    }
    patchSyncedScope(result)
    return result
  }

  /**
   * 启停是异步的：提交后厂商先返回 stopping/pending，列表若停在中间态就只剩「终止」。
   * 这里轮询到终态，把「启动」按钮真正放出来。
   */
  async function followSettle(owner: ScopeOwner<InstanceActionScope>, action: string) {
    const targets = SETTLE_STATES[action]
    if (!targets) return
    const { accountId: scopeAccountId, region: scopeRegion, identity } = owner.value
    for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS))
      if (!owner.active()) return
      try {
        const result = await syncScopeQuiet(scopeAccountId, scopeRegion)
        if (!owner.active()) return
        const row = (result.instances || []).find((item) => options.identityOf(item) === identity)
        if (!row || targets.includes(String(row.state || ''))) return
      } catch {
        return
      }
    }
  }

  /** 进入页面时若本地缓存停在中间态（上次停止未追平），补一次静默同步。 */
  async function settleCachedTransient() {
    const scopes = new Map<string, { accountId: string; region: string }>()
    for (const row of instances.value) {
      if (!TRANSIENT_STATES.has(String(row.state || ''))) continue
      if (!row.account_id || !row.region) continue
      scopes.set(`${row.account_id}|${row.region}`, {
        accountId: String(row.account_id),
        region: String(row.region),
      })
    }
    for (const scope of scopes.values()) {
      try {
        await syncScopeQuiet(scope.accountId, scope.region)
      } catch {
        /* 缓存追平失败不打扰用户，手动同步仍可用 */
      }
    }
  }

  async function runAction(row: AwsInstance, action: string, owner: ScopeOwner<InstanceActionScope>) {
    const identity = options.identityOf(row)
    const key = `${options.actionBusyPrefix(row)}${action}`
    if (actionLoadingKey.value) {
      toast.warning(options.texts.busyAction)
      return
    }
    const name = options.actionNames[action] || action
    const target = String(row.name || identity)
    actionLoadingKey.value = key
    actionLoadingLabel.value = `${name}中`
    const loadingToastId = toast.loading(`正在${name} ${target}…`)
    activeActionToastId = loadingToastId
    try {
      const response = await options.api.action({
        [options.identityField]: identity,
        account_id: row.account_id,
        region: row.region,
        action,
        confirm: action,
      })
      if (!owner.active()) return
      toast.success((apiObject(response) as { message?: string }).message || `${name}已提交`)
      if (action === options.removeAction) {
        instances.value = instances.value.filter((item) => options.rowKey(item) !== options.rowKey(row))
      }
      await syncAfterAction(owner)
      // 提交成功后异步追平中间态，让「启动/停止」按钮随真实状态切换
      if (owner.active()) void followSettle(owner, action)
    } catch (e) {
      if (owner.active()) toast.error(errorMessage(e, `${name}失败`))
    } finally {
      toast.dismiss(loadingToastId)
      if (activeActionToastId === loadingToastId) activeActionToastId = undefined
      if (owner.active()) {
        actionLoadingKey.value = ''
        actionLoadingLabel.value = ''
      }
    }
  }

  async function copyInstanceList(regions: Record<string, string>) {
    const lines = instances.value
      .map((row) => {
        const ip = options.ipOf(row)
        return ip ? `${ip} | root | pass | ${regionName(regions, row.region)} | ${row.account_id}` : ''
      })
      .filter(Boolean)
    if (!lines.length) {
      toast.warning('没有可复制的实例 IP')
      return
    }
    await copyText(lines.join('\r\n'))
  }

  onMounted(async () => {
    try {
      await options.ensureConfig()
    } catch (e) {
      toast.error(errorMessage(e, options.texts.configFail))
    }
    await runLoad()
    void settleCachedTransient()
  })

  onBeforeUnmount(() => {
    syncGeneration.invalidate()
    actionGeneration.invalidate()
    if (activeActionToastId !== undefined) toast.dismiss(activeActionToastId)
  })

  return {
    syncing,
    actionLoadingKey,
    actionLoadingLabel,
    accountId,
    region,
    instances,
    loading,
    refreshing,
    busy,
    runLoad,
    sync,
    onCreated,
    operate,
    runAction,
    copyInstanceList,
    isRowActionBusy,
  }
}
