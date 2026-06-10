<script setup lang="ts">
import { useDropZone } from '@vueuse/core'

useHead({ title: 'Sandbox — wasm4pm Playground' })

const ALGORITHM_GROUPS = [
  {
    label: 'Discovery',
    algorithms: [
      { id: 'dfg', label: 'DFG', default: true },
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

const selectedAlgo = ref('dfg')
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
  } catch (e: unknown) { runError.value = e instanceof Error ? e.message : String(e) } finally { running.value = false }
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
  <div class="flex h-screen overflow-hidden" style="background: var(--color-surface-0)">
    <!-- Algorithm sidebar -->
    <aside class="w-56 shrink-0 flex flex-col" style="background: var(--color-surface-1); border-right: 1px solid var(--color-surface-border)">
      <div class="p-3" style="border-bottom: 1px solid var(--color-surface-border)">
        <UButton
          to="/learn/tutorials/getting-started"
          variant="ghost"
          size="xs"
          icon="i-lucide-arrow-left"
          class="mb-2 text-zinc-500 hover:text-zinc-300"
        >
          Docs
        </UButton>
        <UInput
          v-model="sidebarSearch"
          placeholder="Filter…"
          size="sm"
          icon="i-lucide-search"
        />
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <!-- Algorithm groups -->
        <div v-for="group in filteredGroups" :key="group.label" class="mb-3">
          <p class="text-[10px] tracking-widest uppercase px-2 py-1 font-semibold" style="color: rgba(0,220,130,0.55)">
            {{ group.label }}
          </p>
          <button
            v-for="algo in group.algorithms"
            :key="algo.id"
            class="w-full text-left px-2 py-1 text-xs rounded transition-colors hover:text-zinc-100"
            :class="!isCognitionMode && selectedAlgo === algo.id
              ? 'border-l-2 border-green-400 pl-1.5 text-green-400 font-medium'
              : 'text-zinc-400 hover:bg-zinc-800/50'"
            @click="selectAlgo(algo.id)"
          >
            {{ algo.label }}
          </button>
        </div>

        <!-- Cognition Breeds section -->
        <div v-if="filteredBreeds.length > 0" class="mb-3">
          <div class="my-2" style="height: 1px; background: var(--color-surface-border)" />
          <p class="text-[10px] tracking-widest uppercase px-2 py-1 font-semibold text-purple-400/60">
            Cognition
          </p>
          <button
            v-for="breed in filteredBreeds"
            :key="breed.id"
            class="w-full text-left px-2 py-1 text-xs rounded transition-colors hover:text-zinc-100"
            :class="isCognitionMode && selectedBreed === breed.id
              ? 'border-l-2 border-purple-400 pl-1.5 text-purple-400 font-medium'
              : 'text-zinc-400 hover:bg-zinc-800/50'"
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
      <header class="flex items-center gap-3 px-4 py-2 shrink-0" style="border-bottom: 1px solid var(--color-surface-border); background: var(--color-surface-1)">
        <code class="text-sm font-semibold text-green-400 font-mono">
          {{ isCognitionMode ? `cognition:${selectedBreed}` : selectedAlgo }}
        </code>
        <div class="flex gap-1 ml-auto">
          <UButton
            v-for="s in SAMPLE_LOGS"
            :key="s.id"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="loadPreset(s.path)"
          >
            {{ s.label }}
          </UButton>
        </div>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          :icon="shareCopied ? 'i-lucide-check' : 'i-lucide-share-2'"
          :color="shareCopied ? 'success' : 'neutral'"
          @click="shareUrl"
        >
          {{ shareCopied ? 'Copied!' : 'Share' }}
        </UButton>
        <UButton
          v-if="!isCognitionMode"
          :loading="running"
          :disabled="!ready"
          color="primary"
          icon="i-lucide-play"
          size="sm"
          @click="run"
        >
          Run
          <span class="text-xs opacity-50 ml-1 hidden sm:inline">⌘↵</span>
        </UButton>
      </header>

      <!-- Cognition mode: full-panel CognitionDemo -->
      <div v-if="isCognitionMode" class="flex-1 overflow-auto p-4">
        <CognitionDemo :breed="selectedBreed!" />
      </div>

      <!-- Algorithm mode: split input + output -->
      <div v-else class="flex-1 flex overflow-hidden">
        <!-- Input with drag-and-drop -->
        <div
          ref="dropZoneRef"
          class="w-1/2 flex flex-col transition-all"
          :class="isOverDropZone ? 'ring-1 ring-green-400/50' : ''"
          style="border-right: 1px solid var(--color-surface-border)"
        >
          <div class="px-3 py-1.5 flex items-center gap-2" style="border-bottom: 1px solid var(--color-surface-border)">
            <span class="font-mono text-[10px] uppercase tracking-widest" style="color: rgba(0,220,130,0.5)">Input</span>
            <UBadge
              v-if="isOcelInput"
              color="primary"
              variant="subtle"
              size="xs"
            >
              OCEL
            </UBadge>
            <UBadge
              v-else
              color="neutral"
              variant="subtle"
              size="xs"
            >
              XES
            </UBadge>
            <UIcon v-if="isOverDropZone" name="i-lucide-upload" class="ml-auto text-green-400" />
            <span v-else class="ml-auto text-[10px] text-zinc-600 font-mono">drop file</span>
          </div>
          <XesEditor v-model="xesInput" height="100%" />
        </div>

        <!-- Output -->
        <div class="w-1/2 flex flex-col">
          <div class="flex items-center gap-2 px-3 py-1.5" style="border-bottom: 1px solid var(--color-surface-border)">
            <UTabs
              v-model="activeTab"
              :items="outputTabs"
              size="xs"
              color="primary"
            />
            <div v-if="result" class="flex gap-1 ml-auto">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-copy"
                @click="copyResult"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-download"
                @click="downloadResult"
              />
            </div>
          </div>
          <div class="flex-1 overflow-auto p-3">
            <div v-if="!ready" class="flex items-center gap-2 text-sm text-zinc-500">
              <UIcon name="i-lucide-loader-2" class="animate-spin" />
              Loading WASM runtime…
            </div>
            <UAlert v-else-if="wasmError" color="error" :description="wasmError" />
            <UAlert v-else-if="runError" color="error" :description="runError" />
            <template v-else-if="result">
              <pre v-show="activeTab === 'json'" class="text-[11px] font-mono rounded p-3 overflow-auto" style="background: var(--color-surface-0); color: rgba(0,220,130,0.85)">{{ JSON.stringify(result, null, 2) }}</pre>
              <ProcessGraph v-show="activeTab === 'graph'" :data="result as Record<string, unknown>" />
              <ReceiptViewer v-show="activeTab === 'receipt' && receipt" :receipt="receipt!" />
            </template>
            <div v-else class="text-xs text-zinc-600 text-center mt-16 font-mono">
              select an algorithm → load a log → run (⌘↵)
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
