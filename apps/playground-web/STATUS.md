# Playground Status

**Last verified:** 2026-06-10
**Branch:** enterprise/fortune5-readiness
**Last commit:** 7526f3ce feat(playground-web): enhance educational playground + add project scanner

---

## Stack

| Component | Version / State |
|---|---|
| Nuxt | 4.4.8 |
| @nuxt/ui | 4.8.2 |
| @nuxt/content | 3.14.0 |
| better-sqlite3 | rebuilt for Node.js v25.9.0 (napi v141) |
| TypeScript errors | 0 |

---

## Content Index

| Section | On disk | In SQLite index |
|---|---|---|
| tutorials | 4 | 4 |
| how-to | 4 | 0 — needs `nuxt dev` restart to re-index |
| reference | 2 | 2 |
| explanation | 3 | 2 |
| **Total** | **13** | **8** |

---

## MDC Components (7)

| Component | Status |
|---|---|
| AlgorithmDemo | registered |
| AlgorithmTable | registered |
| ProcessGraph | registered — sqrt(n) grid layout only; positions meaningless for DFG analysis |
| ReceiptViewer | registered |
| CognitionDemo | registered |
| QualityBadge | registered |
| ConformanceExplainer | registered |

---

## Composables

| Composable | Capabilities |
|---|---|
| `useWasm` | singleton WASM init, SSR guard, `loadXes`, `loadOcel`, `runAlgorithm`, `getAlgorithmList` |
| `useReceipt` | SHA-256 hashing + localStorage persistence |

---

## Pages

| Route | State |
|---|---|
| `/learn/[...slug]` | active — content renderer |
| `/play` | active — sandbox with OCEL support and cognition sidebar |
| `/` | redirect |

---

## Server Routes

| Route | Notes |
|---|---|
| `POST /api/cognition` | shells to `wpm`; assumes binary at `apps/wasm4pm/dist/bin/wpm.js` |

---

## Public Assets

| Asset | Notes |
|---|---|
| `wasm4pm_bg.wasm` | 8 MB — 60 algorithms, browser target |
| `wasm4pm.js` | WASM JS glue |
| `wasm4pm_bg.js` | WASM background glue |
| `samples/` | 3 sample XES/OCEL files |

---

## Known Issues

1. **ProcessGraph.vue layout** — uses simple `sqrt(n)` grid; node positions are meaningless for DFG analysis. No Sugiyama, ELK, or dagre layout.
2. **XES input is a plain textarea** — no syntax highlighting, no schema validation (Monaco not installed).
3. **WASM runs block the UI thread** — no WebWorker wrapper; heavy algorithms will freeze the page.
4. **`/api/cognition` path assumption** — assumes `apps/wasm4pm/dist/bin/wpm.js` exists; returns 500 if TS CLI is not built first (`pnpm build` in `apps/wasm4pm/`).
5. **how-to section not fully indexed** — 4 files on disk in `content/2.how-to/` but SQLite shows 0; restart `nuxt dev` to re-index.
6. **`pnpm-workspace.yaml` rebuild gate** — `allowBuilds: better-sqlite3` must be `true` for the native rebuild to succeed.

---

## Next Immediate Actions

1. `pnpm add elkjs` — implement ELK layout in `ProcessGraph.vue` to replace sqrt(n) grid.
2. `pnpm add @monaco-editor/vue3` — create `app/components/content/XesEditor.client.vue` for syntax-highlighted XES/OCEL editing.
3. `pnpm add @vue-flow/core` — create `app/pages/play/petri-net.vue` for interactive Petri net canvas.
