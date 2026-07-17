<template>

        <section>
            <div class="page-toolbar">
                <div>
                    <a-typography-title :level="3" style="margin-bottom: 4px">区域管理</a-typography-title>
                    <a-typography-text type="secondary">使用 AWS Account API 查询账号区域启用状态，并开启未启用区域。</a-typography-text>
                </div>
                <div class="page-actions">
                    <a-space wrap class="aws-inline-controls">
                        <div class="toolbar-control"><account-select v-model="accountId" /></div>
                        <a-button type="primary" :loading="loading" :disabled="!accountId" @click="query(true)">刷新区域</a-button>
                    </a-space>
                </div>
            </div>

            <a-table :row-key="rowKey" :loading="loading" :columns="columns" :data-source="items" :pagination="pagination" size="middle" :scroll="{ x: 610 }" :locale="{ emptyText: '请选择账号后点击刷新按钮查询区域状态。' }">
                <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'region'">{{ regionLabel(record.region) }}</template>
                    <template v-else-if="column.key === 'status'">
                        <a-tag :color="statusMeta(record.status).color">{{ statusMeta(record.status).text }}</a-tag>
                    </template>
                    <template v-else-if="column.key === 'actions'">
                        <a-button v-if="canEnable(record)" type="link" size="small" :loading="enabling === record.region" @click="enableRegion(record)">启用</a-button>
                        <a-typography-text v-else type="secondary">-</a-typography-text>
                    </template>
                </template>
            </a-table>
        </section>
    
</template>

<script>
import AccountSelect from '../../shared/components/AccountSelect.vue';
import { loadConfig, useConfigStore } from '../../shared/stores/config.js';
import { regionsApi } from './api.js';
import { message, modal } from '../../shared/plugins/antDesignVue.js';
import { regionName } from '../../shared/utils/format.js';
import { errorMessage } from '../../shared/utils/errors.js';
import { tablePagination } from '../../shared/utils/pagination.js';
import { apiList, apiObject } from '../../shared/utils/api-data.js';

const STATUS_META = {
    ENABLED: { text: '已启用', color: 'success' },
    ENABLING: { text: '启用中', color: 'processing' },
    DISABLING: { text: '停用中', color: 'warning' },
    DISABLED: { text: '未启用', color: 'default' },
    ENABLED_BY_DEFAULT: { text: '默认启用', color: 'success' }
};

export default {
    name: 'RegionsView',
    components: { AccountSelect },
    data() {
        return {
            loading: false,
            enabling: '',
            accountId: '',
            configuredRegions: {},
            meta: { cached: false },
            loadRequestToken: 0,
            items: [],
            columns: [
                { title: '区域', dataIndex: 'region', key: 'region', width: 220 },
                { title: '区域代码', dataIndex: 'region', key: 'region_code', width: 180 },
                { title: '启用状态', dataIndex: 'status', key: 'status', width: 120 },
                { title: '操作', key: 'actions', width: 90, align: 'center' }
            ]
        };
    },
    computed: {
        pagination() {
            return tablePagination();
        }
    },
    setup() {
        return { configStore: useConfigStore() };
    },
    async mounted() {
        await this.loadRegionConfig();
        // 页面加载时尝试读取缓存
        if (this.accountId) {
            await this.loadFromCache();
        }
    },
    watch: {
        accountId() {
            this.items = [];
            this.meta = { cached: false };
            if (this.accountId) {
                this.loadFromCache();
            }
        }
    },
    methods: {
        async loadRegionConfig() {
            try {
                await loadConfig();
                this.configuredRegions = this.configStore.config?.regions || {};
            } catch (error) {
                message.error(errorMessage(error, '加载区域配置失败'));
            }
        },
        regionLabel(id) {
            return regionName(this.configuredRegions, id);
        },
        statusMeta(status) {
            return STATUS_META[status] || { text: status || '未知', color: 'default' };
        },
        isEnabled(status) {
            return status === 'ENABLED' || status === 'ENABLED_BY_DEFAULT';
        },
        canEnable(row) {
            return row.status === 'DISABLED';
        },
        rowKey(row) {
            return `${row.account_id}:${row.region}`;
        },
        async loadFromCache() {
            if (!this.accountId) {
                return;
            }
            const token = ++this.loadRequestToken;
            try {
                const response = await regionsApi.list(this.accountId, { cache_only: true });
                if (token !== this.loadRequestToken) return;
                const payload = apiObject(response);
                const items = apiList(response, ['items']);
                if (items.length > 0) {
                    this.items = items;
                    this.meta = payload.meta || { cached: true };
                } else {
                    this.meta = { cached: false };
                }
            } catch (error) {
                // 缓存读取失败静默处理
            }
        },
        async query(refresh = false) {
            if (!this.accountId) {
                return;
            }

            this.loading = true;
            const token = ++this.loadRequestToken;
            try {
                const response = await regionsApi.list(this.accountId, { refresh });
                if (token !== this.loadRequestToken) return;
                const payload = apiObject(response);
                this.items = apiList(response, ['items']);
                this.meta = payload.meta || { cached: false };
            } catch (error) {
                if (token !== this.loadRequestToken) return;
                message.error(errorMessage(error, '查询区域失败'));
            } finally {
                if (token === this.loadRequestToken) this.loading = false;
            }
        },
        enableRegion(row) {
            modal.confirm({
                title: '启用区域',
                content: `确定要为当前账号启用 ${this.regionLabel(row.region)} (${row.region}) 吗？AWS 启用区域通常需要等待一段时间。`,
                okText: '启用',
                cancelText: '取消',
                onOk: async () => {
                    this.enabling = row.region;
                    try {
                        await regionsApi.enable({ account_id: this.accountId, region: row.region });
                        message.success('已提交启用请求');
                        await this.query(true);
                    } catch (error) {
                        message.error(errorMessage(error, '启用区域失败'));
                    } finally {
                        this.enabling = '';
                    }
                }
            });
        }
    }
    };
</script>
