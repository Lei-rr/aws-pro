<template>

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
                        <div class="ip-wrap-cell"><slot name="ip" :record="record" /></div>
                    </template>
                    <template v-else-if="column.key === 'region'">
                        <div class="region-zone-cell">
                            <span>{{ regionLabel(record.region) }}</span>
                            <span v-if="record.zone" class="region-zone-cell-zone">{{ record.zone }}</span>
                        </div>
                    </template>
                    <template v-else-if="column.key === 'name'">
                        {{ record.name || '-' }}
                    </template>
                    <template v-else-if="column.key === 'state'">
                        <a-tag :color="stateColor(record.state)">{{ stateLabel(record.state) }}</a-tag>
                    </template>
                    <template v-else-if="column.key === 'package'">
                        <slot name="package" :record="record">{{ record[packageKey] || '-' }}</slot>
                    </template>
                    <template v-else-if="column.key === 'static_ip'">
                        <static-ip-cell :row="record" @operate="relayOperate" />
                    </template>
                    <template v-else-if="column.key === 'remark'">
                        <a-button type="link" size="small" style="padding: 0" @click="$emit('remark', record)">{{ record.remark || '添加' }}</a-button>
                    </template>
                    <template v-else-if="column.key === 'actions'">
                        <a-space size="small">
                            <a-button type="link" size="small" style="padding: 0" @click="$emit('remark', record)">编辑</a-button>
                            <slot name="actions" :record="record" />
                        </a-space>
                    </template>
                </template>
            </a-table>
        </section>
    
</template>

<script>
import { regionName } from '../utils/format.js';
import { tablePagination } from '../utils/pagination.js';
import StaticIpCell from './StaticIpCell.vue';

export default {
    name: 'CloudInstanceTable',
    components: { StaticIpCell },
    props: {
        loading: { type: Boolean, default: false },
        instances: { type: Array, default: () => [] },
        regions: { type: Object, default: () => ({}) },
        accountOptions: { type: Array, default: () => [] },
        packageOptions: { type: Array, default: () => [] },
        packageKey: { type: String, required: true },
        packageFilterLabel: { type: Function, default: (value) => value || '-' },
        rowKey: { type: Function, required: true },
        stateLabels: { type: Object, default: () => ({}) }
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
                    dataIndex: this.packageKey,
                    key: 'package',
                    width: 170,
                    responsive: ['lg'],
                    filters: this.packageOptions.map((value) => ({ text: this.packageFilterLabel(value), value })),
                    onFilter: (value, record) => record[this.packageKey] === value
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
        regionLabel(id) {
            return regionName(this.regions, id);
        },
        stateLabel(state) {
            return this.stateLabels[state] || state || '-';
        },
        stateColor(state) {
            return state === 'running' ? 'success' : 'warning';
        },
        relayOperate(row, action) {
            this.$emit('operate', row, action);
        }
    }
    };
</script>
