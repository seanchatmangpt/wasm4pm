/**
 * Unit tests for useWasmWorker — real WASM binary, no vi.mock.
 *
 * useWasmWorker is a scheduling wrapper around useWasm. The JTBD is:
 *   "yield to the browser event loop before heavy algorithms so the loading
 *    spinner can paint before WASM freezes the thread."
 *
 * Tests verify the result contract:
 *   { result, durationMs: number, algorithm, yieldedBeforeRun: true }
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SAMPLE_XES = readFileSync(
  join(__dirname, '../../public/samples/small-example.xes'), 'utf8'
)

async function freshWorker() {
  vi.resetModules()
  const { useWasmWorker } = await import('../../app/composables/useWasmWorker')
  const worker = useWasmWorker()
  // CJS WASM auto-inits — init() is a no-op when _wasm is already set.
  await worker.init()
  return worker
}

// ---------------------------------------------------------------------------
// HEAVY_ALGORITHMS set
// ---------------------------------------------------------------------------

describe('useWasmWorker -- HEAVY_ALGORITHMS', () => {
  it('contains inductive_miner', async () => {
    const { HEAVY_ALGORITHMS } = await freshWorker()
    expect(HEAVY_ALGORITHMS.has('inductive_miner')).toBe(true)
  })

  it('contains conformance_alignments', async () => {
    const { HEAVY_ALGORITHMS } = await freshWorker()
    expect(HEAVY_ALGORITHMS.has('conformance_alignments')).toBe(true)
  })

  it('does NOT contain dfg (light algorithm)', async () => {
    const { HEAVY_ALGORITHMS } = await freshWorker()
    expect(HEAVY_ALGORITHMS.has('dfg')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// runAsync()
// ---------------------------------------------------------------------------

describe('useWasmWorker -- runAsync()', () => {
  it('returns result contract for dfg (light path)', async () => {
    const { runAsync } = await freshWorker()
    const res = await runAsync('dfg', SAMPLE_XES)
    expect(res.algorithm).toBe('dfg')
    expect(res.yieldedBeforeRun).toBe(true)
    expect(typeof res.durationMs).toBe('number')
    expect(res.durationMs).toBeGreaterThanOrEqual(0)
    // dfg result has nodes + edges
    const r = res.result as { nodes: unknown[]; edges: unknown[] }
    expect(Array.isArray(r.nodes)).toBe(true)
    expect(r.nodes.length).toBeGreaterThan(0)
  })

  it('returns result contract for heuristic_miner (light path)', async () => {
    const { runAsync } = await freshWorker()
    const res = await runAsync('heuristic_miner', SAMPLE_XES)
    expect(res.algorithm).toBe('heuristic_miner')
    expect(res.yieldedBeforeRun).toBe(true)
    const r = res.result as { algorithm: string }
    expect(r.algorithm).toBe('heuristic_miner')
  })

  it('forceYield=true still returns correct result', async () => {
    const { runAsync } = await freshWorker()
    const res = await runAsync('dfg', SAMPLE_XES, 'concept:name', { forceYield: true })
    expect(res.yieldedBeforeRun).toBe(true)
    const r = res.result as { nodes: unknown[] }
    expect(r.nodes.length).toBeGreaterThan(0)
  })

  it('throws "Algorithm not found" for unknown algorithm', async () => {
    const { runAsync } = await freshWorker()
    await expect(runAsync('totally_unknown_xyz', SAMPLE_XES)).rejects.toThrow('Algorithm not found')
  })

  it('forwards extra params to runAlgorithm', async () => {
    const { runAsync } = await freshWorker()
    const res = await runAsync('heuristic_miner', SAMPLE_XES, 'concept:name', { params: { dep_threshold: 0.3 } })
    expect(res.algorithm).toBe('heuristic_miner')
    const r = res.result as { algorithm: string }
    expect(r.algorithm).toBe('heuristic_miner')
  })
})

// ---------------------------------------------------------------------------
// runWithHandle()
// ---------------------------------------------------------------------------

describe('useWasmWorker -- runWithHandle()', () => {
  it('runs dfg against a pre-loaded handle', async () => {
    const worker = await freshWorker()
    // Access loadXes via useWasm — worker exposes init but not loadXes directly.
    // Load via the worker's underlying useWasm (shared singleton after resetModules).
    const { useWasm } = await import('../../app/composables/useWasm')
    const { loadXes } = useWasm()
    const handle = loadXes(SAMPLE_XES) as unknown as number

    const res = await worker.runWithHandle('dfg', handle)
    expect(res.algorithm).toBe('dfg')
    expect(res.yieldedBeforeRun).toBe(true)
    const r = res.result as { nodes: unknown[] }
    expect(r.nodes.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// runBatch()
// ---------------------------------------------------------------------------

describe('useWasmWorker -- runBatch()', () => {
  it('runs multiple algorithms and returns results in input order', async () => {
    const { runBatch } = await freshWorker()
    const algorithms = ['dfg', 'heuristic_miner']
    const results = await runBatch(algorithms, SAMPLE_XES)

    expect(results).toHaveLength(2)
    expect(results[0]!.algorithm).toBe('dfg')
    expect(results[1]!.algorithm).toBe('heuristic_miner')
    results.forEach(r => {
      expect(r.yieldedBeforeRun).toBe(true)
      expect(typeof r.durationMs).toBe('number')
      expect(r.result).not.toBeNull()
    })
  })

  it('runBatch with a single algorithm returns one-element array', async () => {
    const { runBatch } = await freshWorker()
    const results = await runBatch(['dfg'], SAMPLE_XES)
    expect(results).toHaveLength(1)
    expect(results[0]!.algorithm).toBe('dfg')
  })
})
