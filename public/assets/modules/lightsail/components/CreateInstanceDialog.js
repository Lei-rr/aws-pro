export default {
    name: 'CreateInstanceDialog',
    props: {
        visible: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        creating: { type: Boolean, default: false },
        accountId: { type: String, default: '' },
        regionLabel: { type: String, default: '' },
        form: { type: Object, required: true },
        options: { type: Object, required: true },
        bundleOptions: { type: Array, default: () => [] },
        blueprints: { type: Object, default: () => ({}) }
    },
    emits: ['update:visible', 'submit', 'ip-type-change'],
    template: `
        <a-modal :open="visible" title="创建 Lightsail 实例" :footer="null" :width="760" @update:open="$emit('update:visible', $event)">
            <a-spin :spinning="loading">
                <a-form layout="vertical" @submit.prevent="$emit('submit')">
                    <a-row :gutter="16">
                        <a-col :xs="24" :md="12"><a-form-item label="账号"><a-input :value="accountId" disabled /></a-form-item></a-col>
                        <a-col :xs="24" :md="12"><a-form-item label="实例名称" required><a-input v-model:value="form.name" placeholder="例如 web-01" /></a-form-item></a-col>
                        <a-col :xs="24" :md="12"><a-form-item label="区域"><a-input :value="regionLabel" disabled /></a-form-item></a-col>
                        <a-col :xs="24" :md="12"><a-form-item label="可用区" required><a-select v-model:value="form.zone" placeholder="选择可用区"><a-select-option v-for="zone in options.zones" :key="zone" :value="zone">{{ zone }}</a-select-option></a-select></a-form-item></a-col>
                        <a-col :xs="24" :md="12"><a-form-item label="系统镜像" required><a-select v-model:value="form.blueprint"><a-select-option v-for="(name, id) in blueprints" :key="id" :value="id">{{ name }}</a-select-option></a-select></a-form-item></a-col>
                        <a-col :xs="24" :md="12"><a-form-item label="IP 类型" required><a-select v-model:value="form.ip_address_type" @change="$emit('ip-type-change')"><a-select-option value="dualstack">双栈（IPv4 + IPv6）</a-select-option><a-select-option value="ipv4">仅 IPv4</a-select-option><a-select-option value="ipv6">仅 IPv6</a-select-option></a-select></a-form-item></a-col>
                        <a-col :xs="24" :md="12"><a-form-item label="root 密码"><a-input-password v-model:value="form.root_password" placeholder="可选，按后端配置执行" /></a-form-item></a-col>
                        <a-col :xs="24"><a-form-item label="套餐" required><a-select v-model:value="form.bundle" placeholder="选择套餐"><a-select-option v-for="bundle in bundleOptions" :key="bundle.id" :value="bundle.id">{{ bundle.label }}</a-select-option></a-select></a-form-item></a-col>
                    </a-row>
                    <div class="modal-form-actions-main account-form-actions">
                        <a-button @click="$emit('update:visible', false)">取消</a-button>
                        <a-button type="primary" :loading="creating" :disabled="loading" @click="$emit('submit')">创建</a-button>
                    </div>
                </a-form>
            </a-spin>
        </a-modal>
    `
};
