<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { PageHeader } from '@/shared/ui/page-header'
import { Button } from '@/shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { JobProgressAlert } from '@/shared/ui/job-progress'
import AccountSelect from '@/shared/components/AccountSelect.vue'
import { newbieApi } from '@/features/newbie/api/newbie'
import { apiObject } from '@/shared/api/http'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { confirmDialog } from '@/shared/ui/confirm'

const accountId = ref('')
const loading = ref(false)
const running = ref(false)
const step = ref('all')
const stepOptions = [
  { value: 'all', label: '全部任务' },
  { value: 'budget', label: 'Budget' },
  { value: 'ec2', label: 'EC2' },
  { value: 'lambda', label: 'Lambda' },
  { value: 'rds', label: 'RDS' },
]
const task = ref<any>(null)
const logs = ref<string[]>(['等待开始任务...'])
const logBox = ref<HTMLElement | null>(null)
let eventSource: EventSource | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let logCursor = 0

const canStart = computed(() => !!accountId.value && !running.value)
const selectedStepLabel = computed(
  () => stepOptions.find((i) => i.value === step.value)?.label || step.value,
)
const statusText = computed(() => {
  const labels: Record<string, string> = {
    idle: '未开始',
    pending: '等待执行',
    running: '执行中',
    cancelling: '终止中',
    cancelled: '已终止',
    completed: '已完成',
    failed: '失败',
  }
  return labels[task.value?.status || 'idle'] || task.value?.status || '未开始'
})

/** 进度条/状态条：失败后仍展示结果，不只在 running 时出现 */
const progressRunning = computed(() => running.value)
const progressText = computed(() => {
  if (running.value) return statusText.value
  if (task.value?.status === 'failed') {
    return humanizeAwsCredentialError(task.value?.message) || task.value?.message || '执行失败'
  }
  if (task.value?.status === 'completed') return '已完成'
  if (task.value?.status === 'cancelled') return '已终止'
  return ''
})
const progressStatus = computed(() => String(task.value?.status || ''))

function appendLog(line: string) {
  const text = String(line || '')
  if (!text) return
  if (logs.value[logs.value.length - 1] === text) return
  if (logs.value.slice(-20).includes(text)) return
  logs.value.push(text)
  void nextTick(() => {
    if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight
  })
}

function closeStream() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
function stopWatching() {
  closeStream()
  stopPolling()
}

async function pollTask(taskId: string) {
  try {
    const response = await newbieApi.getTask(taskId)
    const t = apiObject(response) as any
    task.value = t
    const list = Array.isArray(t.logs) ? t.logs : []
    while (logCursor < list.length) {
      appendLog(list[logCursor])
      logCursor += 1
    }
    if (['completed', 'failed', 'cancelled'].includes(t.status)) {
      running.value = false
      stopWatching()
      notifyTerminal(t.status, t.message || list[list.length - 1] || '')
    } else {
      running.value = true
    }
  } catch (e) {
    // 任务已创建后轮询失败也要写进日志，避免「没反应」
    appendLog(`拉取任务状态失败：${errorMessage(e, '网络错误')}`)
  }
}

function openStream(taskId: string) {
  closeStream()
  eventSource = new EventSource(newbieApi.streamUrl(taskId), { withCredentials: true } as any)
  eventSource.onmessage = (event) => {
    appendLog(event.data || '')
    syncTerminalState(event.data || '')
  }
  eventSource.onerror = () => {
    closeStream()
  }
}

function watchTask(taskId: string) {
  openStream(taskId)
  stopPolling()
  pollTimer = setInterval(() => void pollTask(taskId), 2000)
  void pollTask(taskId)
}

let terminalNotified = false
function notifyTerminal(status: string, message: string) {
  if (terminalNotified) return
  terminalNotified = true
  const msg = humanizeAwsCredentialError(message) || message
  if (status === 'failed') {
    toast.error(msg || '新手任务执行失败')
  } else if (status === 'cancelled') {
    toast.warning(msg || '新手任务已终止')
  } else if (status === 'completed') {
    toast.success(msg || '新手任务已完成')
  }
}

/** AWS 密钥/会话失效类错误 → 中文提示 */
function humanizeAwsCredentialError(raw: unknown): string {
  const text = String(raw || '')
  if (!text) return ''
  if (
    /security token.*invalid|invalid.*security token|InvalidClientTokenId|UnrecognizedClientException|ExpiredToken|invalid.*access.?key|The security token included in the request is invalid/i.test(
      text,
    )
  ) {
    return 'AWS 账号密钥无效或已失效，请到「账号管理」重新填写 Access Key / Secret Key 后再试'
  }
  if (/could not load credentials|Missing credentials|credentials/i.test(text) && /invalid|missing|not found/i.test(text)) {
    return 'AWS 账号凭证缺失或无效，请到「账号管理」检查密钥'
  }
  if (/任务失败：/.test(text)) {
    const rest = text.replace(/^.*任务失败：/, '')
    const better = humanizeAwsCredentialError(rest)
    return better || text
  }
  return ''
}

function syncTerminalState(line: string) {
  if (line.includes('执行完毕')) {
    task.value = { ...task.value, status: 'completed' }
    running.value = false
    notifyTerminal('completed', line)
  } else if (line.includes('任务失败')) {
    task.value = { ...task.value, status: 'failed' }
    running.value = false
    notifyTerminal('failed', line)
  } else if (line.includes('任务已终止')) {
    task.value = { ...task.value, status: 'cancelled' }
    running.value = false
    notifyTerminal('cancelled', line)
  }
  if (!running.value) stopWatching()
}

async function restoreActiveTask() {
  try {
    const response = await newbieApi.getActiveTask()
    const t = apiObject(response) as any
    if (!t?.id) return
    task.value = t
    accountId.value = t.account_id || accountId.value
    step.value = t.step || step.value
    logs.value = Array.isArray(t.logs) && t.logs.length ? [...t.logs] : logs.value
    logCursor = Array.isArray(t.logs) ? t.logs.length : 0
    if (['pending', 'running', 'cancelling'].includes(t.status)) {
      running.value = true
      terminalNotified = false
      watchTask(t.id)
    } else if (t.status === 'failed') {
      // 打开页面时已有失败任务：直接展示日志 + 提示一次
      notifyTerminal('failed', t.message || (t.logs || []).slice(-1)[0] || '')
    }
  } catch {
    /* ignore */
  }
}

async function startTask() {
  loading.value = true
  terminalNotified = false
  logs.value = [`正在创建后台任务（账号: ${accountId.value}，范围: ${selectedStepLabel.value}）...`]
  stopWatching()
  logCursor = 0
  task.value = null
  try {
    const response = await newbieApi.createTask({ account_id: accountId.value, step: step.value })
    const created = apiObject(response) as any
    task.value = created
    // 立即用服务端初始日志覆盖，避免只有「正在创建」
    if (Array.isArray(created.logs) && created.logs.length) {
      logs.value = [...created.logs]
      logCursor = created.logs.length
    } else {
      appendLog('任务已创建，等待后台执行...')
      logCursor = logs.value.length
    }
    if (!created?.id) {
      toast.error('创建成功但未返回任务 ID')
      appendLog('创建成功但未返回任务 ID，无法拉取日志')
      running.value = false
      return
    }
    running.value = true
    watchTask(String(created.id))
  } catch (e) {
    const msg = errorMessage(e, '创建新手任务失败')
    toast.error(msg)
    appendLog(`创建任务失败：${msg}`)
    running.value = false
  } finally {
    loading.value = false
  }
}

async function confirmStart() {
  if (!accountId.value) {
    toast.warning('请选择账号')
    return
  }
  const isAll = step.value === 'all'
  if (
    !(await confirmDialog({
      title: '确认执行新手任务',
      description: isAll
        ? '任务会固定在 us-east-1 按顺序执行 Budget、EC2、Lambda、RDS，并在后台自动清理临时资源。RDS 可能持续 15 分钟以上。关闭页面不会中断任务。确定开始？'
        : `任务会固定在 us-east-1 单独执行 ${selectedStepLabel.value}，失败后可重新选择单项重试。确定开始？`,
      confirmText: '开始执行',
      destructive: false,
    }))
  )
    return
  await startTask()
}

async function cancelTask() {
  if (!task.value?.id) return
  try {
    const response = await newbieApi.cancelTask(String(task.value.id))
    task.value = apiObject(response)
    appendLog('已发送终止请求，等待当前步骤停止并清理资源...')
  } catch (e) {
    toast.error(errorMessage(e, '终止新手任务失败'))
  }
}

async function confirmCancel() {
  if (!task.value?.id || !running.value) return
  if (
    !(await confirmDialog({
      title: '确认终止新手任务',
      description: '终止会停止后续步骤；已创建的临时资源仍会尽量继续清理。确定终止？',
      confirmText: '终止任务',
      destructive: true,
    }))
  )
    return
  await cancelTask()
}

function clearLog() {
  logs.value = ['等待开始任务...']
  logCursor = 0
}

onMounted(() => void restoreActiveTask())
onBeforeUnmount(() => stopWatching())
</script>

<template>
  <div class="flex flex-1 flex-col gap-4">
    <PageHeader
      title="新手任务"
      description="固定在 us-east-1 执行全部或单项任务。任务在后台运行，页面仅只读拉取日志（可关闭页面后回来继续看）。"
    />

    <!-- 独立操作区：无边框模块 -->
    <div class="space-y-3">
      <div>
        <h2 class="text-base font-semibold">任务配置</h2>
        <p class="text-muted-foreground text-sm">
          选择账号与执行范围后开始；运行中可终止，日志可单独清空。
        </p>
      </div>
      <FieldGroup class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field>
          <FieldLabel>AWS 账号</FieldLabel>
          <AccountSelect v-model="accountId" />
        </Field>
        <Field>
          <FieldLabel>任务范围</FieldLabel>
          <Select v-model="step" :disabled="running">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="选择任务" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="item in stepOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field class="sm:col-span-2 lg:col-span-1">
          <FieldLabel class="opacity-0 max-lg:hidden">操作</FieldLabel>
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" :loading="loading || running" :disabled="!canStart" @click="confirmStart">
              开始执行
            </Button>
            <Button
              size="sm"
              variant="outline"
              class="text-destructive"
              :disabled="!running"
              @click="confirmCancel"
            >
              终止任务
            </Button>
            <Button size="sm" variant="outline" :disabled="running" @click="clearLog">
              清空日志
            </Button>
          </div>
        </Field>
      </FieldGroup>
    </div>

    <JobProgressAlert
      :running="progressRunning"
      :text="progressText"
      :status="progressStatus"
      title="新手任务"
    />

    <div class="space-y-2">
      <div>
        <h2 class="text-base font-semibold">实时日志</h2>
        <p class="text-muted-foreground text-sm">
          状态：{{ statusText }}。日志来自后台任务落盘，SSE 断开不影响执行。
        </p>
      </div>
      <pre
        ref="logBox"
        class="max-h-[28rem] overflow-auto rounded-lg bg-neutral-950 p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-neutral-100"
      >{{ logs.join('\n') }}</pre>
    </div>
  </div>
</template>
