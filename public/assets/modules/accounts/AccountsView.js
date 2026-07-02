import { accountApi } from './api.js';
import { message, modal } from '../../shared/plugins/antDesignVue.js';
import TableActions from '../../shared/components/TableActions.js';
import { errorMessage } from '../../shared/utils/errors.js';
import { tablePagination } from '../../shared/utils/pagination.js';

export default {
    name: 'AccountsView',
    components: { TableActions },
    data() {
        return {
            loading: false,
            saving: false,
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
        remove(row) {
            modal.confirm({
                title: '删除账号',
                content: `确定删除账号 ${row.id}？相关实例缓存也会删除。`,
                okText: '删除',
                okType: 'danger',
                cancelText: '取消',
                onOk: async () => {
                    try {
                        await accountApi.remove(row.id);
                        message.success('账号已删除');
                        window.dispatchEvent(new CustomEvent('accounts-updated'));
                        await this.load();
                    } catch (e) {
                        message.error(errorMessage(e, '账号删除失败'));
                    }
                }
            });
        },
        handleAction(row, key) {
            if (key === 'delete') this.remove(row);
        }
    },
    template: `
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
                        <table-actions :items="[{ key: 'delete', label: '删除', danger: true }]" @edit="openEdit(record)" @select="handleAction(record, $event)" />
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
    `
};
