<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AppDialog } from '@/shared/ui/dialog'
import { Button, LoadingButton } from '@/shared/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'
import { ec2Api } from '@/features/ec2/api/ec2'
import { apiObject } from '@/shared/api/http'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { regionName } from '@/shared/lib/format'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  accountId: string
  region: string
  regions: Record<string, string>
}>()
const emit = defineEmits<{ created: [] }>()

const loading = ref(false)
const creating = ref(false)
const optionsError = ref('')
let optionsRequestToken = 0
const options = ref<{ amis: Record<string, string>; instance_types: Record<string, string> }>({
  amis: {},
  instance_types: {},
})
const form = ref(emptyForm())

function createClientToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `ec2-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}
function emptyForm() {
  return {
    client_token: createClientToken(),
    name: '',
    ami: 'ubuntu-24.04',
    instance_type: 't3.micro',
    enable_ipv6: true,
    root_password: '',
  }
}

const regionLabel = computed(() => regionName(props.regions, props.region))
const amiEntries = computed(() => Object.entries(options.value.amis || {}))
const typeEntries = computed(() => Object.entries(options.value.instance_types || {}))

async function loadOptions() {
  const token = ++optionsRequestToken
  optionsError.value = ''
  loading.value = true
  try {
    const response = await ec2Api.createOptions()
    if (token !== optionsRequestToken || !open.value) return
    options.value = (apiObject(response) as typeof options.value) || { amis: {}, instance_types: {} }
    if (!options.value.amis[form.value.ami]) {
      form.value.ami = Object.keys(options.value.amis)[0] || form.value.ami
    }
    if (!options.value.instance_types[form.value.instance_type]) {
      form.value.instance_type = Object.keys(options.value.instance_types)[0] || form.value.instance_type
    }
  } catch (e) {
    if (token !== optionsRequestToken || !open.value) return
    options.value = { amis: {}, instance_types: {} }
    optionsError.value = errorMessage(e, '加载 EC2 创建配置失败')
  } finally {
    if (token === optionsRequestToken) loading.value = false
  }
}

watch(open, (v) => {
  if (!v) {
    optionsRequestToken += 1
    loading.value = false
    return
  }
  form.value = emptyForm()
  options.value = { amis: {}, instance_types: {} }
  optionsError.value = ''
  void loadOptions()
})

async function submit() {
  form.value.name = form.value.name.trim()
  if (!form.value.name || !form.value.ami || !form.value.instance_type) {
    toast.warning('请完整填写 EC2 创建配置')
    return
  }
  creating.value = true
  try {
    const response = apiObject(await ec2Api.create({
      ...form.value,
      account_id: props.accountId,
      region: props.region,
    })) as { warnings?: Array<{ message?: string }> }
    open.value = false
    toast.success('EC2 创建命令已提交')
    for (const warning of response.warnings || []) toast.warning(warning.message || '创建成功，但列表同步失败')
    emit('created')
  } catch (e) {
    toast.error(errorMessage(e, '创建 EC2 失败'))
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="创建 EC2 实例"
    :description="`账号 ${accountId || '—'} · 区域 ${regionLabel}`"
    class="sm:max-w-lg"
  >
    <FieldGroup class="gap-3">
      <FieldError v-if="optionsError" class="flex items-center gap-1.5">
        <span>{{ optionsError }}</span>
        <Button type="button" variant="link" size="sm" class="h-auto px-0" @click="loadOptions">重试</Button>
      </FieldError>
      <Field>
        <FieldLabel>名称</FieldLabel>
        <Input v-model="form.name" placeholder="例如 app-01" :disabled="loading || creating" />
      </Field>
      <Field>
        <FieldLabel>AMI</FieldLabel>
        <Select v-model="form.ami" :disabled="loading || creating">
          <SelectTrigger><SelectValue placeholder="选择 AMI" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="[id, label] in amiEntries" :key="id" :value="id">{{ label || id }}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>实例类型</FieldLabel>
        <Select v-model="form.instance_type" :disabled="loading || creating">
          <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="[id, label] in typeEntries" :key="id" :value="id">{{ label || id }}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field class="flex flex-row items-center justify-between gap-3">
        <FieldLabel>启用 IPv6</FieldLabel>
        <Switch :model-value="form.enable_ipv6" @update:model-value="(v) => (form.enable_ipv6 = !!v)" />
      </Field>
      <Field>
        <FieldLabel>Root 密码（可选）</FieldLabel>
        <Input
          v-model="form.root_password"
          type="password"
          placeholder="留空则使用默认"
          :disabled="loading || creating"
        />
      </Field>
    </FieldGroup>
    <template #footer>
      <Button variant="outline" :disabled="creating" @click="open = false">取消</Button>
      <LoadingButton :loading="creating || loading" :disabled="!!optionsError" @click="submit">创建</LoadingButton>
    </template>
  </AppDialog>
</template>
