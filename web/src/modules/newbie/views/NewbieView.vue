<template>
  <div class="stacked-page">
    <section class="operation-toolbar">
      <div class="page-toolbar operation-titlebar">
        <div>
          <a-typography-title :level="3" style="margin-bottom: 4px">新手任务</a-typography-title>
          <a-typography-text type="secondary"
            >固定在 us-east-1 执行全部或单项任务。任务在后台运行，页面仅只读拉取日志（可关闭页面后回来继续看）。</a-typography-text
          >
        </div>
      </div>
      <div class="operation-controls">
        <div class="toolbar-control"><account-select v-model="accountId" /></div>
        <div class="toolbar-control">
          <a-select v-model:value="step" :disabled="running" style="width: 180px">
            <a-select-option v-for="item in stepOptions" :key="item.value" :value="item.value">{{ item.label }}</a-select-option>
          </a-select>
        </div>
        <a-button type="primary" :loading="loading || running" :disabled="!canStart" @click="confirmStart">开始执行</a-button>
        <a-button danger :disabled="!running" @click="confirmCancel">终止任务</a-button>
        <a-button :disabled="running" @click="clearLog">清空日志</a-button>
      </div>
    </section>

    <section class="table-section-card">
      <div class="section-toolbar instance-list-toolbar">
        <div>
          <a-typography-title :level="3" style="margin-bottom: 4px">实时日志</a-typography-title>
          <a-typography-text type="secondary"
            >状态：{{ statusText }}。日志来自后台任务落盘，SSE 断开不影响执行。</a-typography-text
          >
        </div>
      </div>
      <pre ref="logBox" class="newbie-log-box"><template v-for="(line, index) in logs" :key="index">{{ line }}
</template></pre>
    </section>
  </div>
</template>

<script>
import AccountSelect from '../../../shared/components/AccountSelect.vue'
import { newbieApi } from '../api.js'
import { errorMessage } from '../../../shared/utils/errors.js'
import { message, modal } from '../../../shared/plugins/antDesignVue.js'
import { apiList, apiObject } from '../../../shared/utils/api-data.js';

export default {
  name: 'NewbieView',
  components: { AccountSelect },
  data() {
    return {
      accountId: '',
      loading: false,
      running: false,
      step: 'all',
      stepOptions: [
        { value: 'all', label: '全部任务' },
        { value: 'budget', label: 'Budget' },
        { value: 'ec2', label: 'EC2' },
        { value: 'lambda', label: 'Lambda' },
        { value: 'rds', label: 'RDS' },
      ],
      task: null,
      logs: ['等待开始任务...'],
      eventSource: null,
      pollTimer: null,
      logCursor: 0,
    }
  },
  beforeUnmount() {
    this.stopWatching()
  },
  async mounted() {
    await this.restoreActiveTask()
  },
  computed: {
    canStart() {
      return !!this.accountId && !this.running
    },
    statusText() {
      const labels = {
        idle: '未开始',
        pending: '等待执行',
        running: '执行中',
        cancelling: '终止中',
        cancelled: '已终止',
        completed: '已完成',
        failed: '失败',
      }
      return labels[this.task?.status || 'idle'] || this.task?.status || '未开始'
    },
    selectedStepLabel() {
      return this.stepOptions.find((item) => item.value === this.step)?.label || this.step
    },
  },
  methods: {
    async restoreActiveTask() {
      try {
        const response = await newbieApi.getActiveTask()
        const task = apiObject(response)
        if (!task?.id) return
        this.task = task
        this.accountId = task.account_id || this.accountId
        this.step = task.step || this.step
        this.logs = Array.isArray(task.logs) && task.logs.length ? [...task.logs] : this.logs
        this.logCursor = Array.isArray(task.logs) ? task.logs.length : 0
        if (['pending', 'running', 'cancelling'].includes(task.status)) {
          this.running = true
          this.watchTask(task.id)
        }
      } catch {
        // ignore restore failures
      }
    },
    confirmStart() {
      if (!this.accountId) {
        message.warning('请选择账号')
        return
      }
      const isAll = this.step === 'all'
      modal.confirm({
        title: '确认执行新手任务',
        content: isAll
          ? '任务会固定在 us-east-1 按顺序执行 Budget、EC2、Lambda、RDS，并在后台自动清理临时资源。RDS 可能持续 15 分钟以上。关闭页面不会中断任务。确定开始？'
          : `任务会固定在 us-east-1 单独执行 ${this.selectedStepLabel}，失败后可重新选择单项重试。确定开始？`,
        okText: '开始执行',
        okType: 'primary',
        cancelText: '取消',
        onOk: () => this.startTask(),
      })
    },
    async startTask() {
      this.loading = true
      this.logs = [`正在创建后台任务（账号: ${this.accountId}，范围: ${this.selectedStepLabel}）...`]
      this.stopWatching()
      this.logCursor = 0
      try {
        const response = await newbieApi.createTask({ account_id: this.accountId, step: this.step })
        this.task = apiObject(response)
        this.running = true
        this.watchTask(this.task.id)
      } catch (e) {
        message.error(errorMessage(e, '创建新手任务失败'))
        this.logs.push(`创建任务失败：${e.message || e}`)
        this.running = false
      } finally {
        this.loading = false
      }
    },
    watchTask(taskId) {
      this.openStream(taskId)
      this.startPolling(taskId)
    },
    openStream(taskId) {
      this.closeStream()
      this.eventSource = new EventSource(newbieApi.streamUrl(taskId), { withCredentials: true })
      this.eventSource.onmessage = (event) => {
        this.appendLog(event.data || '')
        this.syncTerminalState(event.data || '')
      }
      this.eventSource.onerror = () => {
        // SSE is read-only; keep polling. Do not mark failed just because stream drops.
        this.closeStream()
      }
    },
    startPolling(taskId) {
      this.stopPolling()
      this.pollTimer = setInterval(() => {
        this.pollTask(taskId)
      }, 2000)
      this.pollTask(taskId)
    },
    async pollTask(taskId) {
      try {
        const response = await newbieApi.getTask(taskId)
        const task = apiObject(response)
        this.task = task
        const logs = Array.isArray(task.logs) ? task.logs : []
        while (this.logCursor < logs.length) {
          this.appendLog(logs[this.logCursor])
          this.logCursor += 1
        }
        if (['completed', 'failed', 'cancelled'].includes(task.status)) {
          this.running = false
          this.stopWatching()
        } else {
          this.running = true
        }
      } catch (e) {
        // keep trying while page open
      }
    },
    appendLog(line) {
      const text = String(line || '')
      if (!text) return
      if (this.logs[this.logs.length - 1] === text) return
      // avoid double-insert when both SSE and poll deliver same line
      if (this.logs.includes(text) && this.logs.slice(-20).includes(text)) return
      this.logs.push(text)
      this.$nextTick(this.scrollLog)
    },
    syncTerminalState(line) {
      if (line.includes('执行完毕')) {
        this.task = { ...this.task, status: 'completed' }
        this.running = false
      } else if (line.includes('任务失败')) {
        this.task = { ...this.task, status: 'failed' }
        this.running = false
      } else if (line.includes('任务已终止')) {
        this.task = { ...this.task, status: 'cancelled' }
        this.running = false
      }
      if (!this.running) this.stopWatching()
    },
    confirmCancel() {
      if (!this.task?.id || !this.running) return
      modal.confirm({
        title: '确认终止新手任务',
        content: '终止会停止后续步骤；已创建的临时资源仍会尽量继续清理。确定终止？',
        okText: '终止任务',
        okType: 'danger',
        cancelText: '继续执行',
        onOk: () => this.cancelTask(),
      })
    },
    async cancelTask() {
      if (!this.task?.id) return
      try {
        const response = await newbieApi.cancelTask(this.task.id)
        this.task = apiObject(response)
        this.appendLog('已发送终止请求，等待当前步骤停止并清理资源...')
      } catch (e) {
        message.error(errorMessage(e, '终止新手任务失败'))
      }
    },
    stopWatching() {
      this.closeStream()
      this.stopPolling()
    },
    closeStream() {
      if (this.eventSource) {
        this.eventSource.close()
        this.eventSource = null
      }
    },
    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
    },
    scrollLog() {
      const el = this.$refs.logBox
      if (el) el.scrollTop = el.scrollHeight
    },
    clearLog() {
      this.logs = ['等待开始任务...']
      this.logCursor = 0
    },
  },
}
</script>
