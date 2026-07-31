<script setup lang="ts">
import { AppDialog } from '@/shared/ui/dialog'
import { Button, LoadingButton } from '@/shared/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'

const open = defineModel<boolean>('open', { default: false })
defineProps<{
  saving?: boolean
  form: { name?: string; remark?: string }
}>()
const emit = defineEmits<{
  save: []
  'update:remark': [value: string]
}>()
</script>

<template>
  <AppDialog v-model:open="open" title="编辑实例备注" description="输入便于识别的业务说明。">
    <FieldGroup>
      <Field>
        <FieldLabel>实例</FieldLabel>
        <Input :model-value="form.name || ''" disabled />
      </Field>
      <Field>
        <FieldLabel>备注</FieldLabel>
        <Input
          :model-value="form.remark || ''"
          maxlength="200"
          placeholder="业务说明（最多 200 字）"
          @update:model-value="emit('update:remark', String($event ?? ''))"
        />
      </Field>
    </FieldGroup>
    <template #footer>
      <Button variant="outline" @click="open = false">取消</Button>
      <LoadingButton :loading="!!saving" @click="emit('save')">保存</LoadingButton>
    </template>
  </AppDialog>
</template>
