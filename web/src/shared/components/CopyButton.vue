<script setup lang="ts">
import { Copy } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import { copyText } from '@/shared/lib/clipboard'

const props = defineProps<{ value?: string | number | null }>()

async function onCopy() {
  await copyText(props.value)
}
</script>

<template>
  <Button type="button" variant="ghost" size="icon" class="size-7 shrink-0" title="复制" @click.stop="onCopy">
    <Copy class="size-3.5" />
  </Button>
</template>
