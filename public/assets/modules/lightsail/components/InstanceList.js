import CloudInstanceTable from '../../../shared/components/CloudInstanceTable.js';
import InstanceActionSelect from './InstanceActionSelect.js';
import InstanceIpCell from './InstanceIpCell.js';

export default {
    name: 'InstanceList',
    components: { CloudInstanceTable, InstanceActionSelect, InstanceIpCell },
    props: {
        loading: { type: Boolean, default: false },
        instances: { type: Array, default: () => [] },
        regions: { type: Object, default: () => ({}) },
        accountOptions: { type: Array, default: () => [] },
        bundleOptions: { type: Array, default: () => [] }
    },
    emits: ['operate', 'remark'],
    computed: {
        stateLabels() {
            return {
                running: '运行中',
                pending: '启动中',
                stopping: '停止中',
                stopped: '已停止',
                terminated: '已终止'
            };
        }
    },
    methods: {
        rowKey(row) {
            return `${row.account_id}-${row.region}-${row.name}`;
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
        relayOperate(payload) {
            this.$emit('operate', payload.row, payload.action);
        },
        emitOperate(row, action) {
            this.$emit('operate', row, action);
        }
    },
    template: `
        <cloud-instance-table
            :loading="loading"
            :instances="instances"
            :regions="regions"
            :account-options="accountOptions"
            :package-options="bundleOptions"
            package-key="bundle_id"
            :package-filter-label="bundleFilterLabel"
            :row-key="rowKey"
            :state-labels="stateLabels"
            @operate="emitOperate"
            @remark="$emit('remark', $event)"
        >
            <template #ip="{ record }">
                <instance-ip-cell :row="record" />
            </template>
            <template #package="{ record }">
                {{ bundleParts(record).join('丨') }}
            </template>
            <template #actions="{ record }">
                <instance-action-select :row="record" @operate="relayOperate" />
            </template>
        </cloud-instance-table>
    `
};
