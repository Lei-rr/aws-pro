<template>
  <a-modal
    :open="visible"
    title="创建 EC2 实例"
    :footer="null"
    :width="760"
    destroy-on-close
    wrap-class-name="create-instance-modal"
    @update:open="$emit('update:visible', $event)"
  >
    <a-spin :spinning="loading">
      <a-form layout="vertical" @submit.prevent="onSubmit">
        <a-row :gutter="16">
          <a-col :xs="24" :md="12">
            <a-form-item label="账号">
              <a-input :value="accountId" disabled />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="12">
            <a-form-item label="实例名称" required>
              <a-input v-model:value="form.name" placeholder="例如 ec2-web" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="12">
            <a-form-item label="区域">
              <a-input :value="regionLabel" disabled />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="12">
            <a-form-item label="IP 类型" required>
              <a-select v-model:value="form.enable_ipv6" :options="ipTypeOptions" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="12">
            <a-form-item label="系统镜像" required>
              <a-select v-model:value="form.ami" :options="amiOptions" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="12">
            <a-form-item label="root 密码">
              <a-input-password v-model:value="form.root_password" placeholder="可选，通过 user-data 注入" />
            </a-form-item>
          </a-col>
          <a-col :xs="24">
            <a-form-item label="套餐" required>
              <a-select v-model:value="form.instance_type" :options="instanceTypeOptions" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-spin>

    <div class="modal-form-actions-main account-form-actions create-instance-actions">
      <a-button @click="$emit('update:visible', false)">取消</a-button>
      <a-button type="primary" :loading="creating" :disabled="loading || creating" @click="onSubmit">创建</a-button>
    </div>
  </a-modal>
</template>

<script>
export default {
  name: 'CreateEc2Dialog',
  props: {
    visible: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    creating: { type: Boolean, default: false },
    accountId: { type: String, default: '' },
    regionLabel: { type: String, default: '' },
    form: { type: Object, required: true },
    options: { type: Object, required: true },
  },
  emits: ['update:visible', 'submit'],
  computed: {
    amiOptions() {
      return Object.entries(this.options?.amis || {}).map(([key, name]) => ({ label: name, value: key }))
    },
    instanceTypeOptions() {
      return Object.entries(this.options?.instance_types || {}).map(([key, name]) => ({
        label: name,
        value: key,
      }))
    },
    ipTypeOptions() {
      return [
        { label: '双栈（IPv4 + IPv6）', value: true },
        { label: '仅 IPv4', value: false },
      ]
    },
  },
  methods: {
    onSubmit() {
      if (this.loading || this.creating) return
      this.$emit('submit')
    },
  },
}
</script>
