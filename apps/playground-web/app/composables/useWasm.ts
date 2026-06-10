// Singleton — WASM init is expensive (8MB), happens once per browser session
let _wasm: Record<string, unknown> | null = null
const _ready = ref(false)
const _error = ref<string | null>(null)

export const useWasm = () => {
  async function init() {
    if (import.meta.server || _wasm) return
    try {
      const mod = await import('/wasm4pm.js' as string)
      // Web target: explicitly load the .wasm binary from the static file server
      await (mod as any).default(new URL('/wasm4pm_bg.wasm', window.location.origin))
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
    if (!_wasm) throw new Error('WASM not initialized')
    const fn = _wasm['load_ocel_from_json'] as ((s: string) => number)
    return fn(ocelJson)
  }

  function runAlgorithm(name: string, handle: number, params: Record<string, unknown> = {}): unknown {
    if (!_wasm) throw new Error('WASM not initialized')
    // Try discover_{name} first, then bare name (cognition, ml, etc.)
    const fn = (_wasm[`discover_${name}`] ?? _wasm[name]) as ((...args: unknown[]) => string) | undefined
    if (!fn) throw new Error(`Algorithm not found: ${name}`)
    const result = fn(handle, ...Object.values(params))
    return typeof result === 'string' ? JSON.parse(result) : result
  }

  function getAlgorithmList(): string[] {
    if (!_wasm) return []
    return Object.keys(_wasm)
      .filter(k => k.startsWith('discover_'))
      .map(k => k.replace('discover_', ''))
  }

  return {
    init,
    loadXes,
    loadOcel,
    runAlgorithm,
    getAlgorithmList,
    ready: readonly(_ready),
    error: readonly(_error)
  }
}
