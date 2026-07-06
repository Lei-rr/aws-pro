import { configApi } from '../../system/api/config.js';
import { ec2Api } from '../api.js';
import { regionName } from '../../../shared/utils/format.js';
import { copyText } from '../../../shared/utils/clipboard.js';
import { errorMessage } from '../../../shared/utils/errors.js';
import { message, modal } from '../../../shared/plugins/antDesignVue.js';

export function ec2State() {
    return {
        loading: false,
        syncing: false,
        configLoading: false,
        creating: false,
        accountId: '',
        region: '',
        regions: {},
        instances: [],
        options: { amis: {}, instance_types: {} },
        loadRequestToken: 0,
        configRequestToken: 0,
        actionLoadingKey: '',
        remarkVisible: false,
        remarkSaving: false,
        remarkForm: {
            account_id: '',
            region: '',
            instance_id: '',
            name: '',
            remark: ''
        },
        createVisible: false,
        createForm: emptyCreateForm()
    };
}

function emptyCreateForm() {
    return {
        name: '',
        ami: 'ubuntu-24.04',
        instance_type: 't3.micro',
        enable_ipv6: true,
        root_password: ''
    };
}

export const ec2Computed = {
    accountOptions() {
        return Array.from(new Set(this.instances.map((row) => row.account_id).filter(Boolean))).sort();
    },
    typeOptions() {
        return Array.from(new Set(this.instances.map((row) => row.instance_type).filter(Boolean))).sort();
    },
    createRegionLabel() {
        return this.regionLabel(this.region);
    }
};

export const ec2Methods = {
    regionLabel(id) {
        return regionName(this.regions, id);
    },
    async loadConfig() {
        const token = ++this.configRequestToken;
        this.configLoading = true;
        try {
            const [optionsResponse, configResponse] = await Promise.all([ec2Api.createOptions(), configApi.all()]);
            if (token !== this.configRequestToken) return;
            this.options = optionsResponse.data || { amis: {}, instance_types: {} };
            this.regions = configResponse.data.ec2_regions || configResponse.data.regions || {};
            if (!this.region) {
                this.region = Object.keys(this.regions)[0] || 'us-east-1';
            }
        } catch (e) {
            if (token !== this.configRequestToken) return;
            this.regions = {};
            this.options = { amis: {}, instance_types: {} };
            message.error(errorMessage(e, '加载 EC2 配置失败'));
        } finally {
            if (token === this.configRequestToken) this.configLoading = false;
        }
    },
    async loadInstances() {
        const token = ++this.loadRequestToken;
        this.loading = true;
        try {
            const response = await ec2Api.instances();
            if (token !== this.loadRequestToken) return;
            this.instances = response.data.items || response.data || [];
        } catch (e) {
            if (token !== this.loadRequestToken) return;
            this.instances = [];
            message.error(errorMessage(e, '加载 EC2 实例失败'));
        } finally {
            if (token === this.loadRequestToken) this.loading = false;
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
            message.success(`同步完成，共 ${response.data.count || 0} 台 EC2`);
            await this.loadInstances();
        } catch (e) {
            message.error(errorMessage(e, '同步 EC2 失败'));
        } finally {
            this.syncing = false;
        }
    },
    openCreate() {
        if (!this.accountId || !this.region) {
            message.warning('请选择账号和区域');
            return;
        }
        this.createForm = emptyCreateForm();
        this.createVisible = true;
    },
    async createInstance() {
        this.createForm.name = this.createForm.name.trim();
        if (!this.createForm.name || !this.createForm.ami || !this.createForm.instance_type) {
            message.warning('请完整填写 EC2 创建配置');
            return;
        }
        this.creating = true;
        try {
            await ec2Api.create({ ...this.createForm, account_id: this.accountId, region: this.region });
            message.success('EC2 创建命令已提交');
            this.createVisible = false;
            await this.syncScope(this.accountId, this.region);
            await this.loadInstances();
        } catch (e) {
            message.error(errorMessage(e, '创建 EC2 失败'));
        } finally {
            this.creating = false;
        }
    },
    operate(row, action) {
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
            terminate: '终止',
            open_ports: '全端口'
        };
        const risks = {
            allocate_static_ip: '获取静态 IP 会创建并绑定新的 Elastic IP，请确认当前实例需要固定公网 IPv4。',
            release_static_ip: '释放静态 IP 后该 Elastic IP 将解绑并释放。',
            start: '启动实例会恢复运行并可能产生费用，请确认需要启动。',
            stop: '停止实例会中断当前服务，请确认业务可以暂停。',
            reboot: '重启实例会造成短暂不可用，请确认可以中断。',
            terminate: '终止实例不可恢复，已绑定的 Elastic IP 会一并释放，请确认数据已备份。',
            open_ports: '全端口会对实例安全组开放 IPv4/IPv6 所有端口，请确认这是你想要的操作。'
        };
        modal.confirm({
            title: `确认${names[action]}`,
            content: `确定对 ${row.name || row.id} 执行“${names[action]}”？\n${risks[action]}`,
            okText: '确认',
            okType: ['terminate', 'open_ports', 'release_static_ip'].includes(action) ? 'danger' : 'primary',
            cancelText: '取消',
            onOk: () => this.runInstanceAction(row, action)
        });
    },
    async runInstanceAction(row, action) {
        const actionKey = `${row.id}:${action}`;
        if (this.actionLoadingKey) {
            message.warning('已有 EC2 操作正在进行');
            return;
        }
        this.actionLoadingKey = actionKey;
        try {
            const response = await ec2Api.action({
                instance_id: row.id,
                account_id: row.account_id,
                region: row.region,
                action,
                confirm: action
            });
            message.success(response.data.message || '命令已提交');
            await this.syncScope(row.account_id, row.region);
            await this.loadInstances();
        } catch (e) {
            message.error(errorMessage(e, 'EC2 操作失败'));
        } finally {
            this.actionLoadingKey = '';
        }
    },
    openRemark(row) {
        this.remarkForm = {
            account_id: row.account_id,
            region: row.region,
            instance_id: row.id,
            name: row.name || row.id,
            remark: row.remark || ''
        };
        this.remarkVisible = true;
    },
    async saveRemark() {
        this.remarkForm.remark = this.remarkForm.remark.trim();
        this.remarkSaving = true;
        try {
            const response = await ec2Api.updateRemark({
                account_id: this.remarkForm.account_id,
                region: this.remarkForm.region,
                instance_id: this.remarkForm.instance_id,
                remark: this.remarkForm.remark
            });
            const updated = response.data;
            this.instances = this.instances.map((item) => {
                if (item.account_id === updated.account_id && item.region === updated.region && item.id === updated.id) {
                    return updated;
                }
                return item;
            });
            this.remarkVisible = false;
            message.success('备注已保存');
        } catch (e) {
            message.error(errorMessage(e, '备注保存失败'));
        } finally {
            this.remarkSaving = false;
        }
    },
    async copyInstanceList() {
        const lines = this.instances
            .map((row) => {
                const ip = row.public_ipv4 || row.public_ipv6 || '';
                return ip ? `${ip} | ${row.name || row.id} | ${this.regionLabel(row.region)} | ${row.account_id}` : '';
            })
            .filter(Boolean);
        if (!lines.length) {
            message.warning('没有可复制的 EC2 IP');
            return;
        }
        await copyText(lines.join('\r\n'));
    },
    syncScope(accountId, region) {
        return ec2Api.sync({ account_id: accountId, region });
    }
};

export async function ec2Mounted() {
    await Promise.all([this.loadConfig(), this.loadInstances()]);
}
