<template>
  <section>
    <ListToolbar
      :title="pageTitle"
      :subtitle="pageHelp"
      :keyword="keyword"
      search-placeholder="搜索服务商"
      @update:keyword="keyword = $event"
    >
      <template #actions>
        <a-button :loading="loading" @click="handleRefresh">刷新</a-button>
        <a-button type="primary" @click="openCreate">新增服务商</a-button>
      </template>
    </ListToolbar>

    <a-table
      :key="tableKey"
      row-key="id"
      :loading="loading"
      :columns="columns"
      :data-source="filteredAccounts"
      :pagination="pagination"
      size="middle"
      :scroll="{ x: 900 }"
      :locale="{ emptyText: '暂无服务商' }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'secret_key_masked'">
          {{ record.secret_key_masked || '-' }}
        </template>
        <template v-else-if="column.key === 'remark'">{{ record.remark || '-' }}</template>
        <template v-else-if="column.key === 'actions'">
          <TableActions
            :disabled="Boolean(deletingId)"
            :items="[{ key: 'delete', label: '删除', danger: true, inline: true, disabled: Boolean(deletingId) }]"
            @edit="openEdit(record)"
            @select="(key) => key === 'delete' && askRemove(record)"
          />
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="dialogVisible"
      :title="form.original_id ? '编辑服务商' : '新增服务商'"
      :footer="null"
      :width="520"
    >
      <a-form layout="vertical" @submit.prevent="save">
        <a-form-item label="服务商 ID" required>
          <a-input v-model:value="form.id" placeholder="自定义标识" />
        </a-form-item>
        <a-form-item label="Access Key" required>
          <a-input v-model:value="form.access_key" />
        </a-form-item>
        <a-form-item label="Secret Key" required>
          <a-input-password
            v-model:value="form.secret_key"
            :placeholder="form.original_id ? '留空则保持原 Secret Key' : ''"
          />
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="form.remark" placeholder="可选" />
        </a-form-item>
        <div class="modal-form-actions-main account-form-actions">
          <a-button @click="dialogVisible = false">取消</a-button>
          <a-button type="primary" :loading="saving" @click="save">保存</a-button>
        </div>
      </a-form>
    </a-modal>
  </section>
</template>

<script>
import ListToolbar from '../../shared/components/ListToolbar.vue'
import TableActions from '../../shared/components/TableActions.vue'
import { accountApi } from '../../shared/api/accounts.js'
import { message, modal } from '../../shared/plugins/antDesignVue.js'
import { errorMessage } from '../../shared/utils/errors.js'
import { tablePagination } from '../../shared/utils/pagination.js'
import { apiObject } from '../../shared/utils/api-data.js'

function asAccountList(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  if (payload && Array.isArray(payload.items)) return payload.items
  return []
}

export default {
  components: { ListToolbar, TableActions },
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
      tableKey: 0,
      columns: [
        { title: '服务商 ID', dataIndex: 'id', key: 'id', width: 220 },
        { title: 'Access Key', dataIndex: 'access_key', key: 'access_key', width: 260 },
        { title: 'Secret Key', dataIndex: 'secret_key_masked', key: 'secret_key_masked', width: 180 },
        { title: '备注', dataIndex: 'remark', key: 'remark' },
        { title: '操作', key: 'actions', width: 150, fixed: 'right' },
      ],
    }
  },
  async mounted() {
    await this.load()
  },
  computed: {
    pageTitle() {
      return '服务商列表'
    },
    pageHelp() {
      return '用于 AWS SDK 请求的访问密钥，保存到本地 JSON。'
    },
    filteredAccounts() {
      const keyword = this.keyword.trim().toLowerCase()
      if (!keyword) return this.accounts
      return this.accounts.filter((account) =>
        [account.id, account.access_key, account.remark].some((value) =>
          String(value || '').toLowerCase().includes(keyword),
        ),
      )
    },
    pagination() {
      return tablePagination()
    },
  },
  methods: {
    emptyForm() {
      return { original_id: '', id: '', access_key: '', secret_key: '', remark: '' }
    },
    setAccounts(list) {
      // Always replace with a new array so a-table re-renders reliably.
      this.accounts = Array.isArray(list) ? list.map((row) => ({ ...row })) : []
      this.tableKey += 1
    },
    async handleRefresh() {
      await this.load()
      message.success('已刷新')
    },
    async load() {
      this.loading = true
      try {
        const response = await accountApi.list()
        this.setAccounts(asAccountList(response))
      } catch (e) {
        this.setAccounts([])
        message.error(errorMessage(e, '加载服务商失败'))
      } finally {
        this.loading = false
      }
    },
    openCreate() {
      this.form = this.emptyForm()
      this.dialogVisible = true
    },
    openEdit(row) {
      this.form = {
        original_id: row.id,
        id: row.id,
        access_key: row.access_key || '',
        secret_key: '',
        remark: row.remark || '',
      }
      this.dialogVisible = true
    },
    async save() {
      this.form.id = this.form.id.trim()
      this.form.access_key = this.form.access_key.trim()
      this.form.secret_key = this.form.secret_key.trim()
      this.form.remark = this.form.remark.trim()
      if (!this.form.id || !this.form.access_key || (!this.form.original_id && !this.form.secret_key)) {
        message.warning('请完整填写服务商 ID、Access Key 和 Secret Key')
        return
      }
      this.saving = true
      try {
        const payload = { ...this.form }
        if (payload.original_id && !payload.secret_key) {
          delete payload.secret_key
        }
        const response = await accountApi.save(payload)
        const saved = apiObject(response, null)

        // Optimistic local update so UI changes even if a later reload is flaky.
        if (payload.original_id) {
          this.setAccounts(
            this.accounts.map((row) => {
              if (row.id !== payload.original_id) return row
              return {
                ...row,
                ...(saved || {}),
                id: saved?.id || payload.id,
                access_key: saved?.access_key || payload.access_key,
                remark: saved?.remark ?? payload.remark,
                secret_key_masked:
                  saved?.secret_key_masked ||
                  row.secret_key_masked ||
                  (payload.secret_key ? '••••' : row.secret_key_masked),
              }
            }),
          )
        } else if (saved) {
          this.setAccounts([...this.accounts, saved])
        }

        message.success('服务商已保存')
        this.dialogVisible = false
        window.dispatchEvent(new CustomEvent('accounts-updated'))
        await this.load()
      } catch (e) {
        message.error(errorMessage(e, '服务商保存失败'))
      } finally {
        this.saving = false
      }
    },
    async askRemove(row) {
      modal.confirm({
        title: '删除服务商',
        content: `确认删除 ${row.id}？相关实例缓存也会一并删除。`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => this.remove(row),
      })
    },
    async remove(row) {
      if (this.deletingId) return false
      this.deletingId = row.id
      try {
        await accountApi.remove(row.id)
        // Remove immediately so the row disappears without waiting on reload.
        this.setAccounts(this.accounts.filter((item) => item.id !== row.id))
        message.success('服务商已删除')
        window.dispatchEvent(new CustomEvent('accounts-updated'))
        await this.load()
        return true
      } catch (e) {
        message.error(errorMessage(e, '服务商删除失败'))
        return false
      } finally {
        this.deletingId = ''
      }
    },
  },
}
</script>
