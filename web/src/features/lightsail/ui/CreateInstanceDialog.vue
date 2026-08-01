<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AppDialog } from '@/shared/ui/dialog'
import { Button, LoadingButton } from '@/shared/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { lightsailApi } from '@/features/lightsail/api/lightsail'
import { apiObject } from '@/shared/api/http'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { regionName } from '@/shared/lib/format'

type BundleItem = { id: string; label?: string; is_ipv6_only?: boolean }

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  accountId: string
  region: string
  regions: Record<string, string>
  blueprints: Record<string, string>
}>()
const emit = defineEmits<{ created: [] }>()

const loading = ref(false)
const creating = ref(false)
const optionsError = ref('')
let optionsRequestToken = 0
const createOptions = ref<{ zones: string[]; bundles: Record<string, string>; bundle_items: BundleItem[] }>({
  zones: [],
  bundles: {},
  bundle_items: [],
})
const form = ref({
  name: '',
  zone: '',
  blueprint: 'ubuntu_24_04',
  bundle: '',
  ip_address_type: 'dualstack',
  root_password: '',
})
const openedScope = ref('')

const regionLabel = computed(() => regionName(props.regions, props.region))
const blueprintEntries = computed(() => Object.entries(props.blueprints || {}))
const bundleOptions = computed(() => {
  const items: BundleItem[] = createOptions.value.bundle_items?.length
    ? createOptions.value.bundle_items
    : Object.entries(createOptions.value.bundles || {}).map(([id, label]) => ({ id, label }))
  return items.filter((item) => {
    const id = item.id || ''
    const isIpv6 = item.is_ipv6_only ?? id.includes('_ipv6_')
    return form.value.ip_address_type === 'ipv6' ? isIpv6 : !isIpv6
  })
})

function ensureBundle() {
  if (!bundleOptions.value.some((item) => item.id === form.value.bundle)) {
    form.value.bundle = bundleOptions.value[0]?.id || ''
  }
}

async function loadOptions() {
  if (!props.accountId || !props.region) return
  const token = ++optionsRequestToken
  const scopeAccountId = props.accountId
  const scopeRegion = props.region
  optionsError.value = ''
  loading.value = true
  try {
    const response = await lightsailApi.createOptions({
      account_id: scopeAccountId,
      region: scopeRegion,
    })
    if (
      token !== optionsRequestToken ||
      !open.value ||
      scopeAccountId !== props.accountId ||
      scopeRegion !== props.region
    )
      return
    createOptions.value = apiObject(response) as typeof createOptions.value
    form.value.zone = createOptions.value.zones?.[0] || ''
    if (!form.value.blueprint) {
      form.value.blueprint = Object.keys(props.blueprints || {})[0] || 'ubuntu_24_04'
    }
    ensureBundle()
  } catch (e) {
    if (
      token !== optionsRequestToken ||
      !open.value ||
      scopeAccountId !== props.accountId ||
      scopeRegion !== props.region
    )
      return
    createOptions.value = { zones: [], bundles: {}, bundle_items: [] }
    optionsError.value = errorMessage(e, '加载创建配置失败')
  } finally {
    if (token === optionsRequestToken) loading.value = false
  }
}

watch(open, (v) => {
  if (!v) {
    optionsRequestToken += 1
    loading.value = false
    creating.value = false
    openedScope.value = ''
    return
  }
  openedScope.value = `${props.accountId}::${props.region}`
  form.value = {
    name: '',
    zone: '',
    blueprint: Object.keys(props.blueprints || {})[0] || 'ubuntu_24_04',
    bundle: '',
    ip_address_type: 'dualstack',
    root_password: '',
  }
  createOptions.value = { zones: [], bundles: {}, bundle_items: [] }
  optionsError.value = ''
  void loadOptions()
})

watch(
  () => form.value.ip_address_type,
  () => ensureBundle()
)

watch(
  () => `${props.accountId}::${props.region}`,
  (scope) => {
    if (open.value && scope !== openedScope.value) open.value = false
  }
)

async function submit() {
  if (creating.value || loading.value) return
  const owner = openedScope.value
  if (!open.value || owner !== `${props.accountId}::${props.region}`) return
  form.value.name = form.value.name.trim()
  if (!form.value.name || !form.value.zone || !form.value.blueprint || !form.value.bundle) {
    toast.warning('请完整填写实例配置')
    return
  }
  if (!bundleOptions.value.some((item) => item.id === form.value.bundle)) {
    toast.warning('当前 IP 类型下没有可用套餐')
    return
  }
  creating.value = true
  try {
    const response = apiObject(
      await lightsailApi.create({
        ...form.value,
        account_id: props.accountId,
        region: props.region,
      })
    ) as { warnings?: Array<{ message?: string }> }
    if (!open.value || owner !== openedScope.value || owner !== `${props.accountId}::${props.region}`) return
    open.value = false
    toast.success('创建命令已提交')
    for (const warning of response.warnings || []) toast.warning(warning.message || '创建成功，但列表同步失败')
    emit('created')
  } catch (e) {
    if (!open.value || owner !== openedScope.value || owner !== `${props.accountId}::${props.region}`) return
    toast.error(errorMessage(e, '创建失败'))
  } finally {
    if (owner === openedScope.value) creating.value = false
  }
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="创建 Lightsail 实例"
    :description="`账号 ${accountId || '—'} · 区域 ${regionLabel}`"
    class="sm:max-w-lg"
  >
    <FieldGroup class="gap-3">
      <FieldError v-if="optionsError" class="flex items-center gap-1.5">
        <span>{{ optionsError }}</span>
        <Button type="button" variant="link" size="sm" class="h-auto px-0" @click="loadOptions">重试</Button>
      </FieldError>
      <Field>
        <FieldLabel>实例名</FieldLabel>
        <Input v-model="form.name" placeholder="例如 web-01" :disabled="loading || creating" />
      </Field>
      <Field>
        <FieldLabel>可用区</FieldLabel>
        <Select v-model="form.zone" :disabled="loading || creating">
          <SelectTrigger><SelectValue placeholder="选择可用区" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="z in createOptions.zones" :key="z" :value="z">{{ z }}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>系统镜像</FieldLabel>
        <Select v-model="form.blueprint" :disabled="loading || creating">
          <SelectTrigger><SelectValue placeholder="选择镜像" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="[id, label] in blueprintEntries" :key="id" :value="id">{{ label || id }}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>IP 类型</FieldLabel>
        <Select v-model="form.ip_address_type" :disabled="loading || creating">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dualstack">双栈</SelectItem>
            <SelectItem value="ipv4">仅 IPv4</SelectItem>
            <SelectItem value="ipv6">仅 IPv6</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>套餐</FieldLabel>
        <Select v-model="form.bundle" :disabled="loading || creating">
          <SelectTrigger><SelectValue placeholder="选择套餐" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in bundleOptions" :key="item.id" :value="item.id">
              {{ item.label || item.id }}
            </SelectItem>
          </SelectContent>
        </Select>
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
