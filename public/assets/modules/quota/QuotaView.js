import AccountSelect from '../accounts/components/AccountSelect.js';
import RegionSelect from '../system/components/RegionSelect.js';
import { quotaApi } from './api.js';
import { regionName } from '../../shared/utils/format.js';
import { message } from '../../shared/plugins/antDesignVue.js';
import { tablePagination } from '../../shared/utils/pagination.js';

export default {
    name: 'QuotaView',
    components: { AccountSelect, RegionSelect },
    data() {
        return {
            loading: false,
            accountId: '',
            region: '',
            regions: {},
            items: [],
            columns: [
                { title: '配额名称', dataIndex: 'name', key: 'name' },
                { title: '账号', dataIndex: 'account_id', key: 'account_id', width: 220 },
                { title: '区域', dataIndex: 'region', key: 'region', width: 180 },
                { title: '值', dataIndex: 'value', key: 'value', width: 100 }
            ]
        };
    },
    computed: {
        pagination() {
            return tablePagination();
        }
    },
    async mounted() {
        // 页面加载时尝试读取缓存
        if (this.accountId && this.region) {
            await this.loadFromCache();
        }
    },
    watch: {
        accountId() {
            this.items = [];
            if (this.accountId && this.region) {
                this.loadFromCache();
            }
        },
        region() {
            this.items = [];
            if (this.accountId && this.region) {
                this.loadFromCache();
            }
        }
    },
    methods: {
        regionLabel(id) {
            return regionName(this.regions, id);
        },
        rowKey(row) {
            return `${row.account_id}:${row.region}:${row.name}`;
        },
        async loadFromCache() {
            if (!this.accountId || !this.region) {
                return;
            }
            try {
                const response = await quotaApi.vcpu(
                    { account_id: this.accountId, region: this.region },
                    { cache_only: true }
                );
                if (response.data && response.data.length > 0) {
                    this.items = response.data;
                }
            } catch (e) {
                // 缓存读取失败静默处理
            }
        },
        async query(refresh = false) {
            if (!this.accountId || !this.region) {
                message.warning('请选择账号和区域');
                return;
            }
            this.loading = true;
            try {
                const response = await quotaApi.vcpu(
                    { account_id: this.accountId, region: this.region },
                    { refresh }
                );
                this.items = response.data;
            } catch (e) {
                message.error(e.message || '查询失败');
            } finally {
                this.loading = false;
            }
        }
    },
    template: `
        <section>
            <div class="page-toolbar">
                <div>
                    <a-typography-title :level="3" style="margin-bottom: 4px">vCPU 配额</a-typography-title>
                    <a-typography-text type="secondary">按账号和区域查询 Lightsail 相关服务配额。</a-typography-text>
                </div>
                <div class="page-actions">
                    <a-space wrap class="aws-inline-controls">
                        <div class="toolbar-control"><account-select v-model="accountId" /></div>
                        <div class="toolbar-control"><region-select v-model="region" @loaded="regions = $event" /></div>
                        <a-button type="primary" :loading="loading" :disabled="!accountId || !region" @click="query(true)">刷新配额</a-button>
                    </a-space>
                </div>
            </div>
            <a-table :row-key="rowKey" :loading="loading" :columns="columns" :data-source="items" :pagination="pagination" size="middle" :scroll="{ x: 760 }" :locale="{ emptyText: '请选择账号和区域后点击刷新按钮查询 vCPU 配额。' }">
                <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'region'">{{ regionLabel(record.region) }}</template>
                    <template v-else-if="column.key === 'value'"><a-tag :color="record.error ? 'error' : 'blue'">{{ record.error ? '查询失败' : record.value }}</a-tag></template>
                </template>
            </a-table>
        </section>
    `
};
