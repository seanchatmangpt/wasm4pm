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

// ELK-based layout
const nodePositions = ref<Record<string, { x: number; y: number }>>({})
const isLayouting = ref(false)
const svgWidth = ref(640)
const svgHeight = ref(320)

async function runLayout(ns: Node[], es: Edge[]) {
  if (!import.meta.client || ns.length === 0) {
    // Fallback grid for SSR or empty
    const cols = Math.max(1, Math.ceil(Math.sqrt(ns.length)))
    nodePositions.value = Object.fromEntries(
      ns.map((n, i) => [n.id, { x: (i % cols) * 160 + 80, y: Math.floor(i / cols) * 80 + 40 }])
    )
    return
  }

  isLayouting.value = true
  try {
    const ELK = (await import('elkjs/lib/elk.bundled.js')).default
    const elk = new ELK()

    const graph = {
      id: 'root',
      layoutOptions: {
        'algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.layered.spacing.nodeNodeBetweenLayers': '60',
        'elk.spacing.nodeNode': '40',
      },
      children: ns.map(n => ({ id: n.id, width: 120, height: 36 })),
      edges: es.map((e, i) => ({ id: `e${i}`, sources: [e.source], targets: [e.target] })),
    }

    const result = await elk.layout(graph)

    const positions: Record<string, { x: number; y: number }> = {}
    let maxX = 0
    let maxY = 0
    for (const child of result.children ?? []) {
      const x = (child.x ?? 0) + 60
      const y = (child.y ?? 0) + 40
      positions[child.id!] = { x, y }
      maxX = Math.max(maxX, x + 80)
      maxY = Math.max(maxY, y + 40)
    }
    nodePositions.value = positions
    svgWidth.value = Math.max(640, maxX + 40)
    svgHeight.value = Math.max(200, maxY + 40)
  } catch (err) {
    console.warn('ELK layout failed, falling back to grid:', err)
    const cols = Math.max(1, Math.ceil(Math.sqrt(ns.length)))
    nodePositions.value = Object.fromEntries(
      ns.map((n, i) => [n.id, { x: (i % cols) * 160 + 80, y: Math.floor(i / cols) * 80 + 40 }])
    )
    const cols2 = Math.max(1, Math.ceil(Math.sqrt(ns.length)))
    svgWidth.value = cols2 * 160 + 80
    svgHeight.value = Math.ceil(ns.length / cols2) * 80 + 40
  } finally {
    isLayouting.value = false
  }
}

watch(
  [nodes, edges],
  ([ns, es]) => { runLayout(ns, es) },
  { immediate: true }
)
</script>

<template>
  <div class="process-graph overflow-auto border border-default rounded-lg p-2 bg-default">
    <div v-if="isLayouting" class="text-sm text-muted text-center py-8">
      Computing layout…
    </div>
    <svg
      v-else-if="nodes.length"
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
