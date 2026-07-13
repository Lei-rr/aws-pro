<template>

        <a-modal :open="visible" title="编辑实例备注" :footer="null" :width="520" @update:open="$emit('update:visible', $event)">
            <a-form layout="vertical" @submit.prevent="$emit('save')">
                <a-form-item label="实例"><a-input :value="form.name" disabled /></a-form-item>
                <a-form-item label="备注">
                    <a-textarea v-model:value="form.remark" :maxlength="200" show-count autofocus placeholder="输入便于识别的业务说明" />
                </a-form-item>
                <div class="modal-form-actions-main account-form-actions">
                    <a-button @click="$emit('update:visible', false)">取消</a-button>
                    <a-button type="primary" :loading="saving" @click="$emit('save')">保存</a-button>
                </div>
            </a-form>
        </a-modal>
    
</template>

<script>
export default {
    name: 'InstanceRemarkDialog',
    props: {
        visible: { type: Boolean, default: false },
        saving: { type: Boolean, default: false },
        form: { type: Object, required: true }
    },
    emits: ['update:visible', 'save']
    };
</script>
