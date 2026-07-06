import { regionName } from '../../../shared/utils/format.js';
import { tablePagination } from '../../../shared/utils/pagination.js';
import Ec2ActionSelect from './Ec2ActionSelect.js';
import Ec2IpCell from './Ec2IpCell.js';

export default {
    name: 'Ec2List',
    components: { Ec2ActionSelect, Ec2IpCell },
    props: {
        loading: { type: Boolean, default: false },
        instances: { type: Array, default: () => [] },
        regions: { type: Object, default: () => ({}) },
        accountOptions: { type: Array, default: () => [] },
        typeOptions: { type: Array, default: () => [] }
    },
    emits: ['operate'],
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
                { title: '实例', key: 'instance', width: 190 },
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
                    title: '规格',
                    dataIndex: 'instance_type',
                    key: 'instance_type',
                    width: 130,
                    responsive: ['lg'],
                    filters: this.typeOptions.map((type) => ({ text: type, value: type })),
                    onFilter: (value, record) => record.instance_type === value
                },
                {
                    title: '状态',
                    dataIndex: 'state',
                    key: 'state',
                    width: 100,
                    filters: [{ text: '运行中', value: 'running' }, { text: '已停止', value: 'stopped' }],
                    onFilter: (value, record) => record.state === value
                },
                { title: '启动时间', dataIndex: 'launched_at', key: 'launched_at', width: 160, responsive: ['lg'] },
                { title: '操作', key: 'actions', width: 110, align: 'right' }
            ];
        }
    },
    methods: {
        rowKey(row) {
            return `${row.account_id}-${row.region}-${row.id}`;
        },
        regionLabel(id) {
            return regionName(this.regions, id);
        },
        stateLabel(state) {
            const labels = {
                pending: '启动中',
                running: '运行中',
                stopping: '停止中',
                stopped: '已停止',
                'shutting-down': '终止中',
                terminated: '已终止'
            };
            return labels[state] || state || '-';
        },
        stateColor(state) {
            if (state === 'running') return 'success';
            if (state === 'stopped') return 'warning';
            if (state === 'pending') return 'processing';
            return 'default';
        },
        relayOperate(payload) {
            this.$emit('operate', payload.row, payload.action);
        }
    },
    template: `
        <section class="table-section-card">
            <div class="section-toolbar instance-list-toolbar">
                <div>
                    <a-typography-title :level="3" style="margin-bottom: 4px">EC2 实例列表</a-typography-title>
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
                :scroll="{ x: 1120 }"
                :locale="{ emptyText: '暂无 EC2 实例，请先选择账号和区域同步。' }"
            >
                <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'ip'">
                        <div class="ip-wrap-cell"><ec2-ip-cell :row="record" /></div>
                    </template>
                    <template v-else-if="column.key === 'region'">
                        <div class="region-zone-cell">
                            <span>{{ regionLabel(record.region) }}</span>
                            <span v-if="record.zone" class="region-zone-cell-zone">{{ record.zone }}</span>
                        </div>
                    </template>
                    <template v-else-if="column.key === 'instance'">
                        <div class="region-zone-cell">
                            <span>{{ record.name || '-' }}</span>
                            <span class="region-zone-cell-zone">{{ record.id }}</span>
                        </div>
                    </template>
                    <template v-else-if="column.key === 'state'">
                        <a-tag :color="stateColor(record.state)">{{ stateLabel(record.state) }}</a-tag>
                    </template>
                    <template v-else-if="column.key === 'actions'">
                        <a-space size="small">
                            <ec2-action-select :row="record" @operate="relayOperate" />
                        </a-space>
                    </template>
                </template>
            </a-table>
        </section>
    `
};
