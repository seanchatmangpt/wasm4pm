import { ref, readonly } from 'vue'

// Singleton — WASM init is expensive (8MB), happens once per browser session
let _wasm: Record<string, unknown> | null = null
const _ready = ref(false)
const _error = ref<string | null>(null)

// Hardcoded algorithm IDs — WASM does not expose a registry query endpoint.
// Keep in sync with AlgorithmTable.vue and docs/reference/algorithms.md.
const ALGORITHM_IDS: string[] = [
  'alpha_miner',
  'heuristic_miner',
  'inductive_miner',
  'dfg',
  'petri_net',
  'bpmn',
  'directly_follows',
  'eventually_follows',
  'conformance_token_replay',
  'conformance_alignments',
  'fitness',
  'precision',
  'generalization',
  'simplicity',
  'social_network',
  'dotted_chart',
  'performance_dfg',
  'case_duration',
  'variant_explorer',
  'ocel_discovery',
  'ocel_conformance',
  'ml_classify',
  'ml_cluster',
  'ml_anomaly',
  'ml_forecast',
]

// Ordered list of function-name prefixes to probe when resolving an algorithm.
// Mirrors the naming conventions in the WASM binary.
const WASM_PREFIXES = ['discover_', 'conformance_', 'ml_', 'streaming_', ''] as const

function resolveWasmFn(
  mod: Record<string, unknown>,
  name: string,
): ((...args: unknown[]) => string) | undefined {
  for (const prefix of WASM_PREFIXES) {
    const candidate = mod[`${prefix}${name}`]
    if (typeof candidate === 'function') return candidate as (...args: unknown[]) => string
  }
  return undefined
}

export const useWasm = () => {
  async function init() {
    if (import.meta.server || _wasm) return
    try {
      const mod = await import('wasm4pm')
      // Browser web target: load .wasm binary from static file server.
      // CJS (Node.js/vitest): mod.default is not a function — WASM auto-inits via readFileSync.
      if (typeof (mod as any).default === 'function') {
        await (mod as any).default(new URL('/wasm4pm_bg.wasm', window.location.origin))
      }
      _wasm = mod as unknown as Record<string, unknown>
      _ready.value = true
    }
    catch (e: unknown) {
      _error.value = e instanceof Error ? e.message : String(e)
    }
  }

  function loadXes(xesContent: string): number {
    if (!_wasm) throw new Error('WASM not initialized — call init() first')
    const fn = _wasm['load_eventlog_from_xes'] as ((s: string) => number)
    return fn(xesContent)
  }

  function loadOcel(ocelJson: string): number {
    if (!_wasm) throw new Error('WASM not initialized — call init() first')
    const fn = _wasm['load_ocel_from_json'] as ((s: string) => number)
    return fn(ocelJson)
  }

  /**
   * Run a registered algorithm.
   *
   * @param name        Algorithm ID (e.g. "heuristic_miner", "dfg"). The
   *                    function probes discover_*, conformance_*, ml_*,
   *                    streaming_*, and bare-name prefixes in that order.
   * @param handle      Event-log or OCEL handle returned by loadXes / loadOcel.
   * @param activityKey Column/attribute name to use as the activity key.
   *                    Passed as the second positional argument to the WASM
   *                    function (before any additional params).
   * @param params      Additional named parameters forwarded as positional args
   *                    in insertion order (e.g. { dep_threshold: 0.5 }).
   */
  function runAlgorithm(
    name: string,
    handle: number,
    activityKey: string = 'concept:name',
    params: Record<string, unknown> = {},
  ): unknown {
    if (!_wasm) throw new Error('WASM not initialized — call init() first')
    const fn = resolveWasmFn(_wasm, name)
    if (!fn) {
      const probed = WASM_PREFIXES.map(p => `${p}${name}`).join(', ')
      const err = `Algorithm not found: "${name}". Probed WASM exports: ${probed}`
      if (!import.meta.server) {
        $fetch('/api/otel-event', { method: 'POST', body: {
          service_name: 'playground-web', event: 'wasm.run', status: 'error',
          algorithm: name, error: err, duration_ms: 0,
        } }).catch(() => {})
      }
      throw new Error(err)
    }
    const t0 = performance.now()
    let status = 'ok'
    try {
      const raw = fn(handle, activityKey, ...Object.values(params))
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw
      return result
    }
    catch (e) {
      status = 'error'
      throw e
    }
    finally {
      if (!import.meta.server) {
        $fetch('/api/otel-event', { method: 'POST', body: {
          service_name: 'playground-web', event: 'wasm.run', status,
          algorithm: name, duration_ms: Math.round(performance.now() - t0),
        } }).catch(() => {})
      }
    }
  }

  /**
   * Returns the list of available algorithm IDs.
   * The hardcoded list is the authoritative source; at runtime the list is
   * filtered to only include IDs that resolve to an actual WASM export so
   * the UI never advertises an algorithm that the loaded binary cannot run.
   */
  function getAlgorithmList(): string[] {
    if (!_wasm) return ALGORITHM_IDS.slice()
    return ALGORITHM_IDS.filter(id => resolveWasmFn(_wasm!, id) !== undefined)
  }

  return {
    init,
    loadXes,
    loadOcel,
    runAlgorithm,
    getAlgorithmList,
    ready: readonly(_ready),
    error: readonly(_error),
  }
}
