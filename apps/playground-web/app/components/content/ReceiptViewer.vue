<script setup lang="ts">
import type { Receipt } from '../../../app/composables/useReceipt'

const props = defineProps<{ receipt: Receipt }>()

const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(JSON.stringify(props.receipt, null, 2))
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const shortHash = (h: string) => h.slice(0, 16) + '…'
</script>

<template>
  <div class="receipt-viewer border border-default rounded-lg p-4 font-mono text-xs bg-elevated">
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm font-semibold">BLAKE3 Receipt</span>
      <UButton size="xs" variant="ghost" :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" @click="copy">
        {{ copied ? 'Copied' : 'Copy JSON' }}
      </UButton>
    </div>
    <div class="space-y-2">
      <div class="flex gap-3">
        <span class="text-muted w-24 shrink-0">algorithm</span>
        <UBadge variant="soft" size="sm">{{ receipt.algorithm }}</UBadge>
      </div>
      <div class="flex gap-3">
        <span class="text-muted w-24 shrink-0">run_id</span>
        <span class="truncate text-primary">{{ receipt.run_id }}</span>
      </div>
      <div class="flex gap-3">
        <span class="text-muted w-24 shrink-0">input_hash</span>
        <span class="text-green-400 dark:text-green-300 truncate" :title="receipt.input_hash">
          {{ shortHash(receipt.input_hash) }}
        </span>
      </div>
      <div class="flex gap-3">
        <span class="text-muted w-24 shrink-0">output_hash</span>
        <span class="text-blue-400 dark:text-blue-300 truncate" :title="receipt.output_hash">
          {{ shortHash(receipt.output_hash) }}
        </span>
      </div>
      <div class="flex gap-3">
        <span class="text-muted w-24 shrink-0">timestamp</span>
        <span>{{ receipt.timestamp }}</span>
      </div>
      <div class="flex gap-3">
        <span class="text-muted w-24 shrink-0">input_size</span>
        <span>{{ (receipt.input_size ?? 0).toLocaleString() }} bytes</span>
      </div>
    </div>
  </div>
</template>
