/**
 * wasm.worker.ts — Phase 2 Web Worker scaffold for WASM algorithm offload.
 *
 * STATUS: NOT YET ACTIVE — this file is a Phase 2 scaffold.
 *
 * ## Why Phase 2 is blocked
 *
 * True WASM offload to a Worker requires all three of the following:
 *
 *   1. **Vite worker import syntax** (`import Worker from './wasm.worker.ts?worker'`)
 *      Nuxt 4 + Vite supports this but the worker must be imported at build time,
 *      not from a composable at runtime. Wire up in a plugin or a component that
 *      controls the worker lifecycle.
 *
 *   2. **COOP/COEP headers** — SharedArrayBuffer (needed by some WASM threading
 *      features) requires:
 *        Cross-Origin-Opener-Policy: same-origin
 *        Cross-Origin-Embedder-Policy: require-corp
 *      Add these to nuxt.config.ts → routeRules or a Nitro middleware.
 *      Note: COOP/COEP breaks OAuth popups and some third-party iframes.
 *
 *   3. **WASM binary accessible inside the worker** — the web-target wasm-pack
 *      bundle (wasm4pm.js + wasm4pm_bg.wasm) must be reachable from the worker
 *      origin. The static files are already served from /public; dynamic import
 *      of `/wasm4pm.js` inside a worker should work once (1) and (2) are in place.
 *
 * ## Message protocol (for when Phase 2 is implemented)
 *
 * Main → Worker:
 *   { type: 'run', id: string, algorithm: string, xes: string, activityKey: string, params: Record<string, unknown> }
 *   { type: 'run_handle', id: string, algorithm: string, handle: number, activityKey: string, params: Record<string, unknown> }
 *   { type: 'load_xes', id: string, xes: string }     → returns handle
 *   { type: 'load_ocel', id: string, ocelJson: string } → returns handle
 *
 * Worker → Main:
 *   { type: 'ready' }                                   → WASM init done
 *   { type: 'result', id: string, result: unknown, durationMs: number }
 *   { type: 'handle', id: string, handle: number }
 *   { type: 'error', id: string, error: string }
 *
 * ## Nuxt config snippet (when ready to enable)
 *
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   routeRules: {
 *     '/**': {
 *       headers: {
 *         'Cross-Origin-Opener-Policy': 'same-origin',
 *         'Cross-Origin-Embedder-Policy': 'require-corp',
 *       },
 *     },
 *   },
 * })
 * ```
 *
 * ## Usage in a component (when ready to enable)
 *
 * ```ts
 * import WasmWorker from '~/workers/wasm.worker.ts?worker'
 *
 * const worker = new WasmWorker()
 * worker.onmessage = (e) => { ... }
 * worker.postMessage({ type: 'run', id: crypto.randomUUID(), algorithm: 'inductive_miner', xes, activityKey: 'concept:name', params: {} })
 * ```
 */

// ---------------------------------------------------------------------------
// Scaffold implementation — uncomment and complete when Phase 2 is activated.
// ---------------------------------------------------------------------------

/*
let wasm: Record<string, unknown> | null = null

async function ensureWasm() {
  if (wasm) return
  // Dynamic import works in Worker context with Vite bundling.
  const mod = await import('/wasm4pm.js')
  await (mod as any).default(new URL('/wasm4pm_bg.wasm', self.location.origin))
  wasm = mod as unknown as Record<string, unknown>
  self.postMessage({ type: 'ready' })
}

const WASM_PREFIXES = ['discover_', 'conformance_', 'ml_', 'streaming_', ''] as const

function resolveWasmFn(mod: Record<string, unknown>, name: string) {
  for (const prefix of WASM_PREFIXES) {
    const fn = mod[`${prefix}${name}`]
    if (typeof fn === 'function') return fn as (...args: unknown[]) => string
  }
  return undefined
}

ensureWasm().catch(err => self.postMessage({ type: 'error', id: '__init__', error: String(err) }))

self.onmessage = async (e: MessageEvent) => {
  const { type, id } = e.data
  try {
    await ensureWasm()

    if (type === 'load_xes') {
      const fn = wasm!['load_eventlog_from_xes'] as (s: string) => number
      const handle = fn(e.data.xes)
      self.postMessage({ type: 'handle', id, handle })
      return
    }

    if (type === 'load_ocel') {
      const fn = wasm!['load_ocel_from_json'] as (s: string) => number
      const handle = fn(e.data.ocelJson)
      self.postMessage({ type: 'handle', id, handle })
      return
    }

    if (type === 'run') {
      const handle = (wasm!['load_eventlog_from_xes'] as (s: string) => number)(e.data.xes)
      const fn = resolveWasmFn(wasm!, e.data.algorithm)
      if (!fn) throw new Error(`Algorithm not found: ${e.data.algorithm}`)
      const t0 = performance.now()
      const raw = fn(handle, e.data.activityKey, ...Object.values(e.data.params ?? {}))
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw
      self.postMessage({ type: 'result', id, result, durationMs: performance.now() - t0 })
      return
    }

    if (type === 'run_handle') {
      const fn = resolveWasmFn(wasm!, e.data.algorithm)
      if (!fn) throw new Error(`Algorithm not found: ${e.data.algorithm}`)
      const t0 = performance.now()
      const raw = fn(e.data.handle, e.data.activityKey, ...Object.values(e.data.params ?? {}))
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw
      self.postMessage({ type: 'result', id, result, durationMs: performance.now() - t0 })
      return
    }

    self.postMessage({ type: 'error', id, error: `Unknown message type: ${type}` })
  } catch (err) {
    self.postMessage({ type: 'error', id, error: err instanceof Error ? err.message : String(err) })
  }
}
*/

// Placeholder export so TypeScript does not complain about an empty module.
export {}
