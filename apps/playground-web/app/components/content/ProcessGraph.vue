<script setup lang="ts">
const props = defineProps<{ data: Record<string, unknown> }>()

interface Node { id: string; label: string; count?: number }
interface Edge { source: string; target: string; weight?: number }

const nodes = computed<Node[]>(() => {
  const raw = props.data['nodes'] ?? props.data['activities']
  if (!Array.isArray(raw)) return []
  return raw.map((n: unknown) => {
    if (typeof n === 'string') return { id: n, label: n }
    const obj = n as Record<string, unknown>
    return { id: String(obj['id'] ?? obj['name'] ?? n), label: String(obj['label'] ?? obj['name'] ?? obj['id'] ?? n), count: obj['count'] as number | undefined }
  })
})

const edges = computed<Edge[]>(() => {
  const raw = props.data['edges'] ?? props.data['dfg'] ?? props.data['directly_follows']
  if (!Array.isArray(raw)) return []
  return raw.map((e: unknown) => {
    const obj = e as Record<string, unknown>
    return { source: String(obj['source'] ?? obj['from']), target: String(obj['target'] ?? obj['to']), weight: obj['weight'] as number | undefined ?? obj['count'] as number | undefined }
  })
})

const maxWeight = computed(() => Math.max(1, ...edges.value.map(e => e.weight ?? 1)))

// Simple horizontal layout: left → right
const nodePositions = computed(() => {
  const cols = Math.ceil(Math.sqrt(nodes.value.length))
  return Object.fromEntries(
    nodes.value.map((n, i) => [n.id, { x: (i % cols) * 160 + 80, y: Math.floor(i / cols) * 80 + 40 }])
  )
})

const svgWidth = computed(() => {
  const cols = Math.ceil(Math.sqrt(nodes.value.length))
  return cols * 160 + 80
})
const svgHeight = computed(() => {
  const rows = Math.ceil(nodes.value.length / Math.ceil(Math.sqrt(nodes.value.length)))
  return rows * 80 + 40
})
</script>

<template>
  <div class="process-graph overflow-auto border border-default rounded-lg p-2 bg-default">
    <svg
      v-if="nodes.length"
      :width="svgWidth"
      :height="svgHeight"
      class="min-w-full"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" class="fill-muted" />
        </marker>
      </defs>

      <!-- Edges -->
      <g v-for="e in edges" :key="`${e.source}-${e.target}`">
        <line
          v-if="nodePositions[e.source] && nodePositions[e.target]"
          :x1="nodePositions[e.source]!.x"
          :y1="nodePositions[e.source]!.y"
          :x2="nodePositions[e.target]!.x"
          :y2="nodePositions[e.target]!.y"
          :stroke-width="1 + (e.weight ?? 1) / maxWeight * 3"
          stroke="currentColor"
          class="text-muted opacity-50"
          marker-end="url(#arrow)"
        />
        <text
          v-if="nodePositions[e.source] && nodePositions[e.target] && e.weight"
          :x="(nodePositions[e.source]!.x + nodePositions[e.target]!.x) / 2"
          :y="(nodePositions[e.source]!.y + nodePositions[e.target]!.y) / 2 - 4"
          class="text-xs fill-muted"
          text-anchor="middle"
          font-size="10"
        >{{ e.weight }}</text>
      </g>

      <!-- Nodes -->
      <g v-for="n in nodes" :key="n.id" :transform="`translate(${nodePositions[n.id]?.x ?? 0},${nodePositions[n.id]?.y ?? 0})`">
        <rect
          x="-55" y="-16" width="110" height="32"
          rx="6"
          class="fill-primary/10 stroke-primary/40"
          stroke-width="1.5"
        />
        <text class="text-xs fill-default" text-anchor="middle" dominant-baseline="middle" font-size="11">
          {{ n.label.length > 14 ? n.label.slice(0, 14) + '…' : n.label }}
        </text>
        <text v-if="n.count" class="fill-muted" text-anchor="middle" y="14" font-size="9">
          {{ n.count }}
        </text>
      </g>
    </svg>
    <div v-else class="text-sm text-muted text-center py-8">
      No graph data in result (algorithm may return non-DFG output)
    </div>
  </div>
</template>
