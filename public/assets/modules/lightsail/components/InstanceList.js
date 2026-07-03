import { regionName } from '../../../shared/utils/format.js';
import InstanceActionSelect from './InstanceActionSelect.js';
import InstanceIpCell from './InstanceIpCell.js';
import { tablePagination } from '../../../shared/utils/pagination.js';

export default {
    name: 'InstanceList',
    components: { InstanceActionSelect, InstanceIpCell },
    props: {
        loading: { type: Boolean, default: false },
        instances: { type: Array, default: () => [] },
        meta: { type: Object, default: () => ({}) },
        regions: { type: Object, default: () => ({}) },
        accountOptions: { type: Array, default: () => [] },
        bundleOptions: { type: Array, default: () => [] }
    },
    emits: ['operate', 'remark'],
    computed: {
        pagination() {
            return tablePagination();
        },
        columns() {
            return [
                {
                    title: '区域',
                    dataIndex: 'region',
                    key: 'region',
                    width: 150,
                    filters: Object.entries(this.regions).map(([id, name]) => ({ text: name, value: id })),
                    onFilter: (value, record) => record.region === value
                },
                { title: '实例', dataIndex: 'name', key: 'name', width: 150 },
                { title: 'IP', key: 'ip', width: 210 },
                {
                    title: '账号',
                    dataIndex: 'account_id',
                    key: 'account_id',
                    width: 170,
                    responsive: ['md'],
                    filters: this.accountOptions.map((account) => ({ text: account, value: account })),
                    onFilter: (value, record) => record.account_id === value
                },
                {
                    title: '套餐',
                    dataIndex: 'bundle_id',
                    key: 'bundle_id',
                    width: 170,
                    responsive: ['lg'],
                    filters: this.bundleOptions.map((bundle) => ({ text: this.bundleFilterLabel(bundle), value: bundle })),
                    onFilter: (value, record) => record.bundle_id === value
                },
                {
                    title: '状态',
                    dataIndex: 'state',
                    key: 'state',
                    width: 100,
                    filters: [{ text: '运行中', value: 'running' }, { text: '已停止', value: 'stopped' }],
                    onFilter: (value, record) => record.state === value
                },
                {
                    title: '静态 IP',
                    key: 'static_ip',
                    width: 120,
                    responsive: ['md'],
                    filters: [{ text: '已绑定', value: 'yes' }, { text: '未绑定', value: 'no' }],
                    onFilter: (value, record) => value === 'yes' ? !!record.static_ip : !record.static_ip
                },
                { title: '备注', dataIndex: 'remark', key: 'remark', width: 140, responsive: ['md'] },
                { title: '操作', key: 'actions', width: 110, align: 'right' }
            ];
        }
    },
    methods: {
        rowKey(row) {
            return `${row.account_id}-${row.region}-${row.name}`;
        },
        regionLabel(id) {
            return regionName(this.regions, id);
        },
        bundleLabel(row) {
            const parts = this.bundleParts(row);

            return parts.length ? parts.join(' ') : (row.bundle_id || '-');
        },
        bundleParts(row) {
            const specs = row.bundle_specs || {};
            const parts = [];
            if (specs.cpu) parts.push(`${this.formatNumber(specs.cpu)}C`);
            if (specs.memory) parts.push(`${this.formatNumber(specs.memory)}G`);
            if (specs.disk) parts.push(`${this.formatNumber(specs.disk)}G`);
            if (specs.transfer) parts.push(`${this.formatNumber(specs.transfer)}T`);

            return parts.length ? parts : [row.bundle_id || '-'];
        },
        bundleFilterLabel(id) {
            const matched = this.instances.find((row) => row.bundle_id === id && Object.keys(row.bundle_specs || {}).length);

            return matched ? this.bundleLabel(matched) : (id || '-');
        },
        formatNumber(value) {
            const number = Number(value || 0);
            return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
        },
        stateLabel(state) {
            const labels = {
                running: '运行中',
                pending: '启动中',
                stopping: '停止中',
                stopped: '已停止',
                terminated: '已终止'
            };
            return labels[state] || state || '-';
        },
        relayOperate(payload) {
            this.$emit('operate', payload.row, payload.action);
        }
    },
    template: `
        <section class="table-section-card">
            <div class="section-toolbar instance-list-toolbar">
                <div>
                    <a-typography-title :level="3" style="margin-bottom: 4px">实例列表</a-typography-title>
                    <a-typography-text type="secondary">同步当前账号和区域后，本地缓存会替换对应范围的数据。</a-typography-text>
                </div>
            </div>

            <a-table
                class="instance-table"
                :row-key="rowKey"
                :loading="loading"
                :columns="columns"
                :data-source="instances"
                :pagination="pagination"
                size="middle"
                :scroll="{ x: 980 }"
                :locale="{ emptyText: '暂无实例，请先选择账号和区域同步。' }"
            >
                <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'ip'">
                        <div class="ip-wrap-cell"><instance-ip-cell :row="record" /></div>
                    </template>
                    <template v-else-if="column.key === 'region'">
                        <div class="region-zone-cell">
                            <span>{{ regionLabel(record.region) }}</span>
                            <span v-if="record.zone" class="region-zone-cell-zone">{{ record.zone }}</span>
                        </div>
                    </template>
                    <template v-else-if="column.key === 'state'">
                        <a-tag :color="record.state === 'running' ? 'success' : 'warning'">{{ stateLabel(record.state) }}</a-tag>
                    </template>
                    <template v-else-if="column.key === 'bundle_id'">
                        {{ bundleParts(record).join('丨') }}
                    </template>
                    <template v-else-if="column.key === 'static_ip'">
                        <a-space size="small">
                            <a-tag :color="record.static_ip ? 'success' : 'default'">{{ record.static_ip ? '已绑定' : '未绑定' }}</a-tag>
                            <a-button v-if="record.static_ip" type="link" danger size="small" style="padding: 0" @click="$emit('operate', record, 'release_static_ip')">释放</a-button>
                            <a-button v-else type="link" size="small" style="padding: 0" @click="$emit('operate', record, 'allocate_static_ip')">获取</a-button>
                        </a-space>
                    </template>
                    <template v-else-if="column.key === 'remark'">
                        <a-button type="link" size="small" style="padding: 0" @click="$emit('remark', record)">{{ record.remark || '添加' }}</a-button>
                    </template>
                    <template v-else-if="column.key === 'actions'">
                        <a-space size="small">
                            <a-button type="link" size="small" style="padding: 0" @click="$emit('remark', record)">编辑</a-button>
                            <instance-action-select :row="record" @operate="relayOperate" />
                        </a-space>
                    </template>
                </template>
            </a-table>
        </section>
    `
};
