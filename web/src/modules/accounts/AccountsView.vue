
<template>
  <a-space direction="vertical" :size="16" style="width: 100%">
    <div style="display: flex; justify-content: space-between; align-items: center">
      <a-typography-title :level="3" style="margin: 0">账号管理</a-typography-title>
      <a-button type="primary" @click="openCreate">新增账号</a-button>
    </div>
    <a-table :data-source="items" :loading="loading" row-key="id" :pagination="false">
      <a-table-column title="账号 ID" data-index="id" />
      <a-table-column title="Access Key" data-index="access_key" />
      <a-table-column title="Secret" data-index="secret_key_masked" />
      <a-table-column title="备注" data-index="remark" />
      <a-table-column title="操作" :width="180">
        <template #default="{ record }">
          <a-space>
            <a-button size="small" @click="openEdit(record)">编辑</a-button>
            <a-popconfirm title="确认删除？" @confirm="remove(record.id)">
              <a-button size="small" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table-column>
    </a-table>

    <a-modal v-model:open="open" :title="editingId ? '编辑账号' : '新增账号'" @ok="save" :confirm-loading="saving">
      <a-form layout="vertical">
        <a-form-item label="账号 ID" required>
          <a-input v-model:value="form.id" :disabled="!!editingId" />
        </a-form-item>
        <a-form-item label="Access Key" required>
          <a-input v-model:value="form.access_key" />
        </a-form-item>
        <a-form-item :label="editingId ? 'Secret Key（留空不改）' : 'Secret Key'" :required="!editingId">
          <a-input-password v-model:value="form.secret_key" />
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="form.remark" />
        </a-form-item>
      </a-form>
    </a-modal>
  </a-space>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { accountApi } from './api'
import type { AwsAccount } from '@/types'
import { message } from '@/shared/plugins/antDesignVue'
import { errorMessage } from '@/shared/utils/errors'
import { useAccountsStore } from '@/stores/accounts'

const accountsStore = useAccountsStore()
const items = ref<AwsAccount[]>([])
const loading = ref(false)
const open = ref(false)
const saving = ref(false)
const editingId = ref('')
const form = reactive({ id: '', access_key: '', secret_key: '', remark: '' })

async function load() {
  loading.value = true
  try {
    items.value = await accountsStore.load(true)
  } catch (error) {
    message.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = ''
  Object.assign(form, { id: '', access_key: '', secret_key: '', remark: '' })
  open.value = true
}

function openEdit(record: AwsAccount) {
  editingId.value = record.id
  Object.assign(form, { id: record.id, access_key: record.access_key, secret_key: '', remark: record.remark || '' })
  open.value = true
}

async function save() {
  saving.value = true
  try {
    if (editingId.value) {
      const payload: Record<string, unknown> = { id: form.id, access_key: form.access_key, remark: form.remark }
      if (form.secret_key.trim()) payload.secret_key = form.secret_key
      await accountApi.update(editingId.value, payload)
    } else {
      await accountApi.create({ ...form })
    }
    open.value = false
    accountsStore.invalidate()
    await load()
    message.success('已保存')
  } catch (error) {
    message.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function remove(id: string) {
  try {
    await accountApi.remove(id)
    accountsStore.invalidate()
    await load()
    message.success('已删除')
  } catch (error) {
    message.error(errorMessage(error))
  }
}

onMounted(load)
</script>
