export default {
    name: 'Ec2ActionSelect',
    props: {
        row: { type: Object, required: true }
    },
    emits: ['operate'],
    computed: {
        actions() {
            if (this.row.state === 'running') {
                const staticIpAction = this.row.static_ip
                    ? { key: 'release_static_ip', label: '释放静态 IP', danger: true }
                    : { key: 'allocate_static_ip', label: '获取静态 IP' };
                return [
                    staticIpAction,
                    { key: 'stop', label: '停止' },
                    { key: 'reboot', label: '重启' },
                    { key: 'open_ports', label: '全端口', danger: true },
                    { key: 'terminate', label: '终止', danger: true }
                ];
            }
            if (this.row.state === 'stopped') {
                return [
                    ...(this.row.static_ip ? [{ key: 'release_static_ip', label: '释放静态 IP', danger: true }] : []),
                    { key: 'start', label: '启动' },
                    { key: 'terminate', label: '终止', danger: true }
                ];
            }
            return [{ key: 'terminate', label: '终止', danger: true }];
        }
    },
    methods: {
        run({ key }) {
            this.$emit('operate', { row: this.row, action: key });
        }
    },
    template: `
        <a-dropdown :trigger="['click']">
            <a-button type="link" size="small" style="padding: 0">更多</a-button>
            <template #overlay>
                <a-menu @click="run">
                    <a-menu-item v-for="action in actions" :key="action.key" :danger="action.danger">{{ action.label }}</a-menu-item>
                </a-menu>
            </template>
        </a-dropdown>
    `
};
