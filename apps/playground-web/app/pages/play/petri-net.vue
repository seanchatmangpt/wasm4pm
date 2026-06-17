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
  }
]

interface DfgNode { id: string, label: string, count?: number }
interface DfgEdge { source: string, target: string, weight?: number }
interface DfgResult { nodes: DfgNode[], edges: DfgEdge[] }

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
        background: 'rgba(0,220,130,0.1)',
        color: '#00DC82',
        border: '1.5px solid rgba(0,220,130,0.4)',
        borderRadius: '5px',
        padding: '8px 12px',
        fontSize: '11px',
        fontWeight: '600',
        fontFamily: 'ui-monospace,monospace',
        minWidth: '120px',
        textAlign: 'center' as const
      }
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
    style: { stroke: '#2a2a30' },
    labelStyle: { fontSize: '10px', fill: '#71717a', fontFamily: 'ui-monospace,monospace' }
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
  <div class="flex h-screen overflow-hidden" style="background: var(--color-surface-0)">
    <!-- Sidebar -->
    <aside class="w-56 shrink-0 flex flex-col" style="background: var(--color-surface-1); border-right: 1px solid var(--color-surface-border)">
      <div class="p-3" style="border-bottom: 1px solid var(--color-surface-border)">
        <NuxtLink
          to="/play"
          class="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 mb-2 font-mono"
        >
          ← sandbox
        </NuxtLink>
        <p class="text-[10px] font-semibold tracking-widest uppercase mb-2" style="color: rgba(0,220,130,0.55)">
          Petri Net Canvas
        </p>
        <input
          v-model="sidebarSearch"
          placeholder="Filter…"
          class="w-full text-xs px-2 py-1.5 rounded text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-400/30"
          style="background: var(--color-surface-2); border: 1px solid var(--color-surface-border)"
        >
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <div v-for="group in filteredGroups" :key="group.label" class="mb-3">
          <p class="text-[10px] tracking-widest uppercase px-2 py-1 font-semibold" style="color: rgba(0,220,130,0.55)">
            {{ group.label }}
          </p>
          <button
            v-for="algo in group.algorithms"
            :key="algo.id"
            class="w-full text-left px-2 py-1 text-xs rounded transition-colors hover:text-zinc-100"
            :class="selectedAlgo === algo.id
              ? 'border-l-2 border-green-400 pl-1.5 text-green-400 font-semibold'
              : 'text-zinc-400 hover:bg-zinc-800/50'"
            @click="selectedAlgo = algo.id; run()"
          >
            {{ algo.label }}
          </button>
        </div>
      </div>
      <div class="p-3" style="border-top: 1px solid var(--color-surface-border)">
        <button
          :disabled="!ready || running"
          class="w-full text-xs px-3 py-2 rounded font-semibold disabled:opacity-40 transition-colors font-mono"
          style="background: rgba(0,220,130,0.15); color: #00DC82; border: 1px solid rgba(0,220,130,0.3)"
          @click="run"
        >
          {{ running ? 'running…' : '▶ run' }}
        </button>
      </div>
    </aside>

    <!-- Canvas area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <header class="flex items-center gap-3 px-4 py-2 shrink-0" style="border-bottom: 1px solid var(--color-surface-border); background: var(--color-surface-1)">
        <code class="text-sm font-semibold text-green-400 font-mono">{{ selectedAlgo }}</code>
        <span class="text-[11px] text-zinc-600 ml-auto font-mono">
          {{ dfgResult ? `${dfgResult.nodes.length} nodes · ${dfgResult.edges.length} edges` : 'no result' }}
        </span>
      </header>

      <!-- Status messages -->
      <div v-if="!ready" class="flex items-center justify-center flex-1 gap-2 text-sm text-zinc-600">
        <span class="animate-spin inline-block w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full" />
        Loading WASM runtime…
      </div>
      <div v-else-if="wasmError" class="flex items-center justify-center flex-1 text-red-400 text-sm p-4">
        WASM error: {{ wasmError }}
      </div>
      <div v-else-if="runError" class="flex items-center justify-center flex-1 text-orange-400 text-sm p-4 text-center font-mono text-xs">
        {{ runError }}
      </div>
      <div v-else-if="running" class="flex items-center justify-center flex-1 gap-2 text-sm text-zinc-600">
        <span class="animate-spin inline-block w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full" />
        Running algorithm…
      </div>

      <!-- VueFlow Canvas -->
      <div v-else-if="dfgResult" class="flex-1 relative" style="background: var(--color-surface-0)">
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          fit-view-on-init
          class="w-full h-full"
        >
          <Background pattern-color="#1f1f23" :gap="20" />
          <Controls />
        </VueFlow>
      </div>

      <div v-else class="flex items-center justify-center flex-1 text-xs text-zinc-600 font-mono">
        select an algorithm and run to visualize
      </div>
    </div>
  </div>
</template>
