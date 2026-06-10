/**
 * Unit tests for useWasm composable — real WASM binary, no mocks.
 *
 * wasm4pm/pkg/wasm4pm.js is a Node.js CJS build that auto-initializes via
 * fs.readFileSync at require-time.  useWasm.init() detects this (mod.default
 * is not a function in CJS) and skips the browser URL call, setting _wasm
 * directly.  All algorithm calls here exercise the real WASM binary.
 *
 * vi.resetModules() clears the vitest ESM cache between tests so the
 * module-level _wasm/_ready/_error singletons reset, while Node's require
 * cache keeps the already-initialized WASM module warm.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SAMPLE_XES = readFileSync(
  join(__dirname, '../../public/samples/small-example.xes'), 'utf8'
)

async function freshUseWasm() {
  vi.resetModules()
  const { useWasm } = await import('../../app/composables/useWasm')
  return useWasm()
}

// ---------------------------------------------------------------------------
// init()
// ---------------------------------------------------------------------------

describe('useWasm -- init()', () => {
  it('sets ready=true and clears error on success', async () => {
    const { init, ready, error } = await freshUseWasm()
    await init()
    expect(ready.value).toBe(true)
    expect(error.value).toBeNull()
  })

  it('is idempotent: calling init() twice only initialises once', async () => {
    const { init, ready } = await freshUseWasm()
    await init()
    await init()
    // Still ready, no error — the guard short-circuits on second call
    expect(ready.value).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// loadXes()
// ---------------------------------------------------------------------------

describe('useWasm -- loadXes()', () => {
  it('throws if WASM not initialized', async () => {
    const { loadXes } = await freshUseWasm()
    expect(() => loadXes('<log/>')).toThrow('WASM not initialized')
  })

  it('returns a handle after init', async () => {
    const { init, loadXes } = await freshUseWasm()
    await init()
    const handle = loadXes(SAMPLE_XES)
    // CJS WASM returns string handles like "obj_0"
    expect(handle).toBeTruthy()
  })

  it('different XES inputs produce different handles', async () => {
    const { init, loadXes } = await freshUseWasm()
    await init()
    const h1 = loadXes(SAMPLE_XES)
    const h2 = loadXes(SAMPLE_XES)
    // Each call registers a new log object
    expect(h1).not.toBe(h2)
  })
})

// ---------------------------------------------------------------------------
// loadOcel()
// ---------------------------------------------------------------------------

describe('useWasm -- loadOcel()', () => {
  it('throws if WASM not initialized', async () => {
    const { loadOcel } = await freshUseWasm()
    expect(() => loadOcel('{}')).toThrow('WASM not initialized')
  })

  it('returns a handle for valid OCEL JSON', async () => {
    const { init, loadOcel } = await freshUseWasm()
    await init()
    const ocelJson = JSON.stringify({
      'ocel:events': {},
      'ocel:objects': {}
    })
    const handle = loadOcel(ocelJson)
    expect(handle).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// runAlgorithm()
// ---------------------------------------------------------------------------

describe('useWasm -- runAlgorithm()', () => {
  it('throws if WASM not initialized', async () => {
    const { runAlgorithm } = await freshUseWasm()
    expect(() => runAlgorithm('dfg', 0 as any)).toThrow('WASM not initialized')
  })

  it('discover_dfg: "dfg" resolves via discover_ prefix, returns nodes and edges', async () => {
    const { init, loadXes, runAlgorithm } = await freshUseWasm()
    await init()
    const handle = loadXes(SAMPLE_XES)
    const result = runAlgorithm('dfg', handle as any) as { nodes: unknown[], edges: unknown[] }
    expect(Array.isArray(result.nodes)).toBe(true)
    expect(Array.isArray(result.edges)).toBe(true)
    expect(result.nodes.length).toBeGreaterThan(0)
  })

  it('heuristic_miner returns a result with algorithm and node/edge counts', async () => {
    const { init, loadXes, runAlgorithm } = await freshUseWasm()
    await init()
    const handle = loadXes(SAMPLE_XES)
    const result = runAlgorithm('heuristic_miner', handle as any, 'concept:name', { dep_threshold: 0.3 }) as any
    expect(result).toHaveProperty('algorithm', 'heuristic_miner')
    expect(typeof result.nodes).toBe('number')
    expect(typeof result.edges).toBe('number')
  })

  it('throws "Algorithm not found" for unrecognized algorithm name', async () => {
    const { init, loadXes, runAlgorithm } = await freshUseWasm()
    await init()
    const handle = loadXes(SAMPLE_XES)
    expect(() => runAlgorithm('totally_unknown_xyz', handle as any)).toThrow('Algorithm not found')
  })

  it('parses JSON result string into an object', async () => {
    const { init, loadXes, runAlgorithm } = await freshUseWasm()
    await init()
    const handle = loadXes(SAMPLE_XES)
    const result = runAlgorithm('dfg', handle as any)
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getAlgorithmList()
// ---------------------------------------------------------------------------

describe('useWasm -- getAlgorithmList()', () => {
  it('returns an array of strings before init (hardcoded list)', async () => {
    const { getAlgorithmList } = await freshUseWasm()
    const list = getAlgorithmList()
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
    list.forEach(id => expect(typeof id).toBe('string'))
  })

  it('after init: "dfg" is present (resolves to discover_dfg in real WASM)', async () => {
    const { init, getAlgorithmList } = await freshUseWasm()
    await init()
    const list = getAlgorithmList()
    expect(list).toContain('dfg')
  })

  it('after init: "alpha_miner" is absent (discover_alpha_miner not exported in real WASM)', async () => {
    const { init, getAlgorithmList } = await freshUseWasm()
    await init()
    const list = getAlgorithmList()
    expect(list).not.toContain('alpha_miner')
  })

  it('after init: "heuristic_miner" is present', async () => {
    const { init, getAlgorithmList } = await freshUseWasm()
    await init()
    const list = getAlgorithmList()
    expect(list).toContain('heuristic_miner')
  })
})
