import { regionName } from '../../../shared/utils/format.js';
import { message } from '../../../shared/plugins/antDesignVue.js';
import { loadAccounts, useAccountStore } from '../../accounts/store.js';
import { loadConfig, useConfigStore } from '../store/config.js';
import { loadInstances, useLightsailStore } from '../../lightsail/store.js';

export default {
    name: 'DashboardView',
    data() {
        return {
            loading: false
        };
    },
    setup() {
        return {
            accountStore: useAccountStore(),
            configStore: useConfigStore(),
            lightsailStore: useLightsailStore()
        };
    },
    computed: {
        accounts() {
            return this.accountStore.accounts || [];
        },
        instances() {
            return this.lightsailStore.instances || [];
        },
        regions() {
            return this.configStore.config?.regions || {};
        },
        runningCount() {
            return this.instances.filter((item) => item.state === 'running').length;
        },
        staticIpCount() {
            return this.instances.filter((item) => item.static_ip).length;
        },
        stats() {
            return [
                { label: 'AWS 账号', value: this.accounts.length, color: '#1677ff', description: '已配置访问密钥' },
                { label: '实例总数', value: this.instances.length, color: '#2f54eb', description: '本地缓存实例' },
                { label: '运行中', value: this.runningCount, color: '#52c41a', description: '当前运行实例' },
                { label: '静态 IP', value: this.staticIpCount, color: '#fa8c16', description: '已绑定静态 IP' }
            ];
        },
        accountRegionSummary() {
            const map = new Map();
            this.accounts.forEach((account) => {
                const accountId = String(account.id || '');
                if (accountId !== '') {
                    map.set(accountId, this.emptyAccountSummary(accountId));
                }
            });

            this.instances.forEach((item) => {
                const accountId = String(item.account_id || '-');
                const region = String(item.region || '-');
                const row = map.get(accountId) || this.emptyAccountSummary(accountId);
                const regionRow = row.regionMap.get(region) || {
                    key: region,
                    label: this.regionLabel(region),
                    total: 0
                };

                row.total += 1;
                regionRow.total += 1;
                row.regionMap.set(region, regionRow);
                map.set(accountId, row);
            });

            return Array.from(map.values()).map((row) => {
                const regions = Array.from(row.regionMap.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
                return {
                    key: row.accountId,
                    accountId: row.accountId,
                    regionCount: regions.length,
                    total: row.total,
                    regions
                };
            }).sort((a, b) => b.total - a.total || a.accountId.localeCompare(b.accountId));
        }
    },
    async mounted() {
        await this.load();
    },
    methods: {
        async load() {
            this.loading = true;
            try {
                await Promise.all([
                    loadAccounts({ refresh: true }),
                    loadInstances({ refresh: true }),
                    loadConfig({ refresh: true })
                ]);
            } catch (e) {
                message.error(e.message || '加载控制台数据失败');
            } finally {
                this.loading = false;
            }
        },
        regionLabel(id) {
            return regionName(this.regions, id);
        },
        statAvatar(item) {
            return String(item.label || '#').slice(0, 1);
        },
        emptyAccountSummary(accountId) {
            return {
                accountId,
                total: 0,
                regionMap: new Map()
            };
        }
    },
    template: `
        <section>
            <div class="page-toolbar">
                <div>
                    <a-typography-title :level="3" style="margin-bottom: 4px">控制台</a-typography-title>
                    <a-typography-text type="secondary">查看 AWS 账号、实例和区域资源概览。</a-typography-text>
                </div>
                <div class="page-actions"><a-button :loading="loading" @click="load">刷新</a-button></div>
            </div>
            <a-row :gutter="[16, 16]" class="dashboard-stat-grid">
                <a-col v-for="item in stats" :key="item.label" :xs="12" :lg="6">
                    <a-card hoverable class="dashboard-stat-card">
                        <a-card-meta :title="item.label" :description="item.description">
                            <template #avatar>
                                <a-avatar :style="{ background: item.color }">{{ statAvatar(item) }}</a-avatar>
                            </template>
                        </a-card-meta>
                        <a-divider style="margin: 16px 0" />
                        <a-statistic :value="item.value" />
                    </a-card>
                </a-col>
            </a-row>

            <div class="stacked-page">
                <a-spin :spinning="loading">
                    <div class="section-toolbar">
                        <div>
                            <a-typography-title :level="4" style="margin: 0 0 4px">账号与区域资源分布</a-typography-title>
                            <a-typography-text type="secondary">按账号汇总区域数量，并展示每个区域的实例分布。</a-typography-text>
                        </div>
                    </div>
                    <a-empty v-if="!accountRegionSummary.length" description="暂无账号区域资源" />
                    <div v-else class="account-region-grid">
                        <div v-for="record in accountRegionSummary" :key="record.key" class="account-region-card">
                            <div class="account-region-card-head">
                                <div class="account-region-account">{{ record.accountId }}</div>
                                <a-tag color="blue">{{ record.total }} 台</a-tag>
                            </div>
                            <div v-if="record.regions.length" class="account-region-rows">
                                <div v-for="region in record.regions" :key="region.key" class="account-region-row">
                                    <span class="account-region-title">{{ region.label }}</span>
                                    <span class="account-region-count">{{ region.total }} 台</span>
                                </div>
                            </div>
                            <a-typography-text v-else type="secondary">暂无区域</a-typography-text>
                        </div>
                    </div>
                </a-spin>
            </div>
        </section>
    `
};
