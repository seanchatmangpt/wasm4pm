<script setup lang="ts">
useHead({ title: 'Sandbox — wasm4pm Playground' })

const ALGORITHM_GROUPS = [
  {
    label: 'Discovery',
    algorithms: [
      { id: 'simd_streaming_dfg', label: 'DFG (streaming)', default: true },
      { id: 'heuristic_miner', label: 'Heuristic Miner' },
      { id: 'inductive_miner', label: 'Inductive Miner' },
      { id: 'alpha_miner', label: 'Alpha Miner' },
      { id: 'alpha_plus_plus', label: 'Alpha++' },
      { id: 'ilp_miner', label: 'ILP Miner' },
      { id: 'genetic_miner', label: 'Genetic Miner' },
      { id: 'powl_miner', label: 'POWL Miner' },
      { id: 'declare_miner', label: 'Declare Miner' }
    ]
  },
  {
    label: 'Conformance',
    algorithms: [
      { id: 'token_replay_conformance', label: 'Token Replay' },
      { id: 'alignment_conformance', label: 'Alignment' },
      { id: 'footprint_conformance', label: 'Footprint' }
    ]
  },
  {
    label: 'Streaming / Drift',
    algorithms: [
      { id: 'streaming_dfg', label: 'Streaming DFG' },
      { id: 'concept_drift_detection', label: 'Concept Drift' }
    ]
  },
  {
    label: 'ML',
    algorithms: [
      { id: 'ml_classify', label: 'Classify' },
      { id: 'ml_cluster', label: 'Cluster' },
      { id: 'ml_forecast', label: 'Forecast' },
      { id: 'ml_anomaly', label: 'Anomaly' },
      { id: 'ml_regress', label: 'Regress' },
      { id: 'ml_pca', label: 'PCA' }
    ]
  },
  {
    label: 'Prediction',
    algorithms: [
      { id: 'next_activity_prediction', label: 'Next Activity' },
      { id: 'remaining_time_prediction', label: 'Remaining Time' }
    ]
  }
]

const SAMPLE_LOGS = [
  { id: 'small-example', label: 'Small Example', path: '/samples/small-example.xes' },
  { id: 'road-traffic', label: 'Road Traffic (218KB)', path: '/samples/road-traffic.xes' }
]

const { init, loadXes, runAlgorithm, ready, error: wasmError } = useWasm()
const { saveReceipt } = useReceipt()

const selectedAlgo = ref('simd_streaming_dfg')
const xesInput = ref('')
const result = ref<unknown>(null)
const receipt = ref<import('../../composables/useReceipt').Receipt | null>(null)
const running = ref(false)
const runError = ref<string | null>(null)
const activeTab = ref('json')
const sidebarSearch = ref('')

// Shareable URL
const route = useRoute()
const router = useRouter()
onMounted(async () => {
  await init()
  if (route.query.algo) selectedAlgo.value = String(route.query.algo)
  const preset = String(route.query.preset ?? 'small-example')
  const sample = SAMPLE_LOGS.find(s => s.id === preset) ?? SAMPLE_LOGS[0]
  xesInput.value = await $fetch<string>(sample!.path, { responseType: 'text' })
})

async function run() {
  if (!ready.value) return
  running.value = true
  runError.value = null
  result.value = null
  receipt.value = null
  try {
    router.replace({ query: { algo: selectedAlgo.value } })
    const handle = loadXes(xesInput.value)
    result.value = runAlgorithm(selectedAlgo.value, handle, { activity_key: 'concept:name' })
    receipt.value = await saveReceipt(xesInput.value, result.value, selectedAlgo.value)
    activeTab.value = 'json'
  }
  catch (e: unknown) { runError.value = e instanceof Error ? e.message : String(e) }
  finally { running.value = false }
}

async function loadPreset(path: string) {
  xesInput.value = await $fetch<string>(path, { responseType: 'text' })
}

async function copyResult() {
  await navigator.clipboard.writeText(JSON.stringify(result.value, null, 2))
}

async function downloadResult() {
  const blob = new Blob([JSON.stringify(result.value, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${selectedAlgo.value}-result.json`
  a.click()
}

const filteredGroups = computed(() => {
  const q = sidebarSearch.value.toLowerCase()
  if (!q) return ALGORITHM_GROUPS
  return ALGORITHM_GROUPS
    .map(g => ({ ...g, algorithms: g.algorithms.filter(a => a.id.includes(q) || a.label.toLowerCase().includes(q)) }))
    .filter(g => g.algorithms.length > 0)
})

const hasDfg = computed(() => {
  if (!result.value || typeof result.value !== 'object') return false
  const r = result.value as Record<string, unknown>
  return Array.isArray(r['nodes']) || Array.isArray(r['edges'])
})

const outputTabs = computed(() => {
  const t = [{ key: 'json', label: 'JSON' }]
  if (hasDfg.value) t.push({ key: 'graph', label: 'Graph' })
  if (receipt.value) t.push({ key: 'receipt', label: 'Receipt' })
  return t
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-default">
    <!-- Algorithm sidebar -->
    <aside class="w-64 shrink-0 border-r border-default bg-elevated flex flex-col">
      <div class="p-3 border-b border-default">
        <UButton to="/learn/tutorials/getting-started" variant="ghost" size="xs" icon="i-lucide-arrow-left" class="mb-2">
          Docs
        </UButton>
        <UInput v-model="sidebarSearch" placeholder="Filter algorithms…" size="sm" icon="i-lucide-search" />
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <div v-for="group in filteredGroups" :key="group.label" class="mb-3">
          <p class="text-xs text-muted uppercase tracking-wider px-2 py-1">{{ group.label }}</p>
          <button
            v-for="algo in group.algorithms"
            :key="algo.id"
            class="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accented transition-colors"
            :class="{ 'bg-primary/10 text-primary font-medium': selectedAlgo === algo.id }"
            @click="selectedAlgo = algo.id"
          >
            {{ algo.label }}
          </button>
        </div>
      </div>
    </aside>

    <!-- Main area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <header class="flex items-center gap-3 px-4 py-2 border-b border-default bg-elevated">
        <code class="text-sm font-semibold text-primary">{{ selectedAlgo }}</code>
        <div class="flex gap-1 ml-auto">
          <UButton
            v-for="s in SAMPLE_LOGS" :key="s.id"
            size="xs" variant="ghost"
            @click="loadPreset(s.path)"
          >{{ s.label }}</UButton>
        </div>
        <UButton
          :loading="running"
          :disabled="!ready"
          icon="i-lucide-play"
          size="sm"
          @click="run"
        >
          Run
        </UButton>
      </header>

      <!-- Split: input + output -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Input -->
        <div class="w-1/2 flex flex-col border-r border-default">
          <div class="px-3 py-1.5 border-b border-default text-xs text-muted uppercase tracking-wider">
            Input (XES / OCEL)
          </div>
          <textarea
            v-model="xesInput"
            class="flex-1 resize-none font-mono text-xs p-3 bg-default text-foreground focus:outline-none"
            placeholder="Paste XES event log here, or load a preset from the top bar…"
          />
        </div>

        <!-- Output -->
        <div class="w-1/2 flex flex-col">
          <div class="flex items-center gap-2 px-3 py-1.5 border-b border-default">
            <UTabs :items="outputTabs" v-model="activeTab" size="xs" />
            <div class="flex gap-1 ml-auto" v-if="result">
              <UButton size="xs" variant="ghost" icon="i-lucide-copy" @click="copyResult" />
              <UButton size="xs" variant="ghost" icon="i-lucide-download" @click="downloadResult" />
            </div>
          </div>
          <div class="flex-1 overflow-auto p-3">
            <div v-if="!ready" class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-lucide-loader-2" class="animate-spin" />
              Loading WASM runtime…
            </div>
            <UAlert v-else-if="wasmError" color="error" :description="wasmError" />
            <UAlert v-else-if="runError" color="error" :description="runError" />
            <template v-else-if="result">
              <pre v-show="activeTab === 'json'" class="text-xs font-mono">{{ JSON.stringify(result, null, 2) }}</pre>
              <ProcessGraph v-show="activeTab === 'graph'" :data="result as Record<string, unknown>" />
              <ReceiptViewer v-show="activeTab === 'receipt' && receipt" :receipt="receipt!" />
            </template>
            <div v-else class="text-sm text-muted text-center mt-16">
              Select an algorithm, load a log, and click Run.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
