<script setup lang="ts">
import { useDropZone } from '@vueuse/core'

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

const COGNITION_BREEDS = [
  { id: 'ELIZA', label: 'ELIZA' },
  { id: 'MYCIN', label: 'MYCIN' },
  { id: 'CBR', label: 'CBR' },
  { id: 'STRIPS', label: 'STRIPS' },
  { id: 'PROLOG', label: 'PROLOG' }
]

const SAMPLE_LOGS = [
  { id: 'small-example', label: 'Small Example', path: '/samples/small-example.xes' },
  { id: 'road-traffic', label: 'Road Traffic (218KB)', path: '/samples/road-traffic.xes' },
  { id: 'ocel-example', label: 'OCEL 2.0 Example', path: '/samples/ocel-example.json' }
]

const { init, loadXes, loadOcel, runAlgorithm, ready, error: wasmError } = useWasm()
const { saveReceipt } = useReceipt()

const selectedAlgo = ref('simd_streaming_dfg')
const selectedBreed = ref<string | null>(null)
const xesInput = ref('')
const result = ref<unknown>(null)
const receipt = ref<import('../../composables/useReceipt').Receipt | null>(null)
const running = ref(false)
const runError = ref<string | null>(null)
const activeTab = ref('json')
const sidebarSearch = ref('')
const shareCopied = ref(false)

// Determine if current input is OCEL (JSON) vs XES
const isOcelInput = computed(() => {
  const trimmed = xesInput.value.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
})

// Whether a cognition breed is active (drives right-panel swap)
const isCognitionMode = computed(() => selectedBreed.value !== null)

// Shareable URL
const route = useRoute()
const router = useRouter()
onMounted(async () => {
  await init()
  if (route.query.algo) {
    selectedAlgo.value = String(route.query.algo)
    selectedBreed.value = null
  }
  if (route.query.breed) {
    selectedBreed.value = String(route.query.breed)
  }
  const preset = String(route.query.preset ?? 'small-example')
  const sample = SAMPLE_LOGS.find(s => s.id === preset) ?? SAMPLE_LOGS[0]
  xesInput.value = await $fetch<string>(sample!.path, { responseType: 'text' })
})

// Keyboard shortcut: Cmd+Enter / Ctrl+Enter to run
useEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    if (!isCognitionMode.value) run()
  }
})

// Drag-and-drop file upload
const dropZoneRef = ref<HTMLElement | null>(null)
const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop(files) {
    if (!files || files.length === 0) return
    const file = files[0]!
    const reader = new FileReader()
    reader.onload = (e) => {
      xesInput.value = (e.target?.result as string) ?? ''
    }
    reader.readAsText(file)
  },
  dataTypes: ['text/xml', 'application/xml', 'application/json', 'text/plain']
})

async function run() {
  if (!ready.value) return
  running.value = true
  runError.value = null
  result.value = null
  receipt.value = null
  try {
    router.replace({ query: { algo: selectedAlgo.value } })
    const handle = isOcelInput.value
      ? loadOcel(xesInput.value)
      : loadXes(xesInput.value)
    result.value = runAlgorithm(selectedAlgo.value, handle, 'concept:name')
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

async function shareUrl() {
  const query: Record<string, string> = { algo: selectedAlgo.value }
  if (selectedBreed.value) query['breed'] = selectedBreed.value
  const url = new URL(window.location.href)
  url.search = new URLSearchParams(query).toString()
  await navigator.clipboard.writeText(url.toString())
  shareCopied.value = true
  setTimeout(() => { shareCopied.value = false }, 2000)
}

function selectAlgo(id: string) {
  selectedAlgo.value = id
  selectedBreed.value = null
}

function selectBreed(id: string) {
  selectedBreed.value = id
}

const filteredGroups = computed(() => {
  const q = sidebarSearch.value.toLowerCase()
  if (!q) return ALGORITHM_GROUPS
  return ALGORITHM_GROUPS
    .map(g => ({ ...g, algorithms: g.algorithms.filter(a => a.id.includes(q) || a.label.toLowerCase().includes(q)) }))
    .filter(g => g.algorithms.length > 0)
})

const filteredBreeds = computed(() => {
  const q = sidebarSearch.value.toLowerCase()
  if (!q) return COGNITION_BREEDS
  return COGNITION_BREEDS.filter(b => b.id.toLowerCase().includes(q) || b.label.toLowerCase().includes(q))
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
        <!-- Algorithm groups -->
        <div v-for="group in filteredGroups" :key="group.label" class="mb-3">
          <p class="text-xs text-muted uppercase tracking-wider px-2 py-1">{{ group.label }}</p>
          <button
            v-for="algo in group.algorithms"
            :key="algo.id"
            class="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accented transition-colors"
            :class="{ 'bg-primary/10 text-primary font-medium': !isCognitionMode && selectedAlgo === algo.id }"
            @click="selectAlgo(algo.id)"
          >
            {{ algo.label }}
          </button>
        </div>

        <!-- Cognition Breeds section -->
        <div v-if="filteredBreeds.length > 0" class="mb-3">
          <p class="text-xs text-muted uppercase tracking-wider px-2 py-1">Cognition Breeds</p>
          <button
            v-for="breed in filteredBreeds"
            :key="breed.id"
            class="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accented transition-colors"
            :class="{ 'bg-primary/10 text-primary font-medium': isCognitionMode && selectedBreed === breed.id }"
            @click="selectBreed(breed.id)"
          >
            {{ breed.label }}
          </button>
        </div>
      </div>
    </aside>

    <!-- Main area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <header class="flex items-center gap-3 px-4 py-2 border-b border-default bg-elevated">
        <code class="text-sm font-semibold text-primary">
          {{ isCognitionMode ? `cognition:${selectedBreed}` : selectedAlgo }}
        </code>
        <div class="flex gap-1 ml-auto">
          <UButton
            v-for="s in SAMPLE_LOGS" :key="s.id"
            size="xs" variant="ghost"
            @click="loadPreset(s.path)"
          >{{ s.label }}</UButton>
        </div>
        <UButton
          size="xs"
          variant="ghost"
          :icon="shareCopied ? 'i-lucide-check' : 'i-lucide-share-2'"
          :color="shareCopied ? 'success' : undefined"
          @click="shareUrl"
        >
          {{ shareCopied ? 'Copied!' : 'Share' }}
        </UButton>
        <UButton
          v-if="!isCognitionMode"
          :loading="running"
          :disabled="!ready"
          icon="i-lucide-play"
          size="sm"
          @click="run"
        >
          Run
          <span class="text-xs text-muted ml-1 hidden sm:inline">⌘↵</span>
        </UButton>
      </header>

      <!-- Cognition mode: full-panel CognitionDemo -->
      <div v-if="isCognitionMode" class="flex-1 overflow-auto p-4">
        <ContentCognitionDemo :breed="selectedBreed!" />
      </div>

      <!-- Algorithm mode: split input + output -->
      <div v-else class="flex-1 flex overflow-hidden">
        <!-- Input with drag-and-drop -->
        <div
          ref="dropZoneRef"
          class="w-1/2 flex flex-col border-r border-default transition-colors"
          :class="{ 'bg-primary/5 border-primary': isOverDropZone }"
        >
          <div class="px-3 py-1.5 border-b border-default text-xs text-muted uppercase tracking-wider flex items-center gap-2">
            <span>Input (XES / OCEL)</span>
            <span v-if="isOcelInput" class="text-primary font-medium normal-case">OCEL</span>
            <UIcon v-if="isOverDropZone" name="i-lucide-upload" class="ml-auto text-primary" />
            <span v-else class="ml-auto text-muted/60 normal-case">drop file to load</span>
          </div>
          <textarea
            v-model="xesInput"
            class="flex-1 resize-none font-mono text-xs p-3 bg-default text-foreground focus:outline-none"
            placeholder="Paste XES event log or OCEL JSON here, drop a file, or load a preset from the top bar…"
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
              <ContentProcessGraph v-show="activeTab === 'graph'" :data="result as Record<string, unknown>" />
              <ContentReceiptViewer v-show="activeTab === 'receipt' && receipt" :receipt="receipt!" />
            </template>
            <div v-else class="text-sm text-muted text-center mt-16">
              Select an algorithm, load a log, and click Run (or press ⌘↵).
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
