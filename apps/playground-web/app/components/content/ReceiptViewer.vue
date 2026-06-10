<script setup lang="ts">
import type { Receipt } from '../../../app/composables/useReceipt'

const props = defineProps<{ receipt: Receipt }>()

const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(JSON.stringify(props.receipt, null, 2))
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const shortHash = (h: string) => h.slice(0, 32) + '…'
</script>

<template>
  <div class="receipt-viewer border border-green-400/20 rounded-lg font-mono text-xs" style="background: var(--color-surface-0)">
    <!-- Trophy header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-green-400/10">
      <div class="flex items-center gap-2">
        <span class="text-green-400 text-base leading-none">⬡</span>
        <span class="text-[10px] text-green-400 tracking-widest uppercase font-semibold">BLAKE3 Receipt</span>
      </div>
      <UButton
        size="xs"
        variant="ghost"
        color="primary"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        @click="copy"
      >
        {{ copied ? 'Copied' : 'Copy JSON' }}
      </UButton>
    </div>

    <!-- Identity section -->
    <div class="px-4 py-3 space-y-2 border-b border-green-400/10">
      <div class="flex items-center gap-3">
        <span class="text-zinc-500 w-24 shrink-0">algorithm</span>
        <UBadge color="primary" variant="soft" size="sm">
          {{ receipt.algorithm }}
        </UBadge>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-zinc-500 w-24 shrink-0">run_id</span>
        <span class="truncate" style="color: var(--color-hash-run-id)">{{ receipt.run_id }}</span>
      </div>
    </div>

    <!-- Hash section — proof-of-work core -->
    <div class="px-4 py-3 space-y-2.5 border-b border-green-400/10">
      <div class="flex items-start gap-3">
        <span class="text-zinc-500 w-24 shrink-0 pt-0.5">input_hash</span>
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-green-400 shrink-0">▌</span>
          <span class="truncate" style="color: var(--color-hash-input)" :title="receipt.input_hash">{{ shortHash(receipt.input_hash) }}</span>
        </div>
      </div>
      <div class="flex items-start gap-3">
        <span class="text-zinc-500 w-24 shrink-0 pt-0.5">output_hash</span>
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-blue-400 shrink-0">▌</span>
          <span class="truncate" style="color: var(--color-hash-output)" :title="receipt.output_hash">{{ shortHash(receipt.output_hash) }}</span>
        </div>
      </div>
    </div>

    <!-- Footer metadata -->
    <div class="px-4 py-2.5 flex items-center gap-3 text-[10px] text-zinc-600">
      <span>{{ receipt.timestamp }}</span>
      <span>·</span>
      <span>{{ (receipt.input_size ?? 0).toLocaleString() }} bytes</span>
    </div>
  </div>
</template>
