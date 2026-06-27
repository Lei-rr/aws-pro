import { configApi } from '../../system/api/config.js';
import { lightsailApi } from '../api.js';
import { regionName } from '../../../shared/utils/format.js';
import { copyText } from '../../../shared/utils/clipboard.js';
import { message, modal } from '../../../shared/plugins/antDesignVue.js';

export function lightsailState() {
    return {
        loading: false,
        syncing: false,
        configLoading: false,
        creating: false,
        accountId: '',
        region: '',
        regions: {},
        blueprints: {},
        instances: [],
        remarkVisible: false,
        remarkSaving: false,
        actionLoadingKey: '',
        remarkForm: {
            account_id: '',
            region: '',
            name: '',
            remark: ''
        },
        createVisible: false,
        createOptions: { zones: [], bundles: {} },
        createForm: {
            name: '',
            zone: '',
            blueprint: 'ubuntu_24_04',
            bundle: '',
            root_password: ''
        }
    };
}

export const lightsailComputed = {
    accountOptions() {
        return Array.from(new Set(this.instances.map((row) => row.account_id).filter(Boolean))).sort();
    },
    bundleOptions() {
        return Array.from(new Set(this.instances.map((row) => row.bundle_id).filter(Boolean))).sort();
    },
    createRegionLabel() {
        return this.regionLabel(this.region);
    }
};

export const lightsailMethods = {
    regionLabel(id) {
        return regionName(this.regions, id);
    },
    async loadConfig() {
        try {
            const config = await configApi.all();
            this.regions = config.data.regions || {};
            this.blueprints = config.data.blueprints || {};
        } catch (e) {
            this.regions = {};
            this.blueprints = {};
            message.error(e.message || '加载配置失败');
        }
    },
    async loadInstances() {
        this.loading = true;
        try {
            const response = await lightsailApi.instances();
            this.instances = response.data;
        } catch (e) {
            this.instances = [];
            message.error(e.message || '加载实例失败');
        } finally {
            this.loading = false;
        }
    },
    async sync() {
        if (!this.accountId || !this.region) {
            message.warning('请选择账号和区域');
            return;
        }
        if (this.syncing) {
            message.warning('已有同步任务正在进行');
            return;
        }
        this.syncing = true;
        try {
            const response = await this.syncScope(this.accountId, this.region);
            const result = response.data;
            const count = typeof result.count === 'number' ? result.count : 0;
            message.success(`同步完成，共 ${count} 台实例`);
            window.dispatchEvent(new CustomEvent('instances-updated'));
            await this.loadInstances();
        } catch (e) {
            message.error(e.message || '同步失败');
        } finally {
            this.syncing = false;
        }
    },
    async openCreate() {
        if (!this.accountId || !this.region) {
            message.warning('请选择账号和区域');
            return;
        }
        this.createForm = {
            name: '',
            zone: '',
            blueprint: Object.keys(this.blueprints)[0] || 'ubuntu_24_04',
            bundle: '',
            root_password: ''
        };
        this.createOptions = { zones: [], bundles: {} };
        this.createVisible = true;
        await this.loadCreateConfig();
    },
    async loadCreateConfig() {
        this.configLoading = true;
        try {
            const response = await lightsailApi.createOptions({ account_id: this.accountId, region: this.region });
            this.createOptions = response.data;
            this.createForm.zone = this.createOptions.zones[0] || '';
            this.createForm.bundle = Object.keys(this.createOptions.bundles || {})[0] || '';
        } catch (e) {
            message.error(e.message || '加载配置失败');
        } finally {
            this.configLoading = false;
        }
    },
    async createInstance() {
        this.createForm.name = this.createForm.name.trim();
        if (!this.createForm.name || !this.createForm.zone || !this.createForm.blueprint || !this.createForm.bundle) {
            message.warning('请完整填写实例配置');
            return;
        }

        this.creating = true;
        try {
            await lightsailApi.create({
                ...this.createForm,
                account_id: this.accountId,
                region: this.region
            });
            message.success('创建命令已提交');
            this.createVisible = false;
            await this.syncScope(this.accountId, this.region);
            window.dispatchEvent(new CustomEvent('instances-updated'));
            await this.loadInstances();
        } catch (e) {
            message.error(e.message || '创建失败');
        } finally {
            this.creating = false;
        }
    },
    async operate(row, action) {
        if (this.syncing) {
            message.warning('已有同步任务正在进行');
            return;
        }

        if (action === 'remark') {
            this.openRemark(row);
            return;
        }

        const names = {
            allocate_static_ip: '获取静态 IP',
            release_static_ip: '释放静态 IP',
            start: '启动',
            stop: '停止',
            reboot: '重启',
            open_ports: '全端口',
            delete: '删除'
        };

        const confirmActions = ['allocate_static_ip', 'release_static_ip', 'start', 'stop', 'reboot', 'delete', 'open_ports'];
        if (confirmActions.includes(action)) {
            const risks = {
                allocate_static_ip: '获取静态 IP 会创建并绑定新的静态地址，请确认当前实例需要固定公网 IP。',
                release_static_ip: '释放静态 IP 后该地址将不再绑定到实例。',
                start: '启动实例会恢复运行并可能产生费用，请确认需要启动。',
                stop: '停止实例会中断当前服务，请确认业务可以暂停。',
                reboot: '重启实例会造成短暂不可用，请确认可以中断。',
                delete: '删除实例会移除该 Lightsail 实例，请确认数据已备份。',
                open_ports: '全端口会开放 0-65535 所有端口，请确认这是你想要的操作。'
            };
            modal.confirm({
                title: `确认${names[action]}`,
                content: `确定对 ${row.name} 执行“${names[action]}”？\n${risks[action]}`,
                okText: '确认',
                okType: ['delete', 'open_ports', 'release_static_ip'].includes(action) ? 'danger' : 'primary',
                cancelText: '取消',
                onOk: () => this.runInstanceAction(row, action)
            });
            return;
        }

        await this.runInstanceAction(row, action);
    },
    async runInstanceAction(row, action) {
        const actionKey = `${row.account_id}:${row.region}:${row.name}:${action}`;
        if (this.actionLoadingKey) {
            message.warning('已有实例操作正在进行');
            return;
        }

        this.actionLoadingKey = actionKey;
        try {
            const response = await lightsailApi.action({
                action,
                confirm: ['allocate_static_ip', 'release_static_ip', 'start', 'stop', 'reboot', 'delete', 'open_ports'].includes(action) ? action : '',
                account_id: row.account_id,
                region: row.region,
                instance_name: row.name
            });
            const result = response.data;
            message.success(result.message || '命令已提交');
            await this.syncScope(row.account_id, row.region);
            window.dispatchEvent(new CustomEvent('instances-updated'));
            await this.loadInstances();
        } catch (e) {
            message.error(e.message || '操作失败');
        } finally {
            this.actionLoadingKey = '';
        }
    },
    async syncScope(accountId, region) {
        return lightsailApi.sync({ account_id: accountId, region });
    },
    openRemark(row) {
        this.remarkForm = {
            account_id: row.account_id,
            region: row.region,
            name: row.name,
            remark: row.remark || ''
        };
        this.remarkVisible = true;
    },
    async saveRemark() {
        this.remarkForm.remark = this.remarkForm.remark.trim();
        this.remarkSaving = true;
        try {
            const response = await lightsailApi.updateRemark({
                account_id: this.remarkForm.account_id,
                region: this.remarkForm.region,
                instance_name: this.remarkForm.name,
                remark: this.remarkForm.remark
            });
            const updated = response.data;
            this.instances = this.instances.map((item) => {
                if (item.account_id === updated.account_id && item.region === updated.region && item.name === updated.name) {
                    return updated;
                }
                return item;
            });
            this.remarkVisible = false;
            message.success('备注已保存');
        } catch (e) {
            message.error(e.message || '备注保存失败');
        } finally {
            this.remarkSaving = false;
        }
    },
    async copyInstanceList() {
        const lines = this.instances
            .map((row) => {
                const ip = row.static_ip || row.public_ip || '';
                return ip ? `${ip} | root | pass | ${this.regionLabel(row.region)} | ${row.account_id}` : '';
            })
            .filter(Boolean);
        if (!lines.length) {
            message.warning('没有可复制的实例 IP');
            return;
        }
        await copyText(lines.join('\r\n'));
    },
};

export async function lightsailMounted() {
    await Promise.all([this.loadConfig(), this.loadInstances()]);
}
