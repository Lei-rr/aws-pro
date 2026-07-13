
<template>
  <a-space direction="vertical" :size="16" style="width:100%">
    <a-typography-title :level="3" style="margin:0">新手任务</a-typography-title>
    <a-card>
      <a-space wrap>
        <AccountSelect v-model="accountId" />
        <a-select v-model:value="step" style="width:220px" :options="stepOptions" />
        <a-button type="primary" :loading="starting" @click="start">开始</a-button>
        <a-button danger :disabled="!taskId" :loading="cancelling" @click="cancel">终止</a-button>
      </a-space>
    </a-card>
    <a-card title="实时日志">
      <pre style="min-height:320px;max-height:60vh;overflow:auto;background:#0b1020;color:#d7e0ff;padding:12px;border-radius:8px">{{ logs || '等待任务输出...' }}</pre>
    </a-card>
  </a-space>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import AccountSelect from '@/shared/components/AccountSelect.vue'
import { newbieApi } from '../api'
import { message } from '@/shared/plugins/antDesignVue'
import { errorMessage } from '@/shared/utils/errors'

const accountId = ref<string>()
const step = ref('all')
const stepOptions = [
  { value: 'all', label: '全部任务' },
  { value: 'budget', label: 'Budget' },
  { value: 'ec2', label: 'EC2' },
  { value: 'lambda', label: 'Lambda' },
  { value: 'rds', label: 'RDS' },
]
const starting = ref(false)
const cancelling = ref(false)
const taskId = ref('')
const logs = ref('')
let es: EventSource | null = null

function append(line: string) {
  logs.value += (logs.value ? '\n' : '') + line
}

async function start() {
  if (!accountId.value) return message.warning('请选择账号')
  starting.value = true
  logs.value = ''
  try {
    const res = await newbieApi.create(accountId.value, step.value)
    taskId.value = (res.data as any).id
    if (es) es.close()
    es = new EventSource(newbieApi.streamUrl(taskId.value), { withCredentials: true } as any)
    es.onmessage = (ev) => append(ev.data)
    es.onerror = () => {
      append('连接结束')
      es?.close()
      es = null
    }
  } catch (e) {
    message.error(errorMessage(e))
  } finally {
    starting.value = false
  }
}

async function cancel() {
  if (!taskId.value) return
  cancelling.value = true
  try {
    await newbieApi.cancel(taskId.value)
    message.success('已请求终止')
  } catch (e) {
    message.error(errorMessage(e))
  } finally {
    cancelling.value = false
  }
}

onBeforeUnmount(() => es?.close())
</script>
