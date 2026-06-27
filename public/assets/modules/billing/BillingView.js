import AccountSelect from '../accounts/components/AccountSelect.js';
import { billingApi } from './api.js';
import { message } from '../../shared/plugins/antDesignVue.js';
import { tablePagination } from '../../shared/utils/pagination.js';

export default {
    name: 'BillingView',
    components: { AccountSelect },
    data() {
        return {
            loading: false,
            accountId: '',
            bills: [],
            summary: { total_cost: 0, total_credit: 0 },
            columns: [
                { title: '账号', dataIndex: 'account_id', key: 'account_id', width: 220 },
                { title: '月份', dataIndex: 'month', key: 'month', width: 120 },
                { title: '费用', dataIndex: 'cost', key: 'cost', width: 120 },
                { title: '抵扣', dataIndex: 'credit', key: 'credit', width: 120 },
                { title: '币种', dataIndex: 'unit', key: 'unit', width: 100 }
            ]
        };
    },
    computed: {
        tableRows() {
            if (!this.bills.length) return [];
            return [
                {
                    month: '__summary__',
                    account_id: '合计',
                    cost: this.summary.total_cost,
                    credit: this.summary.total_credit,
                    unit: 'USD',
                    months: this.bills.length,
                    summary: true
                },
                ...this.bills
            ];
        },
        pagination() {
            return tablePagination();
        }
    },
    async mounted() {
        // 页面加载时尝试读取缓存
        if (this.accountId) {
            await this.loadFromCache();
        }
    },
    watch: {
        accountId() {
            this.bills = [];
            this.summary = { total_cost: 0, total_credit: 0 };
            if (this.accountId) {
                this.loadFromCache();
            }
        }
    },
    methods: {
        money(value) {
            const number = Number(value || 0);
            return number.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        },
        async loadFromCache() {
            if (!this.accountId) {
                return;
            }
            try {
                const response = await billingApi.yearly(
                    { account_id: this.accountId },
                    { cache_only: true }
                );
                const billing = response.data;
                if (billing && billing.items && billing.items.length > 0) {
                    this.bills = billing.items;
                    this.summary = { total_cost: billing.total_cost || 0, total_credit: billing.total_credit || 0 };
                }
            } catch (e) {
                // 缓存读取失败静默处理
            }
        },
        async query(refresh = false) {
            if (!this.accountId) {
                message.warning('请选择账号');
                return;
            }
            this.loading = true;
            try {
                const response = await billingApi.yearly(
                    { account_id: this.accountId },
                    { refresh }
                );
                const billing = response.data;
                this.bills = billing.items || [];
                this.summary = { total_cost: billing.total_cost || 0, total_credit: billing.total_credit || 0 };
            } catch (e) {
                message.error(e.message || '查询失败');
            } finally {
                this.loading = false;
            }
        }
    },
    template: `
        <div class="stacked-page">
            <section>
                <div class="page-toolbar">
                    <div>
                        <a-typography-title :level="3" style="margin-bottom: 4px">账单概览</a-typography-title>
                        <a-typography-text type="secondary">查询最近 12 个完整月和当月费用。</a-typography-text>
                </div>
                <div class="page-actions">
                    <a-space wrap class="aws-inline-controls">
                        <div class="toolbar-control"><account-select v-model="accountId" /></div>
                        <a-button type="primary" :loading="loading" :disabled="!accountId" @click="query(true)">刷新账单</a-button>
                    </a-space>
                </div>
                </div>
                <a-table row-key="month" :loading="loading" :columns="columns" :data-source="tableRows" :pagination="pagination" size="middle" :scroll="{ x: 760 }" :row-class-name="record => record.summary ? 'billing-summary-row' : ''" :locale="{ emptyText: '请选择账号后点击刷新按钮查询账单。' }">
                    <template #bodyCell="{ column, record }">
                        <template v-if="record.summary && column.key === 'month'">{{ record.months }} 个月</template>
                        <template v-else-if="column.key === 'cost'">$ {{ money(record.cost) }}</template>
                        <template v-else-if="column.key === 'credit'">$ {{ money(record.credit) }}</template>
                    </template>
                </a-table>
            </section>
        </div>
    `
};
