/**
 * Unit tests for useWasmWorker composable.
 *
 * useWasm is mocked to return controlled fakes so these tests run without
 * a real WASM binary. The composable logic — yield scheduling, result shape,
 * batch dispatch, error propagation — is exercised in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Controlled fakes returned by the useWasm mock
// ---------------------------------------------------------------------------

const mockLoadXes = vi.fn()
const mockLoadOcel = vi.fn()
const mockRunAlgorithm = vi.fn()
const mockInit = vi.fn()
const mockReady = { value: true }
const mockError = { value: null }

vi.mock('~/composables/useWasm', () => ({
  useWasm: () => ({
    loadXes: mockLoadXes,
    loadOcel: mockLoadOcel,
    runAlgorithm: mockRunAlgorithm,
    init: mockInit,
    ready: mockReady,
    error: mockError,
  }),
}))

// Import AFTER mock registration so the module picks up the mock.
import { useWasmWorker } from '~/composables/useWasmWorker'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_XES = '<log><trace></trace></log>'
const FAKE_OCEL = '{"ocel:events":{}}'
const FAKE_HANDLE = 42
const FAKE_RESULT = { nodes: 3, edges: 2 }

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadXes.mockReturnValue(FAKE_HANDLE)
  mockLoadOcel.mockReturnValue(FAKE_HANDLE)
  mockRunAlgorithm.mockReturnValue(FAKE_RESULT)
})

// ---------------------------------------------------------------------------
// 1. runAsync() — delegates to loadXes + runAlgorithm
// ---------------------------------------------------------------------------

describe('runAsync()', () => {
  it('calls loadXes with the provided XES string', async () => {
    const { runAsync } = useWasmWorker()
    await runAsync('alpha_miner', FAKE_XES)

    expect(mockLoadXes).toHaveBeenCalledOnce()
    expect(mockLoadXes).toHaveBeenCalledWith(FAKE_XES)
  })

  it('calls runAlgorithm with the handle returned by loadXes', async () => {
    const { runAsync } = useWasmWorker()
    await runAsync('alpha_miner', FAKE_XES, 'concept:name')

    expect(mockRunAlgorithm).toHaveBeenCalledOnce()
    const [alg, handle] = mockRunAlgorithm.mock.calls[0]
    expect(alg).toBe('alpha_miner')
    expect(handle).toBe(FAKE_HANDLE)
  })

  // 2. Returns correct WasmWorkerResult shape
  it('returns a WasmWorkerResult with result, durationMs, algorithm, yieldedBeforeRun', async () => {
    const { runAsync } = useWasmWorker()
    const r = await runAsync('alpha_miner', FAKE_XES)

    expect(r).toMatchObject({
      result: FAKE_RESULT,
      algorithm: 'alpha_miner',
      yieldedBeforeRun: true,
    })
    expect(typeof r.durationMs).toBe('number')
  })

  // 3. durationMs is a positive number
  it('durationMs is a positive number', async () => {
    const { runAsync } = useWasmWorker()
    const r = await runAsync('alpha_miner', FAKE_XES)

    expect(r.durationMs).toBeGreaterThanOrEqual(0)
  })

  // 4. Heavy algorithms set yieldedBeforeRun = true
  it.each([
    'inductive_miner',
    'conformance_alignments',
    'alignment_conformance',
    'conformance_token_replay',
    'fitness',
    'precision',
    'generalization',
    'simplicity',
    'ocel_conformance',
  ])('heavy algorithm "%s" sets yieldedBeforeRun = true', async (alg) => {
    const { runAsync } = useWasmWorker()
    const r = await runAsync(alg, FAKE_XES)
    expect(r.yieldedBeforeRun).toBe(true)
  })

  // 5. Non-heavy algorithms — yieldedBeforeRun is still true (single-yield path)
  it('non-heavy algorithm still returns yieldedBeforeRun = true (single-yield path)', async () => {
    const { runAsync } = useWasmWorker()
    const r = await runAsync('alpha_miner', FAKE_XES)
    expect(r.yieldedBeforeRun).toBe(true)
  })

  // 10. Error propagation
  it('propagates WASM errors thrown by runAlgorithm', async () => {
    const wasmError = new Error('WASM panicked')
    mockRunAlgorithm.mockImplementation(() => { throw wasmError })

    const { runAsync } = useWasmWorker()
    await expect(runAsync('alpha_miner', FAKE_XES)).rejects.toThrow('WASM panicked')
  })
})

// ---------------------------------------------------------------------------
// 6. runWithHandle() — uses provided handle, does NOT call loadXes
// ---------------------------------------------------------------------------

describe('runWithHandle()', () => {
  it('calls runAlgorithm with the provided handle', async () => {
    const { runWithHandle } = useWasmWorker()
    const r = await runWithHandle('alpha_miner', 99)

    expect(mockLoadXes).not.toHaveBeenCalled()
    expect(mockRunAlgorithm).toHaveBeenCalledOnce()
    const [alg, handle] = mockRunAlgorithm.mock.calls[0]
    expect(alg).toBe('alpha_miner')
    expect(handle).toBe(99)
  })

  it('returns a WasmWorkerResult with the correct algorithm field', async () => {
    const { runWithHandle } = useWasmWorker()
    const r = await runWithHandle('dfg', 7)

    expect(r.algorithm).toBe('dfg')
    expect(r.result).toEqual(FAKE_RESULT)
  })
})

// ---------------------------------------------------------------------------
// 7–8. runBatch() — multiple algorithms, one parse
// ---------------------------------------------------------------------------

describe('runBatch()', () => {
  it('runs each algorithm in the input array', async () => {
    const algorithms = ['alpha_miner', 'dfg', 'inductive_miner']
    const { runBatch } = useWasmWorker()
    const results = await runBatch(algorithms, FAKE_XES)

    expect(mockRunAlgorithm).toHaveBeenCalledTimes(algorithms.length)
    const calledAlgs = mockRunAlgorithm.mock.calls.map(c => c[0])
    expect(calledAlgs).toEqual(algorithms)
  })

  it('returns an array whose length matches the input algorithms array', async () => {
    const algorithms = ['alpha_miner', 'dfg', 'inductive_miner', 'fitness']
    const { runBatch } = useWasmWorker()
    const results = await runBatch(algorithms, FAKE_XES)

    expect(results).toHaveLength(algorithms.length)
  })

  it('parses XES only once regardless of algorithm count', async () => {
    const { runBatch } = useWasmWorker()
    await runBatch(['alpha_miner', 'dfg', 'inductive_miner'], FAKE_XES)

    expect(mockLoadXes).toHaveBeenCalledOnce()
  })

  it('each result carries the correct algorithm label', async () => {
    const algorithms = ['alpha_miner', 'dfg']
    const { runBatch } = useWasmWorker()
    const results = await runBatch(algorithms, FAKE_XES)

    expect(results[0].algorithm).toBe('alpha_miner')
    expect(results[1].algorithm).toBe('dfg')
  })
})

// ---------------------------------------------------------------------------
// 9. runOcelAsync() — delegates to loadOcel + runAlgorithm
// ---------------------------------------------------------------------------

describe('runOcelAsync()', () => {
  it('calls loadOcel with the provided OCEL JSON string', async () => {
    const { runOcelAsync } = useWasmWorker()
    await runOcelAsync('ocel_conformance', FAKE_OCEL)

    expect(mockLoadOcel).toHaveBeenCalledOnce()
    expect(mockLoadOcel).toHaveBeenCalledWith(FAKE_OCEL)
  })

  it('does NOT call loadXes', async () => {
    const { runOcelAsync } = useWasmWorker()
    await runOcelAsync('ocel_conformance', FAKE_OCEL)

    expect(mockLoadXes).not.toHaveBeenCalled()
  })

  it('calls runAlgorithm with the handle returned by loadOcel', async () => {
    const { runOcelAsync } = useWasmWorker()
    await runOcelAsync('ocel_conformance', FAKE_OCEL, 'ocel:activity')

    expect(mockRunAlgorithm).toHaveBeenCalledOnce()
    const [alg, handle, actKey] = mockRunAlgorithm.mock.calls[0]
    expect(alg).toBe('ocel_conformance')
    expect(handle).toBe(FAKE_HANDLE)
    expect(actKey).toBe('ocel:activity')
  })

  it('returns a WasmWorkerResult with the algorithm field set', async () => {
    const { runOcelAsync } = useWasmWorker()
    const r = await runOcelAsync('ocel_conformance', FAKE_OCEL)

    expect(r.algorithm).toBe('ocel_conformance')
    expect(r.result).toEqual(FAKE_RESULT)
  })
})

// ---------------------------------------------------------------------------
// HEAVY_ALGORITHMS set completeness
// ---------------------------------------------------------------------------

describe('HEAVY_ALGORITHMS', () => {
  it('is exported and is a Set', () => {
    const { HEAVY_ALGORITHMS } = useWasmWorker()
    expect(HEAVY_ALGORITHMS).toBeInstanceOf(Set)
  })

  it('contains all expected heavy algorithm IDs', () => {
    const { HEAVY_ALGORITHMS } = useWasmWorker()
    const expected = [
      'inductive_miner',
      'conformance_alignments',
      'alignment_conformance',
      'conformance_token_replay',
      'fitness',
      'precision',
      'generalization',
      'simplicity',
      'ocel_conformance',
    ]
    for (const id of expected) {
      expect(HEAVY_ALGORITHMS.has(id)).toBe(true)
    }
  })

  it('does not include light algorithms', () => {
    const { HEAVY_ALGORITHMS } = useWasmWorker()
    expect(HEAVY_ALGORITHMS.has('alpha_miner')).toBe(false)
    expect(HEAVY_ALGORITHMS.has('dfg')).toBe(false)
    expect(HEAVY_ALGORITHMS.has('social_network')).toBe(false)
  })
})
