import CloudInstanceTable from '../../../shared/components/CloudInstanceTable.js';
import Ec2ActionSelect from './Ec2ActionSelect.js';
import Ec2IpCell from './Ec2IpCell.js';

export default {
    name: 'Ec2List',
    components: { CloudInstanceTable, Ec2ActionSelect, Ec2IpCell },
    props: {
        loading: { type: Boolean, default: false },
        instances: { type: Array, default: () => [] },
        regions: { type: Object, default: () => ({}) },
        accountOptions: { type: Array, default: () => [] },
        typeOptions: { type: Array, default: () => [] }
    },
    emits: ['operate', 'remark'],
    computed: {
        stateLabels() {
            return {
                pending: '启动中',
                running: '运行中',
                stopping: '停止中',
                stopped: '已停止',
                'shutting-down': '终止中',
                terminated: '已终止'
            };
        }
    },
    methods: {
        rowKey(row) {
            return `${row.account_id}-${row.region}-${row.id}`;
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
            :package-options="typeOptions"
            package-key="instance_type"
            :row-key="rowKey"
            :state-labels="stateLabels"
            @operate="emitOperate"
            @remark="$emit('remark', $event)"
        >
            <template #ip="{ record }">
                <ec2-ip-cell :row="record" />
            </template>
            <template #package="{ record }">
                {{ record.instance_type || '-' }}
            </template>
            <template #actions="{ record }">
                <ec2-action-select :row="record" @operate="relayOperate" />
            </template>
        </cloud-instance-table>
    `
};
