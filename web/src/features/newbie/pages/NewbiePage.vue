<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { PageHeader } from '@/shared/ui/page-header'
import { Button } from '@/shared/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card'
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

function syncTerminalState(line: string) {
  if (line.includes('执行完毕')) {
    task.value = { ...task.value, status: 'completed' }
    running.value = false
  } else if (line.includes('任务失败')) {
    task.value = { ...task.value, status: 'failed' }
    running.value = false
  } else if (line.includes('任务已终止')) {
    task.value = { ...task.value, status: 'cancelled' }
    running.value = false
  }
  if (!running.value) stopWatching()
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
    } else {
      running.value = true
    }
  } catch {
    /* keep trying */
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
      watchTask(t.id)
    }
  } catch {
    /* ignore */
  }
}

async function startTask() {
  loading.value = true
  logs.value = [`正在创建后台任务（账号: ${accountId.value}，范围: ${selectedStepLabel.value}）...`]
  stopWatching()
  logCursor = 0
  try {
    const response = await newbieApi.createTask({ account_id: accountId.value, step: step.value })
    task.value = apiObject(response)
    running.value = true
    watchTask(String(task.value.id))
  } catch (e) {
    toast.error(errorMessage(e, '创建新手任务失败'))
    logs.value.push(`创建任务失败：${(e as Error).message || e}`)
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

    <!-- 独立操作模块：账号 / 任务范围 / 执行控制 -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="text-base">任务配置</CardTitle>
        <CardDescription>选择账号与执行范围后开始；运行中可终止，日志可单独清空。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
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
      </CardContent>
    </Card>

    <JobProgressAlert :running="running" :text="running ? statusText : ''" title="新手任务" />

    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="text-base">实时日志</CardTitle>
        <CardDescription>
          状态：{{ statusText }}。日志来自后台任务落盘，SSE 断开不影响执行。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre
          ref="logBox"
          class="bg-muted/40 max-h-[28rem] overflow-auto rounded-lg p-3 font-mono text-xs leading-5 whitespace-pre-wrap"
        >{{ logs.join('\n') }}</pre>
      </CardContent>
    </Card>
  </div>
</template>
