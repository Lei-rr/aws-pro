<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { loadAccounts, useAccountStore } from '@/features/accounts/stores/accounts'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'

const props = withDefaults(
  defineProps<{ modelValue?: string; disabled?: boolean; autoSelect?: boolean }>(),
  { autoSelect: true },
)
const emit = defineEmits<{ 'update:modelValue': [string]; loaded: [unknown[]] }>()

const loading = ref(false)
const accountStore = useAccountStore()
const accounts = computed(() => accountStore.accounts || [])

onMounted(async () => {
  loading.value = true
  try {
    await loadAccounts()
    emit('loaded', accounts.value)
    if (props.autoSelect && !props.modelValue && accounts.value[0]) {
      emit('update:modelValue', accounts.value[0].id)
    }
  } catch (e) {
    emit('loaded', accounts.value)
    toast.error(errorMessage(e, '加载账号失败'))
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <Select
    :model-value="modelValue || ''"
    :disabled="loading || disabled"
    @update:model-value="(v) => emit('update:modelValue', String(v || ''))"
  >
    <SelectTrigger class="w-full min-w-[10rem]">
      <SelectValue placeholder="选择账号" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="item in accounts" :key="item.id" :value="item.id">
        {{ item.remark ? `${item.id} - ${item.remark}` : item.id }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
