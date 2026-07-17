<template>

        <section>
            <div class="page-toolbar">
                <div>
                    <a-typography-title :level="3" style="margin-bottom: 4px">{{ pageTitle }}</a-typography-title>
                    <a-typography-text type="secondary">{{ pageHelp }}</a-typography-text>
                </div>
                <div class="page-actions">
                    <a-input-search v-model:value="keyword" placeholder="搜索账号" allow-clear />
                    <a-button :loading="loading" @click="load">刷新</a-button>
                    <a-button type="primary" @click="openCreate">新增账号</a-button>
                </div>
            </div>
            <a-table row-key="id" :loading="loading" :columns="columns" :data-source="filteredAccounts" :pagination="pagination" size="middle" :scroll="{ x: 900 }" :locale="{ emptyText: '暂无账号' }">
                <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'secret_key_masked'">
                        {{ record.secret_key_masked || '-' }}
                    </template>
                    <template v-else-if="column.key === 'remark'">{{ record.remark || '-' }}</template>
                    <template v-else-if="column.key === 'actions'">
                        <a-space size="small">
                            <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
                            <a-popconfirm
                                title="确定删除此服务商？"
                                :description="`将同时删除 ${record.id} 的相关实例缓存。`"
                                ok-text="删除"
                                cancel-text="取消"
                                @confirm="remove(record)"
                            >
                                <a-button
                                    type="link"
                                    danger
                                    size="small"
                                    :loading="deletingId === record.id"
                                    :disabled="Boolean(deletingId)"
                                >删除</a-button>
                            </a-popconfirm>
                        </a-space>
                    </template>
                </template>
            </a-table>

            <a-modal v-model:open="dialogVisible" :title="form.original_id ? '编辑账号' : '新增账号'" :footer="null" :width="520">
                <a-form layout="vertical" @submit.prevent="save">
                    <a-form-item label="账号 ID" required><a-input v-model:value="form.id" placeholder="自定义账号标识" /></a-form-item>
                    <a-form-item label="Access Key" required><a-input v-model:value="form.access_key" /></a-form-item>
                    <a-form-item label="Secret Key" required><a-input-password v-model:value="form.secret_key" :placeholder="form.original_id ? '留空则保持原 Secret Key' : ''" /></a-form-item>
                    <a-form-item label="备注"><a-input v-model:value="form.remark" placeholder="可选" /></a-form-item>
                    <div class="modal-form-actions-main account-form-actions">
                        <a-button @click="dialogVisible = false">取消</a-button>
                        <a-button type="primary" :loading="saving" @click="save">保存</a-button>
                    </div>
                </a-form>
            </a-modal>
        </section>
    
</template>

<script>
import { accountApi } from '../../shared/api/accounts.js';
import { message } from '../../shared/plugins/antDesignVue.js';
import { errorMessage } from '../../shared/utils/errors.js';
import { tablePagination } from '../../shared/utils/pagination.js';

export default {
    name: 'AccountsView',
    data() {
        return {
            loading: false,
            saving: false,
            deletingId: '',
            dialogVisible: false,
            form: this.emptyForm(),
            keyword: '',
            accounts: [],
            columns: [
                { title: '账号 ID', dataIndex: 'id', key: 'id', width: 220 },
                { title: 'Access Key', dataIndex: 'access_key', key: 'access_key', width: 260 },
                { title: 'Secret Key', dataIndex: 'secret_key_masked', key: 'secret_key_masked', width: 180 },
                { title: '备注', dataIndex: 'remark', key: 'remark' },
                { title: '操作', key: 'actions', width: 150, fixed: 'right' }
            ]
        };
    },
    async mounted() {
        await this.load();
    },
    computed: {
        pageTitle() {
            return '账号列表';
        },
        pageHelp() {
            return '用于 AWS SDK 请求的访问密钥，保存到本地 JSON。';
        },
        filteredAccounts() {
            const keyword = this.keyword.trim().toLowerCase();
            if (!keyword) return this.accounts;
            return this.accounts.filter((account) => [account.id, account.access_key, account.remark].some((value) => String(value || '').toLowerCase().includes(keyword)));
        },
        pagination() {
            return tablePagination();
        }
    },
    methods: {
        emptyForm() {
            return { original_id: '', id: '', access_key: '', secret_key: '', remark: '' };
        },
        async load() {
            this.loading = true;
            try {
                const response = await accountApi.list();
                this.accounts = response.data;
            } catch (e) {
                this.accounts = [];
                message.error(errorMessage(e, '加载账号失败'));
            } finally {
                this.loading = false;
            }
        },
        openCreate() {
            this.form = this.emptyForm();
            this.dialogVisible = true;
        },
        openEdit(row) {
            this.form = { original_id: row.id, id: row.id, access_key: row.access_key || '', secret_key: '', remark: row.remark || '' };
            this.dialogVisible = true;
        },
        async save() {
            this.form.id = this.form.id.trim();
            this.form.access_key = this.form.access_key.trim();
            this.form.secret_key = this.form.secret_key.trim();
            this.form.remark = this.form.remark.trim();
            if (!this.form.id || !this.form.access_key || (!this.form.original_id && !this.form.secret_key)) {
                message.warning('请完整填写账号 ID、Access Key 和 Secret Key');
                return;
            }
            this.saving = true;
            try {
                const payload = { ...this.form };
                if (payload.original_id && !payload.secret_key) {
                    delete payload.secret_key;
                }
                await accountApi.save(payload);
                message.success('账号已保存');
                this.dialogVisible = false;
                window.dispatchEvent(new CustomEvent('accounts-updated'));
                await this.load();
            } catch (e) {
                message.error(errorMessage(e, '账号保存失败'));
            } finally {
                this.saving = false;
            }
        },
        async remove(row) {
            if (this.deletingId) return;
            this.deletingId = row.id;
            try {
                await accountApi.remove(row.id);
                message.success('服务商已删除');
                window.dispatchEvent(new CustomEvent('accounts-updated'));
                await this.load();
            } catch (e) {
                message.error(errorMessage(e, '服务商删除失败'));
            } finally {
                this.deletingId = '';
            }
        }
    }
    };
</script>
