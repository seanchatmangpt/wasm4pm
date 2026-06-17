# wasm4pm Playground — Porting Guide
*Companion to ROADMAP.md. Hands-on specs for each port.*

## How to use this guide

Each entry gives the exact commands, source paths, and adaptation steps to port a feature into `apps/playground-web/`. Complete Q1 features in rank order — each one unlocks the next. Q2 features list their Q1 prerequisites explicitly.

**WASM integration anchor:** `app/composables/useWasm.ts`  
**Stack:** Vue 3 · Nuxt 4 · @nuxt/ui v4 · TailwindCSS v4 · pnpm workspaces

---

# Q1 Features

---

## ELK Layout Engine for ProcessGraph.vue
**Quarter:** Q1 | **Effort:** S | **Source validated:** yes

### Prerequisites
- WASM binary present: `apps/playground-web/public/wasm4pm.js` + `wasm4pm_bg.wasm`
- If not present, build first:
  ```bash
  cd /Users/sac/wasm4pm/wasm4pm && npm run build
  cp pkg/wasm4pm.js pkg/wasm4pm_bg.wasm /Users/sac/wasm4pm/apps/playground-web/public/
  ```

### Install
```bash
pnpm add elkjs
pnpm add -D @types/elkjs
```

### Source files (read these)
```
/Users/sac/unrdf/packages/kgc-4d-playground/components/visualizations/ForensicView.jsx
```
Key lines: ELK invocation uses `import ELK from 'elkjs/lib/elk.bundled.js'`, `algorithm: 'layered'`, `direction: 'RIGHT'`. ELK input: `children=[{id, width, height}]`, `edges=[{id, sources:[string], targets:[string]}]`.

### Target files (create/edit these)
```
apps/playground-web/app/composables/useElkLayout.ts    ← new
apps/playground-web/app/components/ProcessGraph.vue    ← edit (replace grid layout)
```

### Key adaptations
1. Import browser bundle, not the default entrypoint: `import ELK from 'elkjs/lib/elk.bundled.js'` — the default pulls in Node.js stream APIs that break Vite/Nuxt SSR tree-shaking.
2. Transform wasm4pm DFG format to ELK input:
   ```ts
   // wasm4pm → ELK
   children: nodes.map(n => ({ id: n.id, width: 180, height: 80 }))
   edges: edges.map(e => ({ id: `${e.source}-${e.target}`, sources: [e.source], targets: [e.target] }))
   ```
3. After `elk.layout()`, map positions back: `elkResult.children[i].{x, y}` by matching `id`.
4. Edge `weight` has no ELK equivalent in layered mode — preserve it on the wasm4pm edge object for stroke-width rendering; do not pass to ELK.
5. Wrap ELK import and the composable in `if (import.meta.client)` guard — ELK calls `window` internally.
6. Expose `layout(nodes, edges): Promise<PositionedNode[]>` from `useElkLayout.ts`; call it in `ProcessGraph.vue` after receiving new props, re-run on prop change via `watch`.
7. Render stroke-width proportional to frequency: `stroke-width: Math.max(1, Math.log(edge.weight + 1) * 2)`.

### Acceptance test
```bash
cd apps/playground-web && pnpm dev
# Load the demo DFG fixture (10 nodes), verify:
# 1. Nodes are arranged left-to-right without overlap
# 2. Edge stroke widths differ by frequency
# 3. Changing the fixture prop triggers a re-layout
```

---

## WebWorker Offload for WASM Runs
**Quarter:** Q1 | **Effort:** M | **Source validated:** no (greenfield)

### Prerequisites
- WASM binary present in `public/` (see ELK prerequisites above)
- `app/composables/useWasm.ts` stable and passing its tests

### Install
```bash
# No extra packages — Vite/Nuxt 4 handles ?worker imports natively
```

### Source files (read these)
```
apps/playground-web/app/composables/useWasm.ts    ← model the worker after this
```

### Target files (create/edit these)
```
apps/playground-web/app/workers/wasm-runner.worker.ts    ← new
apps/playground-web/app/composables/useWasmRunner.ts     ← new
```

### Key adaptations
1. Vite worker import syntax in the composable:
   ```ts
   import WasmRunnerWorker from '~/workers/wasm-runner.worker.ts?worker'
   ```
2. Worker must fetch the WASM binary using its own origin — do not share the main-thread singleton:
   ```ts
   const wasmUrl = new URL('/wasm4pm_bg.wasm', self.location.origin)
   ```
3. postMessage protocol (main → worker):
   ```ts
   { type: 'run', algorithm: string, log: string, params: Record<string, unknown> }
   ```
   Worker → main:
   ```ts
   { type: 'result', data: unknown }
   { type: 'progress', pct: number }   // emit at natural OTEL span boundaries
   { type: 'error', message: string }
   ```
4. `useWasmRunner.ts` returns `{ status: Ref<'idle'|'running'|'done'|'error'>, result: Ref<unknown>, error: Ref<string|null>, progress: Ref<number>, run(algorithm, log, params) }`.
5. Guard worker instantiation for SSR: `if (import.meta.client) { worker = new WasmRunnerWorker() }`.
6. `AlgorithmDemo` wires `progress` to a `UProgress` component; `error` surfaces via `UAlert`.

### Acceptance test
```bash
cd apps/playground-web && pnpm dev
# Run alpha_miner on a 500-event fixture while watching the browser console:
# 1. requestAnimationFrame counter stays above 30fps during the run (use DevTools Performance tab)
# 2. Progress bar updates at least once before result arrives
# 3. Passing a non-existent algorithm name shows the error state without crashing the page
```

---

## WorkflowBuilder / @vue-flow Petri Net Canvas
**Quarter:** Q1 | **Effort:** M | **Source validated:** yes

### Prerequisites
- No hard gate, but ELK layout (above) produces cleaner initial positions if wired.

### Install
```bash
pnpm add @vue-flow/core @vue-flow/background @vue-flow/controls @vue-flow/minimap
```

### Source files (read these)
```
/Users/sac/dev/crewai/components/nocode/WorkflowBuilder.vue
/Users/sac/dev/crewai/components/nocode/nodes/ActionNode.vue
```
`WorkflowBuilder.vue` is 74 lines; uses `@vue-flow/core ^1.33.5`. Custom nodes registered via `#node-{type}` template slots. `onDrop` has a known off-by-one bug with `getBoundingClientRect` in scrolled containers.

### Target files (create/edit these)
```
apps/playground-web/app/components/PetriNetCanvas.vue        ← new (adapted from WorkflowBuilder.vue)
apps/playground-web/app/components/PetriPlace.vue            ← new (adapted from ActionNode.vue)
apps/playground-web/app/components/PetriTransition.vue       ← new (adapted from ActionNode.vue)
```

### Key adaptations
1. Replace trigger/action/agent node slots with Petri net types:
   ```html
   <template #node-place="{ data }"><PetriPlace :data="data" /></template>
   <template #node-transition="{ data }"><PetriTransition :data="data" /></template>
   ```
2. Fix the `onDrop` coordinate bug from `WorkflowBuilder.vue` — replace `getBoundingClientRect` math with:
   ```ts
   const { project } = useVueFlow()
   const position = project({ x: event.clientX, y: event.clientY })
   ```
3. `PetriPlace.vue`: circle shape, token count in center, both source and target `<Handle>`. Follow `defineProps(['data'])` pattern from `ActionNode.vue`.
4. `PetriTransition.vue`: rectangle shape, label, source and target handles on left/right edges.
5. Export function: serialize canvas state to wasm4pm `PetriNet` schema:
   ```ts
   { places: string[], transitions: string[], arcs: { source: string, target: string }[] }
   ```
6. Import required CSS — not auto-imported by Nuxt:
   ```ts
   import '@vue-flow/core/dist/style.css'
   import '@vue-flow/core/dist/theme-default.css'
   ```
7. `PetriNetCanvas.vue` does not need `.client.vue` suffix if wrapped in `<ClientOnly>` at the page level, but naming it `.client.vue` is simpler.

### Acceptance test
```bash
cd apps/playground-web && pnpm dev
# 1. Drag a Place node onto the canvas and a Transition node, connect them with an arc
# 2. Call the export function and verify the JSON matches { places, transitions, arcs } schema
# 3. Embed PetriNetCanvas in the main layout — confirm no overflow clipping
```

---

## XES/OCEL File Upload with Drag-and-Drop
**Quarter:** Q1 | **Effort:** S | **Source validated:** yes

### Prerequisites
- None — standalone component, no upstream gate.

### Install
```bash
# No new dependencies — uses only @nuxt/ui primitives already in the playground
```

### Source files (read these)
```
/Users/sac/cns/bitjob/components/ResumeUpload.vue
```
Implements full drag-and-drop zone with `@drop/@dragover`, hidden file input, `processingProgress.progress_percentage` progress bar, Nuxt UI (`UButton`, `UIcon`). Light deps — only Nuxt UI and Tailwind.

### Target files (create/edit these)
```
apps/playground-web/app/components/XesUpload.vue    ← new (adapted from ResumeUpload.vue)
```

### Key adaptations
1. Replace `FILE_UPLOAD` MIME constants with XES/OCEL types:
   ```ts
   const ACCEPTED_TYPES = ['.xes', '.json', '.jsonocel', '.csv']
   const ACCEPTED_MIME = ['text/xml', 'application/xml', 'application/json', 'text/csv']
   ```
2. Replace AI processing status poll with OTEL span progress events from `useWasmRunner`:
   ```ts
   const { progress, status, run } = useWasmRunner()
   // bind progress → UProgress :value="progress"
   ```
3. Emit `load-log` event carrying the `File` object to the parent — do not parse inside the component:
   ```ts
   emit('load-log', file)
   ```
4. Invalid file type: show `UAlert` with variant `error`; do not throw.
5. Wire `handleDrop` to call `run('parse_xes', fileContent, {})` via `useWasmRunner` after reading the file with `FileReader`.

### Acceptance test
```bash
cd apps/playground-web && pnpm dev
# 1. Drag a .xes file onto the drop zone — verify load-log event fires with the File object
# 2. Drop a .pdf file — verify error state appears without crashing
# 3. Progress bar reflects parsing progress from the WebWorker
```

---

## Cytoscape Directed Graph with dagre/cola Layout
**Quarter:** Q1 | **Effort:** S | **Source validated:** yes

### Prerequisites
- None — standalone; useful as DFG fallback before ELK is wired.

### Install
```bash
pnpm add cytoscape cytoscape-dagre cytoscape-cola
pnpm add -D @types/cytoscape
```

### Source files (read these)
```
/Users/sac/cns/nuxt_ui_80_20_permutations/nuxt-ui-semantic-playground/components/ui/SemanticGraph.vue
```
Uses `cytoscape@^3.26.0` with `cytoscape-dagre` and `cytoscape-cola`. Supports directed graphs, node/edge selection events, dynamic layout switching. Edge `data` carries `label` but NOT a numeric `weight` field — must be added.

### Target files (create/edit these)
```
apps/playground-web/app/components/DfgGraph.vue    ← new (adapted from SemanticGraph.vue)
```

### Key adaptations
1. Copy `SemanticGraph.vue` as the starting point; rename to `DfgGraph.vue`.
2. Accept wasm4pm DFG props:
   ```ts
   defineProps<{ nodes: {id: string, label: string, count: number}[], edges: {source: string, target: string, weight: number}[] }>()
   ```
3. Map `count` to node size and `weight` to edge width via Cytoscape style:
   ```ts
   { selector: 'edge', style: { 'width': 'mapData(weight, 0, 100, 1, 8)', 'label': 'data(weight)' } }
   { selector: 'node', style: { 'width': 'mapData(count, 0, 1000, 30, 80)', 'height': 'mapData(count, 0, 1000, 30, 80)' } }
   ```
4. Add layout toggle between `dagre` and `cola` via a `USelect` dropdown — no page reload required; call `cy.layout({ name: selectedLayout }).run()`.
5. Emit `select-activity` event on node click:
   ```ts
   cy.on('tap', 'node', (evt) => emit('select-activity', evt.target.id()))
   ```
6. Guard Cytoscape initialization for SSR: wrap `cy = cytoscape(...)` in `onMounted`.

### Acceptance test
```bash
cd apps/playground-web && pnpm dev
# 1. Render a DFG with varied edge weights — verify stroke widths differ proportionally
# 2. Toggle layout from dagre to cola — verify graph re-renders without reload
# 3. Click a node — verify select-activity event fires with the correct activity id
```

---

# Q2 Features

---

## @monaco-editor/vue3 XES/OCEL Editor
**Quarter:** Q2 | **Effort:** M | **Source validated:** yes

### Prerequisites
- WebWorker offload (Q1) must be complete — the editor's Save button triggers a worker run.

### Install
```bash
pnpm add @monaco-editor/vue3 monaco-editor
```

### Source files (read these)
```
/Users/sac/dev/cracking-coding-platform/components/Editor.client.vue
```
SSR-safe `.client.vue` pattern. Uses `nuxt-monaco-editor` Nuxt module for component registration — do NOT lift that dependency. Use `@monaco-editor/vue3` instead (direct Vue 3 wrapper, no Nuxt module required). `monaco-vim` wiring is optional for the playground.

### Target files (create/edit these)
```
apps/playground-web/app/components/EventLogEditor.client.vue    ← new
```

### Key adaptations
1. Use `@monaco-editor/vue3`, not `nuxt-monaco-editor` — no Nuxt module registration needed:
   ```ts
   import MonacoEditor from '@monaco-editor/vue3'
   ```
2. File must be named `EventLogEditor.client.vue` — the `.client.vue` suffix is the SSR guard; do not add `<ClientOnly>` on top.
3. Configure XML language for XES:
   ```ts
   <MonacoEditor language="xml" :options="{ wordWrap: 'on', minimap: { enabled: false } }" />
   ```
4. For JSON OCEL files, detect format from file extension and switch language dynamically:
   ```ts
   const language = computed(() => filename.value.endsWith('.json') ? 'json' : 'xml')
   ```
5. Add XES XML schema for IntelliSense via `monaco.languages.json.jsonDefaults.setDiagnosticsOptions` (JSON) or a custom XML schema registration for XES.
6. Save button emits `save-log` with the editor content — parent passes to `useWasmRunner` for parsing:
   ```ts
   emit('save-log', editor.getValue())
   ```
7. Do not SSR the component (already handled by `.client.vue`); no `window`-undefined guards needed inside.

### Acceptance test
```bash
cd apps/playground-web && pnpm dev
# 1. Open the editor — verify XES XML syntax highlighting and no window-undefined console errors
# 2. Paste a valid XES snippet — Save button emits save-log with the content
# 3. Confirm no SSR errors in server logs on first page load
```

---

## Algorithm Benchmark Mode — Run All 60 on Same Log
**Quarter:** Q2 | **Effort:** L | **Source validated:** yes

### Prerequisites
- WebWorker offload (Q1) must be complete — benchmark fans out one worker message per algorithm.
- XesUpload (Q1) must be complete — benchmark page needs a loaded event log handle.

### Install
```bash
pnpm add @vue-flow/core recharts
# @vue-flow/core may already be installed from Q1 PetriNetCanvas
```

### Source files (read these)
```
/Users/sac/jotp/benchmark-site/components/flows/benchmark-pipeline.tsx
/Users/sac/jotp/benchmark-site/components/nodes/
/Users/sac/jotp/benchmark-site/hooks/
```
`BenchmarkPipelineFlow` uses `@xyflow/react` with animated node status (running/done per node). XState machines in `/hooks/` drive stage transitions. Recharts `ChartContainer` wraps bar charts. This is React — do NOT lift ReactFlow or `@xyflow/react`. Reimplement using `@vue-flow/core` following the `ActionNode.vue` pattern from crewai.

### Target files (create/edit these)
```
apps/playground-web/app/pages/benchmark.vue                        ← new
apps/playground-web/app/components/WasmAlgorithmNode.vue           ← new (adapted from BenchmarkNode)
apps/playground-web/app/composables/useAlgorithmBenchmark.ts       ← new
```

### Key adaptations
1. `WasmAlgorithmNode.vue` follows `defineProps(['data'])` + handle class pattern from `ActionNode.vue`. Data shape:
   ```ts
   { algorithmId: string, status: 'idle'|'running'|'done'|'error', durationMs?: number, fitnessScore?: number }
   ```
   Animate status via CSS class binding: `pending` → grey, `running` → pulse, `done` → green, `error` → red.
2. Replace XState hooks from `/hooks/` with a Vue composable using the same state names (`idle/running/done/error`). Use `xstate` + `@xstate/vue`:
   ```bash
   pnpm add xstate @xstate/vue
   ```
3. Fan out one worker message per algorithm in `useAlgorithmBenchmark.ts`:
   ```ts
   const results = await Promise.allSettled(
     algorithms.map(id => useWasmRunner().run(id, log, params))
   )
   ```
4. Recharts `ChartContainer` is React — use `@unovis/vue` `VisGroupedBar` instead for the timing + fitness bar chart. The data shape (algorithmId, timing, score) is framework-agnostic.
5. Results export as JSON receipt matching wasm4pm receipt schema: `{ run_id, algorithm: 'benchmark', input_hash, output_hash, results: [...] }`. Post to `server/api/receipts.post.ts`.

### Acceptance test
```bash
cd apps/playground-web && pnpm dev
# 1. Load a log via XesUpload, navigate to /benchmark
# 2. Click Run All — verify each algorithm node animates through idle/running/done
# 3. Bar chart shows per-algorithm timing after all runs complete
# 4. Export JSON matches receipt schema (run_id, input_hash, output_hash present)
```

---

## Conformance Dashboard — Token Replay + Alignment Side-by-Side
**Quarter:** Q2 | **Effort:** M | **Source validated:** no (greenfield)

### Prerequisites
- WebWorker offload (Q1) must be complete.
- XesUpload (Q1) must be complete — conformance requires a loaded event log.
- PetriNetCanvas (Q1) should be complete — deviating traces are highlighted in the graph.

### Install
```bash
# No new dependencies — composes existing QualityBadge and ConformanceExplainer components
```

### Source files (read these)
```
apps/playground-web/app/components/QualityBadge.vue          ← inspect existing API
apps/playground-web/app/components/ConformanceExplainer.vue  ← inspect existing API
apps/playground-web/app/components/DfgGraph.vue              ← wired for deviation highlighting (Q1)
```

### Target files (create/edit these)
```
apps/playground-web/app/pages/conformance.vue    ← new
```

### Key adaptations
1. Two-panel layout using `@nuxt/ui` grid:
   - Left: token replay results — `QualityBadge` for fitness/precision/generalization/simplicity
   - Right: alignment conformance — move costs per trace
2. Single Run button triggers both algorithms concurrently via `useWasmRunner`:
   ```ts
   const [replayResult, alignResult] = await Promise.all([
     run('token_replay', log, {}),
     run('alignment_conformance', log, {})
   ])
   ```
3. `QualityBadge` must receive all four van der Aalst metrics with pass/fail thresholds (fitness > 0.85, precision > 0.70, generalization > 0.60, simplicity > 0.50 — verify thresholds against `GEMINI.md`).
4. Deviating traces: extract trace IDs from alignment result where `move_cost > 0`, pass to `DfgGraph` as a `highlightedTraces` prop that colors those paths red.
5. Wire both panels to the same loaded Petri net from `PetriNetCanvas` and event log from `XesUpload` via shared state (Pinia store or provide/inject).

### Acceptance test
```bash
cd apps/playground-web && pnpm dev
# 1. Load a log and a Petri net, navigate to /conformance
# 2. Click Run — both panels populate from a single button press
# 3. QualityBadge shows all four metrics with color-coded pass/fail
# 4. Deviating traces are highlighted in DfgGraph
```

---

## ReactFlow Pipeline Visualization — WasmAlgorithmNode (AlgorithmPipelineFlow)
**Quarter:** Q2 | **Effort:** M | **Source validated:** yes

### Prerequisites
- WebWorker offload (Q1) must be complete.
- PetriNetCanvas (Q1) must be complete — `@vue-flow/core` already installed.

### Install
```bash
pnpm add xstate @xstate/vue
# @vue-flow/core already installed from Q1
```

### Source files (read these)
```
/Users/sac/jotp/benchmark-site/components/flows/benchmark-pipeline.tsx
/Users/sac/jotp/benchmark-site/hooks/
```
Animated node status pattern: `status: running|done` per node. XState integration documented in `XSTATE-INTEGRATION.md` in that repo. Do NOT lift ReactFlow (`@xyflow/react`) — reimplement using `@vue-flow/core`.

### Target files (create/edit these)
```
apps/playground-web/app/components/AlgorithmPipelineFlow.vue    ← new
```

### Key adaptations
1. Do NOT copy ReactFlow JSX — use `@vue-flow/core` with `WasmAlgorithmNode.vue` from the benchmark task above (reuse the same custom node component).
2. Read XState machine definitions from `/hooks/` and adapt to a Vue composable with identical state names (`idle/running/done/error`):
   ```ts
   import { createMachine } from 'xstate'
   import { useMachine } from '@xstate/vue'
   const { state, send } = useMachine(algorithmStageMachine)
   ```
3. XState machine drives stage transitions from OTEL span events posted by the worker:
   ```ts
   worker.onmessage = (e) => {
     if (e.data.type === 'progress') send({ type: 'PROGRESS', pct: e.data.pct })
     if (e.data.type === 'result') send({ type: 'DONE', result: e.data.data })
     if (e.data.type === 'error') send({ type: 'ERROR', message: e.data.message })
   }
   ```
4. Completed stages show execution time in the node label — update `data.durationMs` on the `WasmAlgorithmNode` after `DONE` transition.
5. Pipeline layout: nodes arranged horizontally; edges between consecutive stages. Pre-populate with the wasm4pm algorithm lifecycle stages (parse → discover → replay → conformance).

### Acceptance test
```bash
cd apps/playground-web && pnpm dev
# 1. Trigger a pipeline run — each stage animates idle → running → done
# 2. Confirm XState drives transitions (not setTimeout), verified by logging state.value
# 3. Completed stage nodes show durationMs in their label
```

---

# Dependency matrix

| Feature | New packages | Requires |
|---|---|---|
| ELK layout (Q1) | `elkjs` | WASM binary in public/ |
| WebWorker WASM (Q1) | — | `useWasm.ts` stable |
| PetriNetCanvas (Q1) | `@vue-flow/core @vue-flow/background @vue-flow/controls @vue-flow/minimap` | ELK (optional) |
| XesUpload (Q1) | — | — |
| DfgGraph / Cytoscape (Q1) | `cytoscape cytoscape-dagre cytoscape-cola` | — |
| EventLogEditor (Q2) | `@monaco-editor/vue3 monaco-editor` | WebWorker (Q1) |
| Benchmark mode (Q2) | `recharts xstate @xstate/vue` | WebWorker, XesUpload (Q1) |
| Conformance dashboard (Q2) | — | WebWorker, XesUpload, PetriNetCanvas (Q1) |
| AlgorithmPipelineFlow (Q2) | `xstate @xstate/vue` | WebWorker, PetriNetCanvas (Q1) |

---

# SSR guard reference

Use the `.client.vue` filename convention — Nuxt 4 auto-detects it. Only add `<ClientOnly>` for subcomponents inside an already-SSR-safe parent when you cannot rename the file.

```vue
<!-- correct: filename is EventLogEditor.client.vue — no extra wrapper -->
<template>
  <MonacoEditor v-model="content" language="xml" />
</template>
```

```vue
<!-- wrong: double-guarding an already-.client.vue component -->
<ClientOnly>
  <EventLogEditor />
</ClientOnly>
```

Components that require `.client.vue`: `EventLogEditor`, `PetriNetCanvas`, any component that instantiates a WebWorker, Cytoscape, or ELK directly.

---

# WASM binary prerequisite (all features)

```bash
# Browser target (client composables)
cd /Users/sac/wasm4pm/wasm4pm && npm run build
cp pkg/wasm4pm.js pkg/wasm4pm_bg.wasm /Users/sac/wasm4pm/apps/playground-web/public/

# Node.js target (server routes / SSE, Q3+)
npm run build:nodejs
```

Verify before starting any port:
```bash
ls /Users/sac/wasm4pm/apps/playground-web/public/wasm4pm*.{js,wasm}
# Must show both wasm4pm.js and wasm4pm_bg.wasm
```
