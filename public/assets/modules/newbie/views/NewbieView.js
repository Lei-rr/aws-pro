import AccountSelect from '../../accounts/components/AccountSelect.js';
import { newbieApi } from '../api.js';
import { errorMessage } from '../../../shared/utils/errors.js';
import { message, modal } from '../../../shared/plugins/antDesignVue.js';

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
                { value: 'rds', label: 'RDS' }
            ],
            task: null,
            logs: ['等待开始任务...'],
            eventSource: null
        };
    },
    beforeUnmount() {
        this.closeStream();
    },
    computed: {
        canStart() {
            return !!this.accountId && !this.running;
        },
        statusColor() {
            const status = this.task?.status || 'idle';
            if (status === 'completed') return 'success';
            if (status === 'failed') return 'error';
            if (status === 'running') return 'processing';
            return 'default';
        },
        statusText() {
            const labels = {
                idle: '未开始',
                pending: '等待执行',
                running: '执行中',
                completed: '已完成',
                failed: '失败',
            };
            return labels[this.task?.status || 'idle'] || this.task?.status || '未开始';
        },
        selectedStepLabel() {
            return this.stepOptions.find((item) => item.value === this.step)?.label || this.step;
        },
        taskStepLabel() {
            return this.task?.step_label || this.selectedStepLabel;
        }
    },
    methods: {
        confirmStart() {
            if (!this.accountId) {
                message.warning('请选择账号');
                return;
            }
            const isAll = this.step === 'all';
            modal.confirm({
                title: '确认执行新手任务',
                content: isAll
                    ? '任务会固定在 us-east-1 按顺序执行 Budget、EC2、Lambda、RDS，并尝试自动清理临时资源。RDS 可能持续 15 分钟以上。确定开始？'
                    : `任务会固定在 us-east-1 单独执行 ${this.selectedStepLabel}，失败后可重新选择单项重试。确定开始？`,
                okText: '开始执行',
                okType: 'primary',
                cancelText: '取消',
                onOk: () => this.startTask(),
            });
        },
        async startTask() {
            this.loading = true;
            this.logs = [`正在初始化任务（账号: ${this.accountId}，范围: ${this.selectedStepLabel}）...`];
            this.closeStream();
            try {
                const response = await newbieApi.createTask({ account_id: this.accountId, step: this.step });
                this.task = response.data;
                this.openStream(this.task.id);
            } catch (e) {
                message.error(errorMessage(e, '创建新手任务失败'));
                this.logs.push(`创建任务失败：${e.message || e}`);
            } finally {
                this.loading = false;
            }
        },
        openStream(taskId) {
            this.running = true;
            this.eventSource = new EventSource(newbieApi.streamUrl(taskId), { withCredentials: true });
            this.eventSource.onmessage = (event) => {
                this.logs.push(event.data || '');
                this.$nextTick(this.scrollLog);
                if ((event.data || '').includes('执行完毕') || (event.data || '').includes('任务失败')) {
                    this.task = { ...this.task, status: (event.data || '').includes('任务失败') ? 'failed' : 'completed' };
                    this.running = false;
                    this.closeStream();
                }
            };
            this.eventSource.onerror = () => {
                this.logs.push('[连接已断开或任务结束]');
                this.running = false;
                this.closeStream();
            };
        },
        closeStream() {
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
        },
        scrollLog() {
            const el = this.$refs.logBox;
            if (el) el.scrollTop = el.scrollHeight;
        },
        clearLog() {
            this.logs = ['等待开始任务...'];
        }
    },
    template: `
        <div class="stacked-page">
            <section class="operation-toolbar">
                <div class="page-toolbar operation-titlebar">
                    <div>
                        <a-typography-title :level="3" style="margin-bottom: 4px">新手任务</a-typography-title>
                        <a-typography-text type="secondary">固定在 us-east-1 执行全部或单项任务，并输出实时日志。</a-typography-text>
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
                    <a-button :disabled="running" @click="clearLog">清空日志</a-button>
                </div>
            </section>

            <section class="table-section-card">
                <div class="section-toolbar instance-list-toolbar">
                    <div>
                        <a-typography-title :level="3" style="margin-bottom: 4px">实时日志</a-typography-title>
                        <a-typography-text type="secondary">请选择全部或单项执行；如果某一步失败，可选择对应单项重试。请保持页面打开。</a-typography-text>
                    </div>
                </div>
                <pre ref="logBox" class="newbie-log-box"><template v-for="(line, index) in logs" :key="index">{{ line }}\n</template></pre>
            </section>
        </div>
    `
};
