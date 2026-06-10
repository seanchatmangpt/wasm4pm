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
| ProcessGraph | registered — ELK layout (async, loading state) DONE |
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
| `useWasmWorker` | yield-based async WASM runner (phase 1) DONE |

---

## Pages

| Route | State |
|---|---|
| `/learn/[...slug]` | active — content renderer |
| `/play` | active — sandbox with OCEL support, cognition sidebar, Monaco XES editor DONE |
| `/play/petri-net` | active — Vue Flow canvas DONE |
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

1. **`/api/cognition` path assumption** — assumes `apps/wasm4pm/dist/bin/wpm.js` exists; returns 500 if TS CLI is not built first (`pnpm build` in `apps/wasm4pm/`).
2. **how-to section not fully indexed** — 4 files on disk in `content/2.how-to/` but SQLite shows 0; restart `nuxt dev` to re-index.
3. **`pnpm-workspace.yaml` rebuild gate** — `allowBuilds: better-sqlite3` must be `true` for the native rebuild to succeed.

---

## Q1 Features — DONE

| Feature | Status |
|---|---|
| ProcessGraph ELK layout (async, loading state) | DONE |
| Monaco XES editor (`XesEditor.client.vue`) | DONE |
| Vue Flow canvas (`/play/petri-net`) | DONE |
| WebWorker phase 1 yield-based async WASM runner | DONE |

---

## Next Immediate Actions (Q2)

1. **WebWorker phase 2** — wire `useWasmWorker` into `/play` sandbox to unblock UI thread for heavy algorithms.
2. **Petri net WASM integration** — connect `/play/petri-net` canvas to `inductive_miner` / `alpha_miner` output for live rendering.
3. **XES schema validation** — add XML schema validation inside `XesEditor.client.vue` (Monaco diagnostics).
4. **ELK layout tuning** — improve edge routing and hierarchical grouping for large DFGs (>50 nodes).
5. **how-to content indexing** — investigate SQLite re-index on cold start for `content/2.how-to/`.
