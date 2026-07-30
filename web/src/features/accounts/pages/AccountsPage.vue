<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Plus, RefreshCw, EllipsisVertical } from '@lucide/vue'
import { PageHeader } from '@/shared/ui/page-header'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableLoading } from '@/shared/ui/table'
import { TablePagination } from '@/shared/ui/pagination'
import { AppDialog } from '@/shared/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { accountApi } from '@/features/accounts/api/accounts'
import { clearAccountsCache } from '@/features/accounts/stores/accounts'
import { apiList, apiObject } from '@/shared/api/http'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { useListPage } from '@/shared/lib/use-list-page'
import { useLocalPagination } from '@/shared/lib/use-local-pagination'
import { confirmDelete } from '@/shared/ui/confirm'
import type { Account } from '@/shared/types'

const saving = ref(false)
const deletingId = ref('')
const keyword = ref('')
const accounts = ref<Account[]>([])
const tableKey = ref(0)
const dialogOpen = ref(false)

const { loading, refreshing, pageSize, runLoad, onRefresh, onPageSizeChange, fail } = useListPage({
  pageSizeScope: 'aws-accounts',
  load: async (options = {}) => {
    try {
      const response = await accountApi.list()
      if (options.isLatest && !options.isLatest()) return false
      setAccounts(apiList<Account>(response))
    } catch (e) {
      if (options.isLatest && !options.isLatest()) return false
      setAccounts([])
      fail(e)
      return false
    }
  },
})
const form = reactive({ original_id: '', id: '', access_key: '', secret_key: '', remark: '' })

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return accounts.value
  return accounts.value.filter((a) =>
    [a.id, a.access_key, a.remark].some((v) => String(v || '').toLowerCase().includes(kw)),
  )
})
const { page, total, pagedItems: pagedAccounts, resetPage } = useLocalPagination(filtered, pageSize)
watch(keyword, resetPage)

function setAccounts(list: Account[]) {
  accounts.value = Array.isArray(list) ? list.map((row) => ({ ...row })) : []
  tableKey.value += 1
}

function emptyForm() {
  return { original_id: '', id: '', access_key: '', secret_key: '', remark: '' }
}

function openCreate() {
  Object.assign(form, emptyForm())
  dialogOpen.value = true
}

function openEdit(row: Account) {
  Object.assign(form, {
    original_id: row.id,
    id: row.id,
    access_key: row.access_key || '',
    secret_key: '',
    remark: row.remark || '',
  })
  dialogOpen.value = true
}

async function save() {
  form.id = form.id.trim()
  form.access_key = form.access_key.trim()
  form.secret_key = form.secret_key.trim()
  form.remark = form.remark.trim()
  if (!form.id || !form.access_key || (!form.original_id && !form.secret_key)) {
    toast.warning('请完整填写服务商 ID、Access Key 和 Secret Key')
    return
  }
  saving.value = true
  try {
    const payload: Partial<Account> & { original_id?: string } = { ...form }
    if (payload.original_id && !payload.secret_key) delete payload.secret_key
    const response = await accountApi.save(payload)
    const saved = apiObject<Account>(response, { id: '', access_key: '' })
    if (form.original_id) {
      setAccounts(
        accounts.value.map((row) => {
          if (row.id !== form.original_id) return row
          return {
            ...row,
            ...(saved || {}),
            id: saved?.id || form.id,
            access_key: saved?.access_key || form.access_key,
            remark: saved?.remark ?? form.remark,
            secret_key_masked:
              saved?.secret_key_masked ||
              row.secret_key_masked ||
              (form.secret_key ? '••••' : row.secret_key_masked),
          }
        }),
      )
    } else if (saved) {
      setAccounts([...accounts.value, saved])
    }
    toast.success('服务商已保存')
    dialogOpen.value = false
    clearAccountsCache()
    window.dispatchEvent(new CustomEvent('accounts-updated'))
  } catch (e) {
    toast.error(errorMessage(e, '服务商保存失败'))
  } finally {
    saving.value = false
  }
}

async function remove(row: Account) {
  if (!(await confirmDelete(row.id, '相关实例缓存也会一并删除。'))) return
  if (deletingId.value) return
  deletingId.value = row.id
  try {
    await accountApi.remove(row.id)
    setAccounts(accounts.value.filter((item) => item.id !== row.id))
    toast.success('服务商已删除')
    clearAccountsCache()
    window.dispatchEvent(new CustomEvent('accounts-updated'))
  } catch (e) {
    toast.error(errorMessage(e, '服务商删除失败'))
  } finally {
    deletingId.value = ''
  }
}

onMounted(() => runLoad())
</script>

<template>
  <div class="flex flex-1 flex-col gap-4">
    <PageHeader title="服务商列表" description="用于 AWS SDK 请求的访问密钥，保存到本地 JSON。">
      <Button variant="outline" size="sm" :disabled="loading" @click="onRefresh">
        <RefreshCw class="size-4" :class="refreshing && 'animate-spin'" />
        刷新
      </Button>
      <Button size="sm" @click="openCreate">
        <Plus class="size-4" />
        新增服务商
      </Button>
    </PageHeader>

    <div class="flex flex-wrap items-center gap-2">
      <Input v-model="keyword" class="h-8 w-full sm:w-72" placeholder="搜索服务商" />
    </div>

    <TableLoading :loading="loading" :empty="!filtered.length">
      <Table :key="tableKey">
        <TableHeader class="bg-muted/50">
          <TableRow class="!border-0">
            <TableHead class="rounded-l-lg px-4">服务商 ID</TableHead>
            <TableHead>Access Key</TableHead>
            <TableHead>Secret Key</TableHead>
            <TableHead>备注</TableHead>
            <TableHead class="rounded-r-lg w-12" />
          </TableRow>
        </TableHeader>
        <TableBody class="**:data-[slot=table-cell]:py-2.5">
          <TableRow v-if="!filtered.length && !loading">
            <TableCell colspan="5" class="text-muted-foreground py-10 text-center">暂无服务商</TableCell>
          </TableRow>
          <TableRow v-for="record in pagedAccounts" :key="record.id">
            <TableCell class="px-4 font-medium">{{ record.id }}</TableCell>
            <TableCell class="max-w-[14rem] truncate" :title="record.access_key">{{ record.access_key || '—' }}</TableCell>
            <TableCell>{{ record.secret_key_masked || '—' }}</TableCell>
            <TableCell class="text-muted-foreground max-w-[10rem] truncate">{{ record.remark || '—' }}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" class="size-8" :disabled="deletingId === record.id">
                    <EllipsisVertical class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem :disabled="deletingId === record.id" @click="openEdit(record)">编辑</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" :disabled="deletingId === record.id" @click="remove(record)">
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <TablePagination
        class="mt-2"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :disabled="loading"
        @update:page="page = $event"
        @update:page-size="onPageSizeChange"
      />
    </TableLoading>

    <AppDialog
      v-model:open="dialogOpen"
      :title="form.original_id ? '编辑服务商' : '新增服务商'"
      description="留空 Secret Key 表示不修改。"
    >
      <FieldGroup>
        <Field>
          <FieldLabel>服务商 ID</FieldLabel>
          <Input v-model="form.id" placeholder="自定义标识" />
        </Field>
        <Field>
          <FieldLabel>Access Key</FieldLabel>
          <Input v-model="form.access_key" />
        </Field>
        <Field>
          <FieldLabel>Secret Key</FieldLabel>
          <Input
            v-model="form.secret_key"
            type="password"
            autocomplete="new-password"
            :placeholder="form.original_id ? '留空则保持原 Secret Key' : ''"
          />
        </Field>
        <Field>
          <FieldLabel>备注</FieldLabel>
          <Input v-model="form.remark" placeholder="可选" />
        </Field>
      </FieldGroup>
      <template #footer>
        <Button variant="outline" @click="dialogOpen = false">取消</Button>
        <Button :loading="saving" @click="save">保存</Button>
      </template>
    </AppDialog>
  </div>
</template>
