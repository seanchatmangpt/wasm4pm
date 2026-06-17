# wasm4pm Playground — 12-Month Roadmap
*Generated: June 2026 | Branch: enterprise/fortune5-readiness*

---

## Vision

By end of Q4 2027, the wasm4pm playground is a self-contained, browser-native process mining workstation. An analyst arrives with a raw XES or OCEL 2.0 event log, drags it onto a drop zone or pastes it into a Monaco editor with live XES schema validation, then runs any of 60 registered WASM algorithms off the main thread — the UI never freezes. The result renders as an ELK-Sugiyama layered DFG with arc thickness encoding event frequency and arc colour encoding median case duration. From the same view the analyst drags the discovered Petri net onto an interactive Vue Flow canvas, adds or removes transitions by hand, and replays it against the log to see fitness/precision/generalization/simplicity on a four-axis radar chart — all four van der Aalst quality dimensions co-presented, not buried in a JSON blob.

A one-click benchmark fans out all 60 algorithms against the same log and streams per-algorithm rows into a sortable table as they complete, each row backed by a BLAKE3 receipt. The receipt timeline page mines the playground's own run history as an OCEL event log and renders its discovered DFG — a live eat-your-own-dogfood conformance demonstration. Streaming DFG and concept drift algorithms render graph updates frame-by-frame with a post-hoc scrubber. OCEL 2.0 logs open in a dedicated three-panel explorer where per-object-type DFGs and in-browser OCPQ queries give enterprise practitioners frontier-grade object-centric analysis that surpasses what pm4py's Python notebook interface offers in interactivity. Every run emits a receipt. Every receipt is shareable as a `/r/{uuid}` URL. Anyone loading that URL can click Verify and the browser re-runs the algorithm and checks the BLAKE3 hash — reproducibility as a first-class UX primitive.

The baseline playground blocks the UI thread, renders nodes on a meaningless grid, has no editor, no interactive canvas, no benchmark, no streaming, and no receipt continuity across sessions. This roadmap repairs all of that.

---

## Baseline (June 2026)

Confirmed from reading `apps/playground-web/app/`:

| Component / File | Status |
|---|---|
| `app/components/content/AlgorithmDemo.vue` | Present — calls WASM synchronously on main thread via `useWasm.ts`; UI freezes on run |
| `app/components/content/CognitionDemo.vue` | Present — same blocking issue |
| `app/components/content/ProcessGraph.vue` | Present — uniform SVG grid layout; x/y positions are meaningless; no heatmap, no ELK |
| `app/components/content/QualityBadge.vue` | Present — renders a single score badge; no radar chart |
| `app/components/content/ConformanceExplainer.vue` | Present — static prose; no interactive dashboard |
| `app/components/content/ReceiptViewer.vue` | Present — shows one receipt; no IndexedDB persistence, no publish, no timeline |
| `app/composables/useWasm.ts` | Present — direct synchronous WASM calls; no worker |
| `app/composables/useReceipt.ts` | Present — handles one receipt at a time; no batch store |
| `app/composables/useDashboard.ts` | Present |
| `app/pages/` | `index.vue`, `customers.vue`, `inbox.vue`, `settings.vue` plus `learn/` and `play/` subdirs — no benchmark, OCEL, or receipt-timeline pages |
| `app/workers/` | **Does not exist** |
| `elkjs` | **Not installed** |
| `@vue-flow/core` | **Not installed** |
| `@monaco-editor/vue3` | **Not installed** |
| Already present deps | `@unovis/vue`, `@vueuse/core`, `@nuxt/ui`, `tailwindcss`, `zod` |

---

## Q1 — Foundation (Jun–Sep 2026)

*Goal: eliminate UI thread blocking, replace the placeholder SVG grid with a readable ELK-layered DFG, and enable real event log ingestion — the three prerequisites every subsequent feature depends on.*

---

### 1. ELK layout engine for ProcessGraph.vue

**Source:** Engineering gap — `apps/playground-web/app/components/content/ProcessGraph.vue` assigns x/y from a uniform grid. ELK invocation pattern validated at `/Users/sac/unrdf/packages/kgc-4d-playground/components/visualizations/ForensicView.jsx` (build status: builds; score: 62).
**Effort:** S | **Impact:** High

**Why now:** The grid layout makes every DFG unreadable regardless of how good the algorithm output is. Highest UX ROI per engineering hour in the entire roadmap.

**Port spec:**
1. `pnpm add elkjs` from `apps/playground-web/`.
2. Study ELK invocation in `/Users/sac/unrdf/packages/kgc-4d-playground/components/visualizations/ForensicView.jsx`: imports `ELK` from `elkjs/lib/elk.bundled.js`; graph input is `{ children: [{id, width, height}], edges: [{id, sources:[string], targets:[string]}] }`; options `{ algorithm: 'layered', 'elk.direction': 'RIGHT' }`. Note: ELK uses arrays for sources/targets; wasm4pm DFG uses singular strings — add a transform.
3. Create `app/workers/elk-layout.worker.ts`. Imports `elkjs/lib/elk.bundled.js`. On `'layout'` message receives `{ nodes: [{id,label,count}], edges: [{source,target,weight}] }`, transforms to ELK format (add `width: 120, height: 40` per node; `sources:[source], targets:[target]` per edge), runs ELK layout, posts back `{ positions: [{id, x, y}], routes: [{id, sections}] }`.
4. In `ProcessGraph.vue`: add async `layoutGraph(nodes, edges)` that posts to the ELK worker and awaits the response. Replace the grid x/y formula with ELK `x`/`y` positions. Map ELK edge `sections[].bendPoints` to SVG cubic bezier `<path d="...">`. Keep node labels and QualityBadge overlay in place.
5. Lazy-load the worker on component mount only — not at app startup.

**Install:** `pnpm add elkjs`

**Acceptance criteria:**
- [ ] A 10-node DFG renders with non-overlapping left-to-right layered positions from ELK (not a grid)
- [ ] Edge paths follow ELK bend-point routes — not straight diagonals
- [ ] `elkjs` does not appear in the main JS bundle chunk (worker-only, confirmed via `nuxt build` analysis)
- [ ] Layout recomputes reactively when `nodes`/`edges` props change

---

### 2. WebWorker offload for WASM runs

**Source:** Engineering gap — `app/composables/useWasm.ts` makes synchronous WASM calls on the main thread; `app/workers/` directory does not exist.
**Effort:** M | **Impact:** High

**Why now:** UI thread blocking means no other Q1 UX improvement feels responsive. This is the hard prerequisite for every subsequent WASM-calling feature.

**Port spec:**
1. Read `app/composables/useWasm.ts` to understand the current WASM init and algorithm call surface.
2. Create `app/workers/` directory.
3. Create `app/workers/wasm-runner.worker.ts`. On message `{ type: 'init' }`, initialise the WASM module. On message `{ type: 'run', algorithm, log, params }`, call the kernel, post back `{ status: 'ok'|'error', result, receiptHash, durationMs }`. On message `{ type: 'stream', algorithm, log, params }`, post intermediate `{ type: 'chunk', partialModel, windowIndex }` messages then a final `{ type: 'done', receiptHash }` (streaming protocol needed for Q3).
4. Use Vite worker import syntax: `new Worker(new URL('./wasm-runner.worker.ts', import.meta.url), { type: 'module' })`.
5. Create `app/composables/useWasmWorker.ts`. Exposes `run(algorithm, log, params): Promise<RunResult>` and reactive `isRunning: Ref<boolean>`. Wraps the worker in a Promise resolved on the matching response message. Include an `onChunk` callback for the streaming protocol.
6. In `AlgorithmDemo.vue`: replace `useWasm()` calls with `useWasmWorker().run(...)`. Add `:disabled="isRunning"` to the run button and a `UBadge` loading indicator.
7. In `CognitionDemo.vue`: same replacement.

**Install:** *(none — Vite worker support built-in)*

**Acceptance criteria:**
- [ ] Running `alpha_miner` on a 500-event log does not block the main thread (`requestAnimationFrame` stays above 30 fps during run, verified via DevTools Performance panel)
- [ ] `AlgorithmDemo.vue` and `CognitionDemo.vue` call `useWasmWorker` exclusively; `useWasm.ts` is no longer called from UI components
- [ ] Worker errors surface as `error` state in `useWasmWorker` without crashing the page

---

### 3. WorkflowBuilder / @vue-flow Petri net canvas

**Source:** `/Users/sac/dev/crewai/components/nocode/WorkflowBuilder.vue` (build status: partial — node_modules absent but package.json confirmed; score: 0.82). Pattern also validated in `/Users/sac/dev/crewai/components/nocode/nodes/ActionNode.vue` (build status: builds; score: 0.79).
**Effort:** M | **Impact:** High

**Why now:** WorkflowBuilder.vue is the highest-scoring extractable Vue component in the survey. `@vue-flow/core` is already validated in that project. Replacing AI node types with Petri net Place/Transition nodes delivers an interactive canvas in Q1 before the conformance dashboard needs it in Q4.

**Port spec:**
1. Read `/Users/sac/dev/crewai/components/nocode/WorkflowBuilder.vue` (74 lines): imports `VueFlow`, `Background`, `Controls`, `MiniMap` from `@vue-flow/core@^1.33.5`; manages elements via `v-model`; handles `onDrop` and `onConnect`. Three node slots registered via `#node-{type}` template slots.
2. Read `/Users/sac/dev/crewai/components/nocode/nodes/ActionNode.vue`: minimal 8-15 line SFC, `defineProps(['data'])`, source + target handles, purely presentational. This is the exact structural pattern for `PetriPlace.vue` and `PetriTransition.vue`.
3. `pnpm add @vue-flow/core @vue-flow/background @vue-flow/controls @vue-flow/minimap` from `apps/playground-web/`.
4. Create `app/components/content/PetriPlace.vue` — circle SVG, `defineProps(['data'])`, renders `data.tokens` as a filled dot counter badge. Target handle top, source handle bottom.
5. Create `app/components/content/PetriTransition.vue` — rectangle, renders `data.label`. Both source and target handles (bidirectional — same as ActionNode.vue pattern).
6. Create `app/components/content/PetriNetCanvas.vue`. Import `VueFlow` from `@vue-flow/core`. Register `PetriPlace` and `PetriTransition` as custom node types via `#node-place` and `#node-transition` slots. Fix the `onDrop` coordinate bug present in WorkflowBuilder.vue: replace `getBoundingClientRect` math with `useVueFlow().project(event.clientX, event.clientY)`.
7. Create `app/composables/usePetriNet.ts`. Stores `{ places, transitions, arcs }` as reactive refs. Persists to `localStorage` key `'wasm4pm-petrinet'` on every mutation. Exposes `addPlace()`, `addTransition()`, `deleteSelected()`, `autoLayout()` (calls ELK worker from feature 1), `fromDiscoveryResult(json)`.
8. Wire toolbar in `PetriNetCanvas.vue`: `UButtonGroup` with Add Place, Add Transition, Delete, Auto-Layout.
9. In `AlgorithmDemo.vue`: when `algorithmId` is `discover_alpha` or `discover_inductive`, call `usePetriNet().fromDiscoveryResult(result)` to hydrate the canvas.

**Install:** `pnpm add @vue-flow/core @vue-flow/background @vue-flow/controls @vue-flow/minimap`

**Acceptance criteria:**
- [ ] User can drag Place and Transition nodes onto the canvas and connect them with arcs without page reload
- [ ] After running `discover_alpha` in `AlgorithmDemo`, `PetriNetCanvas` auto-populates with the discovered model
- [ ] Canvas renders correctly inside the playground layout without overflow clipping
- [ ] `localStorage` key `'wasm4pm-petrinet'` is populated after any canvas edit and survives a browser refresh

---

### 4. XES/OCEL file upload with drag-and-drop

**Source:** `/Users/sac/cns/bitjob/components/ResumeUpload.vue` (build status: unknown; score: 0.68). Implements full drag-and-drop zone with `@drop/@dragover` handlers, progress bar, per-step status text, all using Nuxt UI primitives — directly portable.
**Effort:** S | **Impact:** High

**Why now:** Without file upload the playground only works with hardcoded demo data. All algorithm demos need real event logs.

**Port spec:**
1. Read `/Users/sac/cns/bitjob/components/ResumeUpload.vue`: `@drop/@dragover` handlers, hidden `<input type="file">`, `processingProgress.progress_percentage` driving a progress bar, Nuxt UI (`UButton`, `UIcon`) and Tailwind only — no chart/graph libraries.
2. Create `app/components/content/XesUpload.vue`. Replace `FILE_UPLOAD` MIME constants with `.xes`, `.json`, `.jsonocel`, `.csv`. Replace AI processing status poll with OTEL span progress events from `useWasmWorker` (the worker posts progress messages that `useWasmWorker.onChunk` forwards).
3. Wire `handleDrop` to emit a `log-ready` event carrying the `File` object and the parsed `LogHandle` after worker-side parse completes.
4. Show invalid file type error state (wrong extension) without crashing.
5. No new library deps — all Nuxt UI primitives already present in the playground.

**Install:** *(none)*

**Acceptance criteria:**
- [ ] User can drag a `.xes` file onto the drop zone and it is parsed into a wasm4pm event log handle emitted as `log-ready`
- [ ] Progress bar reflects OTEL span progress during parsing
- [ ] Invalid file types (e.g. `.pdf`) show an inline error state without crashing

---

### 5. Cytoscape directed graph with dagre/cola layout

**Source:** `/Users/sac/cns/nuxt_ui_80_20_permutations/nuxt-ui-semantic-playground/components/ui/SemanticGraph.vue` (build status: builds; score: 75). Uses `cytoscape@^3.26.0` with `cytoscape-dagre` and `cytoscape-cola`. Supports directed graphs with dynamic layout switching. Extractable as-is with minor additions for weight-based edge thickness.
**Effort:** S | **Impact:** Medium

**Why now:** Provides an alternative DFG renderer with switchable dagre/cola layout — useful until ELK is fully wired, and supports edge weight styling out of the box. Score 75 with confirmed builds.

**Port spec:**
1. Read `/Users/sac/cns/nuxt_ui_80_20_permutations/nuxt-ui-semantic-playground/components/ui/SemanticGraph.vue`: `cytoscape` init is self-contained; accepts `{nodes, edges}` props; supports layout switching; exposes the `cy` instance.
2. Create `app/components/content/DfgGraph.vue`. Copy the Cytoscape initialization. Add a style rule `'width': 'mapData(weight, 0, 100, 1, 8)'` for edge thickness. Accept `{ nodes: [{id, label, count}], edges: [{source, target, weight}] }` props — map `count` to node size and `weight` to edge width.
3. Add a `UToggleGroup` for layout switching between `dagre` and `cola` without page reload.
4. Emit `select-activity` event with `activity.id` on node click.

**Install:** `pnpm add cytoscape cytoscape-dagre cytoscape-cola`

**Acceptance criteria:**
- [ ] `DfgGraph` renders a DFG with edge thickness proportional to `weight`
- [ ] Layout toggles between dagre and cola without page reload
- [ ] Node click emits `select-activity` event with the activity id

---

## Q2 — Interaction (Oct–Dec 2026)

*Goal: in-browser XES/OCEL editing via Monaco, benchmark mode comparing all 60 algorithms, conformance dashboard with radar chart, and pipeline visualization with XState-driven stage animation.*

---

### 6. @monaco-editor/vue3 XES/OCEL editor

**Source:** Engineering gap. SSR-safe `.client.vue` pattern validated at `/Users/sac/dev/cracking-coding-platform/components/Editor.client.vue` (build status: partial; score: 0.55) — uses `nuxt-monaco-editor` Nuxt module, not `@monaco-editor/vue3`. Use `@monaco-editor/vue3` directly to avoid adding a Nuxt module dependency.
**Effort:** M | **Impact:** High

**Why now:** Enables direct XES/OCEL JSON authoring in the browser — critical for interactive demos that need non-hardcoded log input.

**Port spec:**
1. Read `/Users/sac/dev/cracking-coding-platform/components/Editor.client.vue` for the SSR-safe `.client.vue` pattern and monaco wiring approach. Note: that project uses `nuxt-monaco-editor` — do NOT replicate the Nuxt module approach; use `@monaco-editor/vue3` component import directly.
2. `pnpm add @monaco-editor/vue3 monaco-editor` from `apps/playground-web/`.
3. Create `app/components/content/EventLogEditor.client.vue`. Wraps `MonacoEditor` from `@monaco-editor/vue3` with `language: 'xml'` for XES. Use `defineAsyncComponent` at the import site to defer loading until the component mounts.
4. Create `app/assets/grammars/xes.tmLanguage.json` — a minimal TextMate grammar covering XES element names (`<trace>`, `<event>`, `<string>`, `<date>`, `<int>`, `<float>`, `<boolean>`) and their `key`/`value` attributes. Register via `monaco.languages.setMonarchTokensProvider('xes', ...)` on editor mount.
5. Create `app/components/content/OcelEditor.client.vue`. Same wrapper with `language: 'json'` and an OCEL 2.0 JSON schema registered via `monaco.languages.json.jsonDefaults.setDiagnosticsOptions`.
6. Add a Validate button in both editors: posts content to `useWasmWorker` with `algorithmId: 'parse_log'`. On error, calls `monaco.editor.setModelMarkers` to display parse errors inline.
7. On successful parse, emit `log-ready` with the parsed `LogHandle` that `AlgorithmDemo.vue` accepts via a `logOverride` prop.
8. For OCPQ keyword support, read lines 67–120 of `/Users/sac/pigsty-supabase-osx/supabase/apps/studio/components/interfaces/SQLEditor/MonacoEditor.tsx` for the `OnMount` keybinding registration pattern — apply that pattern to register OCPQ keywords as Monaco completions in `OcelEditor.client.vue`. Do NOT import any Supabase or Next.js modules.

**Install:** `pnpm add @monaco-editor/vue3 monaco-editor`

**Acceptance criteria:**
- [ ] `EventLogEditor.client.vue` loads with XES XML syntax highlighting and schema-based validation
- [ ] Component does not SSR (file ends in `.client.vue`; no `window is not defined` errors in server logs)
- [ ] Pasting a malformed XES document and clicking Validate shows a Monaco inline error marker with line/column
- [ ] OCPQ keywords autocomplete in `OcelEditor.client.vue` with Ctrl+Space

---

### 7. Algorithm benchmark mode — run all 60 on same log

**Source:** Engineering gap. Animated node execution pattern validated at `/Users/sac/jotp/benchmark-site/components/flows/` (build status: unknown; score: 82) — Next.js/ReactFlow project. Port the concept (per-node status animation, recharts bar output) using `@vue-flow/core` and `@unovis/vue` rather than lifting ReactFlow.
**Effort:** L | **Impact:** High

**Why now:** Differentiating feature — no other process mining playground shows comparative performance across 60 algorithms. Depends on WebWorker from Q1.

**Port spec:**
1. Read `packages/kernel/src/registry.ts` (workspace path `../../packages/kernel/src/registry.ts`) to get the 60 algorithm IDs and category tags.
2. Read `/Users/sac/jotp/benchmark-site/components/flows/benchmark-pipeline.tsx` for the animated node status pattern (`running`/`done` per node). Do NOT lift ReactFlow — reimplement `WasmAlgorithmNode` as a `@vue-flow/core` custom node following the `ActionNode.vue` pattern confirmed in feature 3 (same `defineProps(['data'])` + handle class pattern).
3. Read `/Users/sac/jotp/benchmark-site/` XState machines and adapt to a Vue composable using the same state names (`idle`/`running`/`done`/`error`).
4. `pnpm add xstate @xstate/vue` from `apps/playground-web/`.
5. Create `app/composables/useBenchmarkRunner.ts`. Spawns a pool of 4 `wasm-runner.worker.ts` instances. Exposes `runAll(log): AsyncIterable<BenchmarkResult>` — each emitted item is `{ algorithmId, durationMs, fitness, precision, generalization, simplicity, receiptHash, category }`. Uses a queue to keep all 4 workers busy until all algorithms are dispatched.
6. Create `app/pages/benchmark.vue`. Accepts a log from `XesUpload` or `EventLogEditor` (via route state). Calls `useBenchmarkRunner().runAll(log)`. As results stream in, append rows to a reactive array driving a `@nuxt/ui` `UTable`. Columns: Algorithm, Category, Duration (ms), Fitness, Precision, Generalization, Simplicity, Receipt.
7. Add sparkline bars per metric using `@unovis/vue` `BarChart` (already installed) in fixed `max-width: 80px` cells.
8. Add Download CSV button.
9. ML/cognition algorithms in a separate `UTabs` tab "ML & Cognition".

**Install:** `pnpm add xstate @xstate/vue`

**Acceptance criteria:**
- [ ] On a log with ≥5 traces, all 60 algorithm IDs appear as rows by end of the benchmark run
- [ ] Individual result rows appear as they complete — table is not blank until all 60 finish
- [ ] Each algorithm node animates through `idle`/`running`/`done` states driven by the XState machine
- [ ] Download CSV produces a valid CSV with header row and one data row per algorithm

---

### 8. Conformance dashboard — token replay + alignment side-by-side

**Source:** Engineering gap — `QualityBadge.vue` exists (single score); `@unovis/vue` already installed; `ConformanceExplainer.vue` provides static prose to extract.
**Effort:** M | **Impact:** High

**Why now:** Core educational value of the playground. Four-dimension van der Aalst conformance is the methodological core; it must be visually prominent.

**Port spec:**
1. Read `app/components/content/QualityBadge.vue` and `app/components/content/ConformanceExplainer.vue` to understand the current data contract and prose content.
2. Create `app/components/content/ConformanceRadar.vue`. Uses `@unovis/vue` `RadarChart` with four axes: Fitness (0–1), Precision (0–1), Generalization (0–1), Simplicity (0–1). Accepts `scores: ConformanceScores` prop. Renders a filled polygon.
3. Create `app/components/content/ConformanceDashboard.vue`. Mounts `ConformanceRadar` with the primary model's scores. Below the chart, four `UAccordion` items — one per dimension — with educational prose from `ConformanceExplainer.vue` plus practical low/high score interpretations.
4. Add CompareModels mode: accepts `comparisonScores?: ConformanceScores`. Renders a second `ConformanceRadar` overlaid at 40% opacity with a legend. Enables alpha miner vs inductive miner side-by-side.
5. Wire both token replay and alignment conformance to the same loaded Petri net and event log from `XesUpload`. Left panel: `token_replay` via WebWorker → fitness/precision/generalization/simplicity badges. Right panel: `alignment_conformance` → move costs. Both triggered by a single Run button.
6. In `AlgorithmDemo.vue`: replace `<QualityBadge>` with `<ConformanceDashboard :scores="result.conformance" />`. Keep `QualityBadge` as a compact chip in table/list contexts only.
7. Deviating traces highlight in `ProcessGraph` (pass a `deviatingActivityIds` prop that colours nodes red).

**Install:** *(none — `@unovis/vue` already installed)*

**Acceptance criteria:**
- [ ] Both token replay and alignment results display side-by-side from a single Run button
- [ ] All four radar axes render with correct 0–1 scale and labelled corners
- [ ] In CompareModels mode, two differently-coloured polygons are visible simultaneously on the same chart
- [ ] Deviating traces are highlighted in `ProcessGraph`

---

### 14. ReactFlow pipeline visualization — AlgorithmPipelineFlow

**Source:** `/Users/sac/jotp/benchmark-site` (build status: unknown; score: 82). React-only — extractability penalized. Port the XState machine and animated stage pattern; reimplement canvas using `@vue-flow/core` (already installed from Q1 feature 3).
**Effort:** M | **Impact:** Medium

**Why now:** XState integration from the benchmark site (feature 7) is already added in Q2. The pipeline flow view is a natural companion page.

**Port spec:**
1. Read `/Users/sac/jotp/benchmark-site/components/flows/benchmark-pipeline.tsx` for the animated node status pattern.
2. Do NOT lift `@xyflow/react` — reimplement `WasmAlgorithmNode` as a `@vue-flow/core` custom node following the `ActionNode.vue` pattern from feature 3.
3. Read `/Users/sac/jotp/benchmark-site/` XState machines; adapt to a Vue composable using the same state names (`idle`/`running`/`done`/`error`). XState `@xstate/vue` already added in feature 7.
4. Create `app/components/content/AlgorithmPipelineFlow.vue`. Shows each algorithm stage animating through states. Completed stages show execution time in the node label.
5. Wire to OTEL span events from `useWasmWorker` to drive state transitions deterministically.

**Install:** *(none — `@vue-flow/core`, `xstate`, `@xstate/vue` already installed)*

**Acceptance criteria:**
- [ ] Pipeline flow shows each algorithm stage animating through `idle`/`running`/`done` states
- [ ] XState machine drives stage transitions deterministically from OTEL span events
- [ ] Completed stages show execution time in the node label
- [ ] Component does not import from `@xyflow/react`

---

## Q3 — Intelligence (Jan–Mar 2027)

*Goal: streaming algorithm updates with scrubber replay, receipt mining (the playground mines its own history), and the 3D OCEL object graph for large object-centric logs.*

---

### 9. Streaming algorithm results via SSE (concept drift + streaming DFG)

**Source:** Engineering gap — streaming DFG and concept drift require live incremental updates. Depends on WebWorker (Q1) and ELK layout (Q1).
**Effort:** L | **Impact:** High

**Why now:** Streaming DFG is a fundamentally different UX from batch runs. With Q1 WebWorker and ELK stable this becomes straightforward.

**Port spec:**
1. Extend `app/workers/wasm-runner.worker.ts` with the `'stream'` message type already scaffolded in Q1 feature 2: posts `{ type: 'chunk', partialModel, windowIndex }` messages then `{ type: 'done', receiptHash }`.
2. Create `app/composables/useStreamingRun.ts`. Manages the worker stream subscription. Exposes `partialModel: Ref<ProcessModel | null>`, `windowIndex: Ref<number>`, `chunks: Ref<ProcessModel[]>`, `start(log)`, `stop()`.
3. Create `app/components/content/StreamingDfgDemo.vue`. Renders `ProcessGraph` bound to `partialModel` — updates reactively on each chunk (Vue reactivity, no polling). Shows a window counter badge. Add concept drift alert: when `partialModel.driftScore > threshold`, show a `UBadge` colour `amber` with text `DRIFT DETECTED`.
4. Add Playback Scrubber: `URange` slider bound to `playbackIndex`. Changing the slider sets `partialModel` to `chunks[playbackIndex]` for post-hoc replay.
5. Create `server/routes/stream-algorithm.get.ts` (Nitro route). Accepts `?algorithmId=&logPath=` query params. Uses a `ReadableStream` to push OTEL span events as SSE `data:` lines. For large logs that exceed browser memory, the client sends the file path and the server proxies execution.
6. Cache all chunks in `useReceiptStore` (Q3 feature 10) under the run's `receiptHash` key for cross-session playback.

**Install:** *(none)*

**Acceptance criteria:**
- [ ] On a log with 10 time windows, `ProcessGraph` visibly updates 10 times during streaming (confirmed by `windowIndex` incrementing in UI)
- [ ] The playback scrubber at position 3 shows the model state after window 3, not the final model
- [ ] The SSE server route responds with `Content-Type: text/event-stream` and emits at least one `data:` line per WASM chunk
- [ ] Concept drift alert appears when `driftScore` exceeds the configured threshold

---

### 10. Receipt timeline page

**Source:** Engineering gap — `useReceipt.ts` handles one receipt at a time; no `IndexedDB` persistence; no `app/pages/receipts.vue`.
**Effort:** M | **Impact:** Medium

**Why now:** Meta-feature: mines the playground's own run history as an event log. Demonstrates eat-your-own-dogfood van der Aalst compliance and is a compelling live demo.

**Port spec:**
1. Read `app/composables/useReceipt.ts` — understand the current single-receipt pattern.
2. Create `app/composables/useReceiptStore.ts`. Uses `@vueuse/core`'s `useIndexedDB` (already installed) under database `'wasm4pm'`, object store `'receipts'`. Exposes `save(receipt)`, `getAll(): Promise<Receipt[]>`, `exportAsOcel(): OcelJson`.
3. Update `useWasmWorker.ts` from Q1: on every successful run, call `useReceiptStore().save(receipt)` before resolving the Promise.
4. Create `app/pages/receipts.vue`. On `onMounted`, call `useReceiptStore().getAll()`. Render in a `UTable` with columns: `timestamp`, `algorithmId`, `inputHash` (first 8 chars), `outputHash` (first 8 chars), `durationMs`, `fitness` (shown as `—` if absent). Add the route to sidebar navigation.
5. Mine This Log button: calls `useReceiptStore().exportAsOcel()`, feeds OCEL JSON to WASM process discovery worker, renders discovered DFG in `ProcessGraph` with `mode: 'frequency'`.

**Install:** *(none — `@vueuse/core` already installed)*

**Acceptance criteria:**
- [ ] After three algorithm runs in `AlgorithmDemo`, navigating to `/receipts` shows exactly three rows
- [ ] Mine This Log button triggers discovery and renders a non-empty DFG when at least five receipts exist
- [ ] Receipt data survives a browser hard-refresh (IndexedDB, not sessionStorage)
- [ ] Each receipt row links to the original run's `ReceiptViewer`

---

### 12. AdvancedRDFGraphViewer — D3 + Three.js OCEL object graph

**Source:** `/Users/sac/cns/nuxt-bit-supa/components/visualizations/AdvancedRDFGraphViewer.vue` (build status: unknown — `deps:missing`; score: 0.65). Confirmed: uses D3 v7 force simulation + Three.js v0.163 WebGL renderer; 4 layout modes; 3 render modes; max-nodes to 25K; FPS counter.
**Effort:** L | **Impact:** Medium

**Why now:** Score 0.65 with confirmed D3/Three.js usage. Useful for large OCEL object graphs. Heavy deps (~1.5 MB gzipped) justified after OCEL explorer need is confirmed in Q4.

**Port spec:**
1. Read `/Users/sac/cns/nuxt-bit-supa/components/visualizations/AdvancedRDFGraphViewer.vue` in full. The component uses `d3.forceSimulation`, `d3.forceLink`, `d3.forceManyBody`, `d3.forceCenter`, `d3.forceCollide`, and `THREE.WebGLRenderer`. All four layout modes and three render modes are data-model-agnostic.
2. `pnpm add d3 three` from `apps/playground-web/`.
3. Create `app/components/content/OcelGraphViewer.vue`. Replace the RDF Triple data model (`{subject, predicate, object, termType}`) with wasm4pm OCEL object graph format (`{ nodes: [{id, type, count}], edges: [{source, target, qualifier}] }`). Colour nodes by `type` with an auto-generated legend.
4. Keep all four layout modes (force-directed, radial, hierarchical, circular) and three render modes (SVG/Canvas/WebGL) unchanged — they are data-model-agnostic.
5. Add FPS counter toggle for playground performance transparency.
6. Lazy-load Three.js via `defineAsyncComponent` to avoid adding ~800 KB to the initial bundle.

**Install:** `pnpm add d3 three`

**Acceptance criteria:**
- [ ] Renders a 100-node OCEL object graph without frame drops below 30 fps
- [ ] Layout mode switch between force-directed and radial works without page reload
- [ ] WebGL render mode activates successfully in Chrome without console errors
- [ ] Component does not appear in the initial JS bundle (lazy-loaded, confirmed via chunk analysis)

---

### 16. SchemaFlow — Vue Flow diagram for OCEL schema visualization

**Source:** `/Users/sac/pigsty-supabase-osx/supabase/apps/studio` (build status: partial; score: 5.2). React-only `reactflow` v11 component — must be fully rewritten for Vue. The data shape (`nodes: Node[], edges: Edge[]`) is framework-agnostic. `@vue-flow/core` already installed from Q1.
**Effort:** M | **Impact:** Medium

**Why now:** Useful companion to Q4 OCEL explorer — shows object type schemas as an ER-style diagram. `@vue-flow/core` is already installed so no new deps.

**Port spec:**
1. Read `/Users/sac/pigsty-supabase-osx/supabase/apps/studio` for the `SchemaFlowProps` interface (`nodes: Node[], edges: Edge[]`) — the data shape maps directly to OCEL object type relationships. Do NOT copy any ReactFlow JSX.
2. Rewrite entirely using `@vue-flow/core` (already installed). Replace `useReactFlow` with `useVueFlow`. Port the `TableNode` custom node to a Vue SFC `OcelTypeNode.vue` following the `PetriPlace.vue` pattern from Q1 feature 3.
3. Create `app/components/content/OcelSchemaFlow.vue`. Accepts `{ nodes: OcelTypeNode[], edges: OcelTypeEdge[] }` props. Emits `select-type` on node click.
4. In Q4 OCEL explorer: clicking an `OcelSchemaFlow` node filters the OCEL explorer to that object type.

**Install:** *(none — `@vue-flow/core` already installed)*

**Acceptance criteria:**
- [ ] `OcelSchemaFlow` renders OCEL object types as nodes and relationships as edges
- [ ] Clicking a node emits `select-type` with the object type name
- [ ] Component uses `@vue-flow/core` only — no `reactflow` or `@xyflow/react` import

---

## Q4 — Enterprise (Apr–Jun 2027)

*Goal: OCEL 2.0 explorer with per-object-type DFG and OCPQ queries, shareable receipt links, and the remaining workflow visualization components.*

---

### 11. OCEL explorer — load OCEL 2.0, filter by object, run ocel_dfg

**Source:** Engineering gap — no source project provides OCEL-specific UI. Depends on Q1 (`XesUpload`, ELK layout, WebWorker), Q2 (`OcelEditor.client.vue`), Q3 (`OcelSchemaFlow`).
**Effort:** L | **Impact:** High

**Why now:** Object-centric process mining is the van der Aalst frontier. Requires stable Q1–Q3 infrastructure before this XL build is viable.

**Port spec:**
1. Create `app/pages/ocel-explorer.vue`. Three-panel CSS grid layout.
2. Left panel: `XesUpload` repurposed for `.jsonocel` files. On `log-ready`, store the parsed OCEL handle in `useOcelExplorer`.
3. Create `app/composables/useOcelExplorer.ts`. Exposes `objectTypes: Ref<string[]>`, `selectedTypes: Ref<string[]>`, `dfgByType: Ref<Record<string, ProcessModel>>`. On `selectedTypes` change, dispatches per-type DFG discovery to `useWasmWorker` via `ocel_dfg` algorithm.
4. Middle panel: `UCheckboxGroup` for object type selection bound to `selectedTypes`. Object count and event count displayed per type.
5. Right panel: `UTabs` — one tab per selected type showing `ProcessGraph` with ELK-positioned `ocel_dfg` output. Plus an inter-object relationship tab using `OcelSchemaFlow` (from Q3 feature 16).
6. Bottom panel: `OcelEditor.client.vue` in SPARQL/OCPQ mode (from Q2 feature 6). Run Query button posts to `useWasmWorker` with `algorithmId: 'ocpq_query'`; results in `UTable`.
7. Add route to sidebar navigation.

**Install:** *(none — all deps installed in prior quarters)*

**Acceptance criteria:**
- [ ] Uploading an OCEL 2.0 JSON file populates object type checkboxes with correct type names from the log
- [ ] Selecting two object types renders two DFG tabs with ELK-positioned layouts within 2 seconds
- [ ] Object count and event count displayed per selected type
- [ ] An OCPQ query executes without error and returns results in the table

---

### 13. Shareable receipt links — encode run_id in URL

**Source:** Engineering gap. `@wasm4pm/supabase` package already in workspace. Depends on receipt store from Q3 feature 10.
**Effort:** S | **Impact:** Medium

**Why now:** Low engineering effort; high social/demo value. The receipt store from Q3 makes the data accessible; this just adds a publish endpoint and verify UX.

**Port spec:**
1. Read `packages/supabase/src/` to understand the Supabase client and table schema conventions.
2. Create `server/api/receipts/publish.post.ts` (Nitro server route). Accepts POST body `{ algorithmId, inputHash, outputHash, params, durationMs, fitness }`. Inserts into Supabase table `playground_receipts` (`id UUID DEFAULT gen_random_uuid()`, `algorithm_id`, `input_hash`, `output_hash`, `params jsonb`, `duration_ms`, `fitness`, `created_at`). Returns `{ id, url: '/r/' + id }`. Falls back to localStorage if `SUPABASE_URL` is not configured — serialise receipt as base64 blob in the URL query param with a visible warning banner.
3. Create `app/composables/useReceiptShare.ts`. Exposes `publish(receipt): Promise<{ url: string }>`. On success, copies URL to clipboard via `navigator.clipboard.writeText`. Shows `UToast` notification.
4. Create `app/pages/r/[id].vue`. On `useAsyncData`, fetches receipt by ID from Supabase (or decodes from query param in localStorage mode). Displays all fields. Verify button: re-runs algorithm via `useWasmWorker` using stored `params`, compares `outputHash`. Shows `UBadge` colour `green` text `VERIFIED` on match; colour `red` text `HASH_MISMATCH` on mismatch.
5. In `AlgorithmDemo.vue`: add Share button next to Run. Calls `useReceiptShare().publish(latestReceipt)`.
6. Document `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env.example`.

**Install:** *(none — `packages/supabase` already in workspace)*

**Acceptance criteria:**
- [ ] Share button copies a URL with `/r/{uuid}` path (Supabase) or `?receipt=` param (localStorage fallback) to clipboard
- [ ] Loading that URL in a fresh incognito browser window displays receipt fields and a Verify button
- [ ] Clicking Verify re-runs the algorithm and shows `VERIFIED` when the hash matches
- [ ] If Supabase is not configured, localStorage fallback works with a visible warning banner

---

### 17. ggen workflow visualizer — DFG step tracker

**Source:** Concept from `/Users/sac/optimus/src/components/ggen-workflow-visualizer.tsx` (build status: partial; score: 18). The original is a linear step-list tracker for an AI agent pipeline — no graph library, no DFG format support. Full rewrite required.
**Effort:** M | **Impact:** Low

**Why now:** Low priority given other graph components cover this space. Deferred to Q4 after `@vue-flow/core` patterns are established.

**Port spec:**
1. Discard the optimus `ggen-workflow-visualizer.tsx` implementation entirely — do not port any code. The `WorkflowState`/`WorkflowStep` schema from `ggen-copilot` is incompatible with wasm4pm DFG format.
2. Port concept only: use `@vue-flow/core` (already installed) to render DFG nodes as activity cards with step status badges. Reuse Lucide icons from the original for status badges (pending/running/done/error).
3. Create `app/components/content/WorkflowStepTracker.vue`. Accepts props `{ nodes: [{id, label, count}], edges: [{source, target, weight}] }` matching wasm4pm DFG format. Renders left-to-right flow with status badge per node. Completed steps show a checkmark; running steps show a spinner.

**Install:** *(none — `@vue-flow/core` already installed)*

**Acceptance criteria:**
- [ ] `WorkflowStepTracker` shows algorithm execution steps left-to-right with status badges
- [ ] Completed steps show a checkmark; running steps show a spinner
- [ ] Component accepts DFG props and renders without `@xyflow/react` dependency

---

### 18. knowledge-graph-view — OCEL object relationship graph

**Source:** Concept only from `/Users/sac/optimus/src/components/knowledge-graph.tsx` (build status: partial; score: 12). Original is an RDF triple-store CRUD UI backed by a SPARQL endpoint — incompatible with wasm4pm. Build from scratch using `d3-force` (added in Q3 for `OcelGraphViewer`).
**Effort:** L | **Impact:** Low

**Why now:** Only useful after OCEL explorer is stable. Low priority — `OcelGraphViewer` from Q3 already covers much of this space.

**Port spec:**
1. Do not port any code from `/Users/sac/optimus/src/components/knowledge-graph.tsx` — the RDF API dependency and Triple schema (`{subject, predicate, object, termType}`) are incompatible with wasm4pm.
2. Build `app/components/content/OcelObjectGraph.vue` from scratch. Fetch wasm4pm object-graph output from kernel via `useWasmWorker`. Render with `d3-force` (already installed from Q3 `OcelGraphViewer`).
3. Nodes coloured by object type with a legend. No RDF/SPARQL import of any kind.

**Install:** *(none — `d3` already installed from Q3)*

**Acceptance criteria:**
- [ ] Renders OCEL object relationships as a force-directed graph using `d3-force`
- [ ] Nodes are coloured by object type with a legend
- [ ] Component does not import from or depend on any RDF/SPARQL library

---

## Dependency Budget

| Package | Approx. Size | What It Enables | Quarter Added |
|---|---|---|---|
| `elkjs` | ~2.5 MB (worker-only, not in main bundle) | Layered DFG layout in `ProcessGraph.vue` and `PetriNetCanvas.vue` | Q1 |
| `cytoscape` | ~300 KB | Alternative DFG renderer in `DfgGraph.vue` | Q1 |
| `cytoscape-dagre` | ~50 KB | dagre layout for Cytoscape | Q1 |
| `cytoscape-cola` | ~200 KB | cola layout for Cytoscape | Q1 |
| `@vue-flow/core` | ~120 KB gzipped | Petri net canvas, inter-object graph, schema flow, pipeline flow, step tracker | Q1 |
| `@vue-flow/background` | ~5 KB | Canvas background grid/dots | Q1 |
| `@vue-flow/controls` | ~10 KB | Zoom/pan toolbar | Q1 |
| `@vue-flow/minimap` | ~15 KB | Canvas minimap | Q1 |
| `@monaco-editor/vue3` | ~2 MB (lazy via `defineAsyncComponent`) | XES/OCEL in-browser editing with schema validation | Q2 |
| `monaco-editor` | bundled with above | Monaco core (lazy-loaded) | Q2 |
| `xstate` | ~30 KB | Algorithm stage state machine | Q2 |
| `@xstate/vue` | ~10 KB | Vue composable bindings for XState | Q2 |
| `d3` | ~500 KB (lazy) | OCEL force-directed graph in `OcelGraphViewer.vue` | Q3 |
| `three` | ~800 KB (lazy) | WebGL render mode in `OcelGraphViewer.vue` | Q3 |

**Packages already present (no addition needed):** `@unovis/vue` (radar chart, sparklines, bar charts), `@vueuse/core` (IndexedDB, reactive utilities), `@nuxt/ui` (UTable, URange, USlideover, UBadge, UTabs, UAccordion, UCheckboxGroup), `zod`, tailwindcss.

**Main bundle impact:** Zero. All graph libraries load in Web Workers (`elkjs`) or via `defineAsyncComponent` (`monaco-editor`, `d3`, `three`). `@vue-flow/core`, `cytoscape`, `xstate` are the only additions to the main bundle — combined ~740 KB gzipped.

---

## Validation Summary

| # | Feature | Source File(s) | Build Status | Score | Quarter |
|---|---|---|---|---|---|
| 1 | ELK layout for ProcessGraph.vue | `/Users/sac/unrdf/packages/kgc-4d-playground/components/visualizations/ForensicView.jsx` | builds | 62 | Q1 |
| 2 | WebWorker offload for WASM runs | gap — `app/composables/useWasm.ts` | — | — | Q1 |
| 3 | WorkflowBuilder / @vue-flow Petri net canvas | `/Users/sac/dev/crewai/components/nocode/WorkflowBuilder.vue` + `ActionNode.vue` | partial / builds | 0.82 / 0.79 | Q1 |
| 4 | XES/OCEL file upload with drag-and-drop | `/Users/sac/cns/bitjob/components/ResumeUpload.vue` | unknown | 0.68 | Q1 |
| 5 | Cytoscape DFG with dagre/cola layout | `/Users/sac/cns/nuxt_ui_80_20_permutations/nuxt-ui-semantic-playground/components/ui/SemanticGraph.vue` | builds | 75 | Q1 |
| 6 | @monaco-editor/vue3 XES/OCEL editor | gap + SSR pattern from `/Users/sac/dev/cracking-coding-platform/components/Editor.client.vue` | partial | 0.55 | Q2 |
| 7 | Algorithm benchmark mode | `/Users/sac/jotp/benchmark-site/components/flows/` | unknown | 82 | Q2 |
| 8 | Conformance dashboard — radar chart | gap — `QualityBadge.vue` + `@unovis/vue` present | — | — | Q2 |
| 14 | ReactFlow pipeline → AlgorithmPipelineFlow | `/Users/sac/jotp/benchmark-site` (XState pattern) | unknown | 82 | Q2 |
| 9 | Streaming algorithm results via SSE | gap | — | — | Q3 |
| 10 | Receipt timeline page | gap — `useReceipt.ts` single-receipt only | — | — | Q3 |
| 12 | AdvancedRDFGraphViewer → OcelGraphViewer | `/Users/sac/cns/nuxt-bit-supa/components/visualizations/AdvancedRDFGraphViewer.vue` | unknown (deps missing) | 0.65 | Q3 |
| 16 | SchemaFlow → OcelSchemaFlow | `/Users/sac/pigsty-supabase-osx/supabase/apps/studio` | partial | 5.2 | Q3 |
| 11 | OCEL explorer | gap | — | — | Q4 |
| 13 | Shareable receipt links | gap + `packages/supabase` present | — | — | Q4 |
| 17 | ggen workflow visualizer → WorkflowStepTracker | `/Users/sac/optimus/src/components/ggen-workflow-visualizer.tsx` (concept only, full rewrite) | partial | 18 | Q4 |
| 18 | knowledge-graph-view → OcelObjectGraph | `/Users/sac/optimus/src/components/knowledge-graph.tsx` (concept discarded, build from scratch) | partial | 12 | Q4 |
| — | SPARQLEditor.vue | `/Users/sac/cns/nuxt-bit-supa/components/SPARQLEditor.vue` | unknown | 0.45 | SKIP — plain textarea, no Monaco |
| — | MonacoEditor (studio) | `/Users/sac/pigsty-supabase-osx/supabase/apps/studio/components/interfaces/SQLEditor/MonacoEditor.tsx` | partial | 5.9 | PATTERN ONLY — OnMount keybinding for Q2 OCPQ |
| — | dash (nuxt-ui-pro dashboard) | `/Users/sac/dev/dash` | unknown | 0.3 | SKIP — no graph/editor deps |
| — | remo/dashboard | `/Users/sac/remo/dashboard` | builds | 18 | SKIP — security ops UI, no graph components |
| — | bytestar NDimensionalVisualization | `/Users/sac/bytestar/src/frontend/nuxt-bytestar` | unknown | 60 | DEFER — tightly coupled to bytestar entity model |
| — | process-intelligence visualizer-nextjs | `/Users/sac/process-intelligence/experiments/visualizer-nextjs` | partial | 5 | SKIP — empty Next.js scaffold |
| — | WorkflowSettings.vue | `/Users/sac/dev/crewai/components/nocode/WorkflowSettings.vue` | partial | 12 | SKIP — metadata form only, no canvas |

---

## Port Priority Matrix

```
                     EASY TO EXTRACT              HARD TO EXTRACT
                  ┌────────────────────────────┬──────────────────────────────┐
                  │                            │                              │
   TRANSFORMATIVE │  #3  DFG Heatmap           │  #3  Petri Net Canvas        │
     / HIGH       │      (S, no deps)          │      (L, @vue-flow/core)     │
                  │  #4  XES Upload            │  #11 OCEL Explorer           │
                  │      (S, no deps)          │      (XL, 3 dep quarters)    │
                  │  #2  WebWorker offload     │  #1  ELK Layout              │
                  │      (M, no deps)          │      (M, elkjs worker)       │
                  │  #8  Conformance Dash      │  #7  Benchmark Mode          │
                  │      (M, unovis present)   │      (L, worker pool)        │
                  │  #10 POWL Tree             │  #9  Streaming SSE           │
                  │      (M, no deps)          │      (L, server+worker)      │
                  ├────────────────────────────┼──────────────────────────────┤
                  │                            │                              │
      MEDIUM      │  #5  Cytoscape DFG         │  #12 AdvancedRDFGraphViewer  │
                  │      (S, cy+dagre+cola)    │      (L, d3+three lazy)      │
                  │  #10 Receipt Timeline      │  #13 Receipt Sharing         │
                  │      (S, vueuse present)   │      (L, Supabase+verify)    │
                  │  #6  Monaco Editor         │  #16 SchemaFlow              │
                  │      (M, lazy-loaded)      │      (M, React→Vue rewrite)  │
                  ├────────────────────────────┼──────────────────────────────┤
                  │                            │                              │
        LOW       │  #17 WorkflowStepTracker   │  #18 OcelObjectGraph         │
                  │      (M, vue-flow present) │      (L, OCEL explorer dep)  │
                  │  #14 PipelineFlow          │                              │
                  │      (M, xstate added Q2)  │                              │
                  └────────────────────────────┴──────────────────────────────┘
```

**Do first — top-left (Q1):** `#2 WebWorker offload` is the hard prerequisite for all WASM-calling features; `#3 DFG Heatmap` has zero new dependencies and immediate visual ROI; `#4 XES Upload` unblocks all real-data demos.

**Do next when unblocked (Q1):** `#1 ELK Layout` unlocks meaningful process graphs; `#3 Petri Net Canvas` delivers the interactive canvas before conformance needs it; `#5 Cytoscape DFG` provides a working fallback.

**Sequence carefully (Q2):** `#8 Conformance Dashboard` requires the Petri net from Q1 to have a model to replay. `#7 Benchmark Mode` requires the worker pool from Q1.

**Defer until Q1–Q3 stable (Q4):** `#11 OCEL Explorer` depends on XesUpload (Q1), OcelEditor (Q2), OcelSchemaFlow (Q3). Do not start until all three are merged and stable.

**Skip entirely:** SPARQLEditor.vue (plain textarea — no value), process-intelligence visualizer-nextjs (empty scaffold), dash (no relevant components), WorkflowSettings.vue (metadata form only).

**Pattern-only (no direct port):** MonacoEditor.tsx from Supabase studio — extract the `OnMount` keybinding pattern only (lines 67–120) for OCPQ completions in Q2; do not import any Supabase or Next.js modules.
