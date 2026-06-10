<script setup lang="ts">
withDefaults(defineProps<{
  filter?: string
}>(), {
  filter: ''
})

// Algorithm registry — drawn from docs/reference/algorithms.md (v26.6.9)
const ALL_ALGORITHMS = [
  // Discovery
  { id: 'simd_streaming_dfg', alias: 'dfg', domain: 'Discovery', tier: 'fast', description: 'SIMD-accelerated streaming DFG (default)' },
  { id: 'heuristic_miner', alias: 'heuristic', domain: 'Discovery', tier: 'balanced', description: 'Dependency threshold-based process model' },
  { id: 'inductive_miner', alias: 'inductive', domain: 'Discovery', tier: 'quality', description: 'Inductive recursive process tree mining' },
  { id: 'alpha_miner', alias: 'alpha', domain: 'Discovery', tier: 'fast', description: 'Classic α-algorithm footprint-based' },
  { id: 'alpha_plus_plus', alias: 'alpha++', domain: 'Discovery', tier: 'balanced', description: 'α++ with self-loop and length-2 loop handling' },
  { id: 'ilp_miner', alias: 'ilp', domain: 'Discovery', tier: 'quality', description: 'ILP-based precise Petri net discovery' },
  { id: 'genetic_miner', alias: 'genetic', domain: 'Discovery', tier: 'quality', description: 'Evolutionary optimization of process models' },
  { id: 'powl_miner', alias: 'powl', domain: 'Discovery', tier: 'balanced', description: 'Partially Ordered Workflow Language model' },
  { id: 'declare_miner', alias: 'declare', domain: 'Discovery', tier: 'balanced', description: 'Declarative constraint mining' },
  { id: 'footprint_dfg', alias: 'footprint', domain: 'Discovery', tier: 'fast', description: 'Footprint matrix as DFG' },
  // Conformance
  { id: 'token_replay_conformance', alias: 'token-replay', domain: 'Conformance', tier: 'fast', description: 'Token-based replay fitness' },
  { id: 'alignment_conformance', alias: 'alignment', domain: 'Conformance', tier: 'quality', description: 'Alignment-based exact conformance' },
  { id: 'footprint_conformance', alias: 'footprint-conf', domain: 'Conformance', tier: 'fast', description: 'Footprint matrix conformance' },
  // Streaming
  { id: 'streaming_dfg', alias: 'stream', domain: 'Streaming', tier: 'fast', description: 'Online streaming DFG' },
  { id: 'concept_drift_detection', alias: 'drift', domain: 'Streaming', tier: 'balanced', description: 'EWMA concept drift detector' },
  // Prediction
  { id: 'next_activity_prediction', alias: 'next-activity', domain: 'Prediction', tier: 'balanced', description: 'n-gram next activity forecasting' },
  { id: 'remaining_time_prediction', alias: 'remaining-time', domain: 'Prediction', tier: 'balanced', description: 'Remaining case duration estimation' },
  // OCEL
  { id: 'ocel_dfg', alias: 'ocel-dfg', domain: 'OCEL', tier: 'fast', description: 'Object-centric DFG (requires OCEL 2.0)' },
  { id: 'ocel_inductive_miner', alias: 'ocel-inductive', domain: 'OCEL', tier: 'quality', description: 'OC-inductive miner (requires OCEL 2.0)' },
  // ML
  { id: 'ml_classify', alias: 'ml-classify', domain: 'ML', tier: 'balanced', description: 'Outcome classification (naive Bayes, decision tree)' },
  { id: 'ml_cluster', alias: 'ml-cluster', domain: 'ML', tier: 'balanced', description: 'Case cohort clustering (k-means)' },
  { id: 'ml_forecast', alias: 'ml-forecast', domain: 'ML', tier: 'balanced', description: 'Throughput time-series forecasting' },
  { id: 'ml_anomaly', alias: 'ml-anomaly', domain: 'ML', tier: 'balanced', description: 'Outlier detection (EMA-based)' },
  { id: 'ml_regress', alias: 'ml-regress', domain: 'ML', tier: 'balanced', description: 'Remaining-time regression' },
  { id: 'ml_pca', alias: 'ml-pca', domain: 'ML', tier: 'balanced', description: 'PCA dimensionality reduction' }
] as const

const ALL_DOMAIN = '__ALL__'

const search = ref('')
const domainFilter = ref(ALL_DOMAIN)

const domains = computed(() => [ALL_DOMAIN, ...new Set(ALL_ALGORITHMS.map(a => a.domain))])
const tierColors: Record<string, string> = { fast: 'success', balanced: 'info', quality: 'warning' }

const filtered = computed(() => ALL_ALGORITHMS.filter((a) => {
  const matchSearch = !search.value
    || a.id.includes(search.value.toLowerCase())
    || a.alias.includes(search.value.toLowerCase())
    || a.description.toLowerCase().includes(search.value.toLowerCase())
  const matchDomain = domainFilter.value === ALL_DOMAIN || domainFilter.value === '' || a.domain === domainFilter.value
  return matchSearch && matchDomain
}))

type AlgoRow = typeof ALL_ALGORITHMS[number]

const columns = [
  { accessorKey: 'id', header: 'Algorithm ID' },
  { accessorKey: 'alias', header: 'Alias' },
  { accessorKey: 'domain', header: 'Domain' },
  { accessorKey: 'tier', header: 'Tier' },
  { accessorKey: 'description', header: 'Description' }
]
</script>

<template>
  <div class="algorithm-table my-6">
    <div class="flex gap-3 mb-4">
      <UInput
        v-model="search"
        placeholder="Search algorithms…"
        icon="i-lucide-search"
        class="flex-1"
      />
      <USelect v-model="domainFilter" :items="domains.map(d => ({ label: d === ALL_DOMAIN ? 'All domains' : d, value: d }))" class="w-44" />
    </div>
    <UTable :data="filtered" :columns="(columns as any)">
      <template #id-cell="{ row }">
        <code class="text-xs text-primary">{{ (row as any).original.id }}</code>
      </template>
      <template #alias-cell="{ row }">
        <code class="text-xs text-muted">{{ (row as any).original.alias }}</code>
      </template>
      <template #tier-cell="{ row }">
        <UBadge :color="tierColors[(row as any).original.tier] as any" variant="soft" size="sm">
          {{ (row as any).original.tier }}
        </UBadge>
      </template>
    </UTable>
    <p class="text-xs text-muted mt-2">
      Showing {{ filtered.length }} of {{ ALL_ALGORITHMS.length }} algorithms
    </p>
  </div>
</template>
