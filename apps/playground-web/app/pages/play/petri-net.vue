<script setup lang="ts">
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

useHead({ title: 'Petri Net Canvas — wasm4pm Playground' })

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
      { id: 'declare_miner', label: 'Declare Miner' },
    ],
  },
  {
    label: 'Conformance',
    algorithms: [
      { id: 'token_replay_conformance', label: 'Token Replay' },
      { id: 'alignment_conformance', label: 'Alignment' },
      { id: 'footprint_conformance', label: 'Footprint' },
    ],
  },
  {
    label: 'Streaming / Drift',
    algorithms: [
      { id: 'streaming_dfg', label: 'Streaming DFG' },
      { id: 'concept_drift_detection', label: 'Concept Drift' },
    ],
  },
  {
    label: 'ML',
    algorithms: [
      { id: 'ml_classify', label: 'Classify' },
      { id: 'ml_cluster', label: 'Cluster' },
      { id: 'ml_forecast', label: 'Forecast' },
      { id: 'ml_anomaly', label: 'Anomaly' },
      { id: 'ml_regress', label: 'Regress' },
      { id: 'ml_pca', label: 'PCA' },
    ],
  },
]

interface DfgNode { id: string; label: string; count?: number }
interface DfgEdge { source: string; target: string; weight?: number }
interface DfgResult { nodes: DfgNode[]; edges: DfgEdge[] }

const { init, loadXes, runAlgorithm, ready, error: wasmError } = useWasm()

const selectedAlgo = ref('dfg')
const sidebarSearch = ref('')
const running = ref(false)
const runError = ref<string | null>(null)
const dfgResult = ref<DfgResult | null>(null)

// VueFlow nodes/edges derived from DFG output
const flowNodes = computed(() => {
  if (!dfgResult.value) return []
  const nodes = dfgResult.value.nodes ?? []
  const COLS = Math.ceil(Math.sqrt(nodes.length)) || 1
  return nodes.map((n, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    return {
      id: n.id,
      label: n.label + (n.count != null ? `\n(${n.count})` : ''),
      position: { x: col * 200, y: row * 120 },
      type: 'default',
      style: {
        background: '#3b82f6',
        color: '#fff',
        border: '2px solid #1d4ed8',
        borderRadius: '6px',
        padding: '8px 12px',
        fontSize: '12px',
        fontWeight: '600',
        minWidth: '120px',
        textAlign: 'center' as const,
      },
    }
  })
})

const flowEdges = computed(() => {
  if (!dfgResult.value) return []
  return (dfgResult.value.edges ?? []).map(e => ({
    id: `${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.weight != null ? String(e.weight) : '',
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#64748b' },
    labelStyle: { fontSize: '11px', fill: '#475569' },
  }))
})

const filteredGroups = computed(() => {
  const q = sidebarSearch.value.toLowerCase()
  if (!q) return ALGORITHM_GROUPS
  return ALGORITHM_GROUPS
    .map(g => ({ ...g, algorithms: g.algorithms.filter(a => a.id.includes(q) || a.label.toLowerCase().includes(q)) }))
    .filter(g => g.algorithms.length > 0)
})

async function run() {
  if (!ready.value) return
  running.value = true
  runError.value = null
  dfgResult.value = null
  try {
    const xes = await $fetch<string>('/samples/small-example.xes', { responseType: 'text' })
    const handle = loadXes(xes)
    const raw = runAlgorithm(selectedAlgo.value, handle, 'concept:name')
    const r = raw as Record<string, unknown>
    if (Array.isArray(r['nodes']) && Array.isArray(r['edges'])) {
      dfgResult.value = raw as DfgResult
    } else {
      runError.value = `Algorithm "${selectedAlgo.value}" does not return DFG-format data (nodes/edges). Try "DFG (streaming)".`
    }
  } catch (e: unknown) {
    runError.value = e instanceof Error ? e.message : String(e)
  } finally {
    running.value = false
  }
}

onMounted(async () => {
  await init()
  await run()
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-default">
    <!-- Sidebar -->
    <aside class="w-56 shrink-0 border-r border-default bg-elevated flex flex-col">
      <div class="p-3 border-b border-default">
        <NuxtLink
          to="/play"
          class="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground mb-2"
        >
          ← Back
        </NuxtLink>
        <p class="text-xs font-semibold text-foreground mb-2">Petri Net Canvas</p>
        <input
          v-model="sidebarSearch"
          placeholder="Filter algorithms…"
          class="w-full text-xs px-2 py-1.5 rounded border border-default bg-default text-foreground placeholder:text-muted focus:outline-none focus:border-primary"
        />
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <div v-for="group in filteredGroups" :key="group.label" class="mb-3">
          <p class="text-xs text-muted uppercase tracking-wider px-2 py-1">{{ group.label }}</p>
          <button
            v-for="algo in group.algorithms"
            :key="algo.id"
            class="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accented transition-colors"
            :class="{ 'bg-primary/10 text-primary font-semibold': selectedAlgo === algo.id }"
            @click="selectedAlgo = algo.id; run()"
          >
            {{ algo.label }}
          </button>
        </div>
      </div>
      <div class="p-3 border-t border-default">
        <button
          :disabled="!ready || running"
          class="w-full text-xs px-3 py-2 rounded bg-primary text-white font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
          @click="run"
        >
          {{ running ? 'Running…' : 'Run' }}
        </button>
      </div>
    </aside>

    <!-- Canvas area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <header class="flex items-center gap-3 px-4 py-2 border-b border-default bg-elevated shrink-0">
        <code class="text-sm font-semibold text-primary">{{ selectedAlgo }}</code>
        <span class="text-xs text-muted ml-auto">
          {{ dfgResult ? `${dfgResult.nodes.length} nodes · ${dfgResult.edges.length} edges` : 'No result yet' }}
        </span>
      </header>

      <!-- Status messages -->
      <div v-if="!ready" class="flex items-center justify-center flex-1 gap-2 text-sm text-muted">
        <span class="animate-spin inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
        Loading WASM runtime…
      </div>
      <div v-else-if="wasmError" class="flex items-center justify-center flex-1 text-red-500 text-sm p-4">
        WASM error: {{ wasmError }}
      </div>
      <div v-else-if="runError" class="flex items-center justify-center flex-1 text-orange-500 text-sm p-4 text-center">
        {{ runError }}
      </div>
      <div v-else-if="running" class="flex items-center justify-center flex-1 gap-2 text-sm text-muted">
        <span class="animate-spin inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
        Running algorithm…
      </div>

      <!-- VueFlow Canvas -->
      <div v-else-if="dfgResult" class="flex-1 relative">
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          fit-view-on-init
          class="w-full h-full"
        >
          <Background />
          <Controls />
        </VueFlow>
      </div>

      <div v-else class="flex items-center justify-center flex-1 text-sm text-muted">
        Select an algorithm and click Run to visualize the process graph.
      </div>
    </div>
  </div>
</template>
