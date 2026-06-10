<script setup lang="ts">
import { useWasm } from '~/composables/useWasm'
import { useReceipt } from '~/composables/useReceipt'

const props = withDefaults(defineProps<{
  algorithm?: string
  preset?: string
  showReceipt?: boolean
  activityKey?: string
  label?: string
}>(), {
  algorithm: 'simd_streaming_dfg',
  preset: 'small-example',
  showReceipt: true,
  activityKey: 'concept:name',
  label: ''
})

const { init, loadXes, runAlgorithm, ready, error: wasmError } = useWasm()
const { saveReceipt } = useReceipt()

const xesInput = ref('')
const result = ref<unknown>(null)
const receipt = ref<import('../../../app/composables/useReceipt').Receipt | null>(null)
const running = ref(false)
const runError = ref<string | null>(null)
const activeTab = ref('result')
const aboutOpen = ref(false)

const presetMap: Record<string, string> = {
  'small-example': '/samples/small-example.xes',
  'road-traffic': '/samples/road-traffic.xes'
}

const algorithmBlurbs: Record<string, string> = {
  simd_streaming_dfg: 'The DFG captures which activities directly follow each other. Edge weights show frequency. It is the fastest algorithm but the least precise model.',
  heuristic_miner: 'Uses a dependency threshold (default 0.5) to filter noise. More robust than Alpha to infrequent behavior. Good for real-world noisy logs.',
  inductive_miner: 'Recursively splits the log using cut operators (sequence, parallel, choice, loop). Guarantees a sound WF-net. The quality-tier default in wasm4pm.',
  alpha_miner: 'The classic alpha-algorithm. Constructs a Petri net from footprint relations. Fast but cannot handle length-one and length-two loops.',
  token_replay_conformance: 'Fires tokens through a Petri net trace by trace. Counts missing and remaining tokens. Fitness = 1 - (missing/consumed). Threshold > 0.85 required.',
  alignment_conformance: 'Optimal alignment via A* search over the synchronous product net. Exact but O(n^2) in model size. Use for high-stakes conformance checks.',
}

const currentBlurb = computed(() => algorithmBlurbs[props.algorithm] ?? null)

const xesLineCount = computed(() => {
  if (!xesInput.value) return 0
  return xesInput.value.split('\n').length
})

onMounted(async () => {
  await init()
  const path = presetMap[props.preset ?? 'small-example'] ?? '/samples/small-example.xes'
  try {
    xesInput.value = await $fetch<string>(path, { responseType: 'text' })
  }
  catch { /* user can paste manually */ }
})

async function run() {
  if (!ready.value) return
  running.value = true
  runError.value = null
  result.value = null
  receipt.value = null
  try {
    const handle = loadXes(xesInput.value)
    result.value = runAlgorithm(props.algorithm, handle, props.activityKey)
    if (props.showReceipt) {
      receipt.value = await saveReceipt(xesInput.value, result.value, props.algorithm)
    }
    activeTab.value = 'result'
    if (currentBlurb.value) aboutOpen.value = true
  }
  catch (e: unknown) {
    runError.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    running.value = false
  }
}

const resultJson = computed(() => result.value ? JSON.stringify(result.value, null, 2) : '')

async function loadPreset(path: string) {
  try { xesInput.value = await $fetch<string>(path, { responseType: 'text' }) }
  catch { /* user can paste manually */ }
}

// DFG node/edge detection
const hasDfg = computed(() => {
  if (!result.value || typeof result.value !== 'object') return false
  const r = result.value as Record<string, unknown>
  return Array.isArray(r['nodes']) || Array.isArray(r['edges'])
})

const tabs = computed(() => {
  const t = [{ key: 'result', label: 'Result' }]
  if (hasDfg.value) t.push({ key: 'graph', label: 'Graph' })
  if (receipt.value) t.push({ key: 'receipt', label: 'Receipt' })
  return t
})
</script>

<template>
  <div class="algorithm-demo border border-default rounded-lg overflow-hidden my-6">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2 bg-elevated border-b border-default">
      <div class="flex items-center gap-2">
        <UBadge variant="soft" color="primary" size="sm">{{ algorithm }}</UBadge>
        <span v-if="label" class="text-sm text-muted">{{ label }}</span>
      </div>
      <UButton
        size="sm"
        :loading="running"
        :disabled="!ready"
        icon="i-lucide-play"
        @click="run"
      >
        Run
      </UButton>
    </div>

    <!-- Input area -->
    <div class="p-4 border-b border-default">
      <div class="flex gap-2 mb-2">
        <span class="text-xs text-muted uppercase tracking-wider">Input XES</span>
        <div class="flex gap-1 ml-auto">
          <UButton
            v-for="(path, key) in presetMap" :key="key"
            size="xs" variant="ghost"
            @click="loadPreset(path)"
          >
            {{ key }}
          </UButton>
        </div>
      </div>
      <UTextarea
        v-model="xesInput"
        :rows="4"
        placeholder="Paste XES event log here, or click a preset above…"
        class="font-mono text-xs"
      />
      <div v-if="xesLineCount > 0" class="mt-1 text-xs text-muted">
        {{ xesLineCount }} lines loaded
      </div>
    </div>

    <!-- WASM loading notice -->
    <div v-if="!ready" class="px-4 py-2 text-xs text-muted flex items-center gap-2">
      <UIcon name="i-lucide-loader-2" class="animate-spin" />
      Loading WASM runtime…
    </div>
    <div v-if="wasmError" class="px-4 py-2 text-xs text-error">
      WASM error: {{ wasmError }}
    </div>

    <!-- Output tabs -->
    <div v-if="result || runError" class="p-4">
      <UAlert v-if="runError" color="error" :description="runError" class="mb-3" />
      <template v-else>
        <UTabs :items="tabs" v-model="activeTab" size="sm" class="mb-3" />
        <div v-show="activeTab === 'result'">
          <pre class="text-xs bg-default rounded p-3 overflow-auto max-h-64">{{ resultJson }}</pre>
        </div>
        <div v-show="activeTab === 'graph'">
          <ProcessGraph v-if="hasDfg" :data="result as Record<string, unknown>" />
        </div>
        <div v-show="activeTab === 'receipt'">
          <ReceiptViewer v-if="receipt" :receipt="receipt" />
        </div>
      </template>

      <!-- About this algorithm (collapsible) -->
      <div v-if="currentBlurb" class="mt-3 border border-default rounded">
        <button
          class="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted hover:text-default transition-colors"
          @click="aboutOpen = !aboutOpen"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide-info" class="w-3.5 h-3.5" />
            About this algorithm
          </span>
          <UIcon
            :name="aboutOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="w-3.5 h-3.5"
          />
        </button>
        <div v-show="aboutOpen" class="px-3 pb-3 text-xs text-muted leading-relaxed border-t border-default pt-2">
          {{ currentBlurb }}
        </div>
      </div>
    </div>
  </div>
</template>
