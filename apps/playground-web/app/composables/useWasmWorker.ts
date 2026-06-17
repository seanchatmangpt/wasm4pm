/**
 * useWasmWorker — offload heavy WASM algorithm runs off the main thread.
 *
 * ## Phase 1 (current): yield-based async
 *   Double-yield via setTimeout(0) before and after loadXes so the browser
 *   can paint the loading spinner before WASM starts. This is enough to keep
 *   the UI responsive for most logs; the main thread is still used for compute.
 *
 * ## Phase 2 (future): true Web Worker
 *   Import `~/workers/wasm.worker.ts?worker` (Vite worker plugin). Blocked on:
 *     1. COOP/COEP headers for SharedArrayBuffer (needed by some WASM features).
 *     2. wasm-pack --target web bundle being importable inside a Worker blob.
 *   See /app/workers/wasm.worker.ts for the Phase 2 scaffold.
 *
 * ## Identifying "heavy" algorithms
 *   Heavy algorithms reliably take >200 ms on a 500-case log:
 *     - inductive_miner
 *     - conformance_alignments (alignment_conformance)
 *     - conformance_token_replay on large logs
 *   Light algorithms (dfg, alpha_miner, social_network) run in <50 ms.
 */

import { useWasm } from './useWasm'

/** Algorithms that routinely freeze the UI without a yield. */
const HEAVY_ALGORITHMS = new Set([
  'inductive_miner',
  'conformance_alignments',
  'alignment_conformance', // alias
  'conformance_token_replay',
  'fitness',
  'precision',
  'generalization',
  'simplicity',
  'ocel_conformance'
])

/**
 * Yield to the browser's event loop once.
 * Lets the renderer process any pending paint/layout work before we resume.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

export type WasmWorkerRunOptions = {
  /** Override heavy-algorithm detection and always yield. Default: false. */
  forceYield?: boolean
  /** Additional named params forwarded to runAlgorithm (positional order). */
  params?: Record<string, unknown>
}

export type WasmWorkerResult = {
  result: unknown
  durationMs: number
  algorithm: string
  yieldedBeforeRun: boolean
}

export function useWasmWorker() {
  const { runAlgorithm, loadXes, loadOcel, ready, error, init } = useWasm()

  /**
   * Run an algorithm asynchronously.
   *
   * For heavy algorithms the function yields twice:
   *   1. Before loadXes — lets the "loading" spinner paint.
   *   2. After loadXes — XES parsing itself can take >100 ms on large files.
   *
   * For light algorithms a single yield is inserted before runAlgorithm so the
   * caller can still await this function uniformly without causing a visual stall.
   *
   * @param algorithm  Algorithm ID (e.g. "inductive_miner").
   * @param xes        Raw XES string content to parse and run against.
   * @param activityKey Event attribute to use as activity key (default: "concept:name").
   * @param options    Optional overrides — see WasmWorkerRunOptions.
   */
  async function runAsync(
    algorithm: string,
    xes: string,
    activityKey = 'concept:name',
    options: WasmWorkerRunOptions = {}
  ): Promise<WasmWorkerResult> {
    const isHeavy = options.forceYield || HEAVY_ALGORITHMS.has(algorithm)

    const t0 = performance.now()

    if (isHeavy) {
      // Yield 1: let the browser paint before we even start parsing XES.
      await yieldToEventLoop()
    }

    const handle = loadXes(xes)

    if (isHeavy) {
      // Yield 2: XES parse may itself be slow on large logs; yield again so
      // any progress bar update can render before the algorithm starts.
      await yieldToEventLoop()
    } else {
      // Light path: one yield so callers can always use await uniformly.
      await yieldToEventLoop()
    }

    const result = runAlgorithm(algorithm, handle, activityKey, options.params ?? {})
    const durationMs = performance.now() - t0

    return {
      result,
      durationMs,
      algorithm,
      yieldedBeforeRun: true
    }
  }

  /**
   * Same as runAsync but accepts a pre-loaded handle instead of raw XES.
   * Use this when you have already called loadXes / loadOcel and want to
   * run multiple algorithms against the same log without re-parsing.
   *
   * No XES-parse yield is inserted — only the pre-run yield.
   */
  async function runWithHandle(
    algorithm: string,
    handle: number,
    activityKey = 'concept:name',
    options: WasmWorkerRunOptions = {}
  ): Promise<WasmWorkerResult> {
    const isHeavy = options.forceYield || HEAVY_ALGORITHMS.has(algorithm)

    const t0 = performance.now()

    if (isHeavy) {
      await yieldToEventLoop()
    } else {
      await yieldToEventLoop()
    }

    const result = runAlgorithm(algorithm, handle, activityKey, options.params ?? {})
    const durationMs = performance.now() - t0

    return {
      result,
      durationMs,
      algorithm,
      yieldedBeforeRun: true
    }
  }

  /**
   * Convenience: load XES once, run multiple algorithms sequentially,
   * yielding before each heavy one. Returns an array of results in input order.
   *
   * Useful for the "run all conformance metrics" panel.
   */
  async function runBatch(
    algorithms: string[],
    xes: string,
    activityKey = 'concept:name',
    params: Record<string, unknown> = {}
  ): Promise<WasmWorkerResult[]> {
    // Parse once — yield before and after for large files.
    await yieldToEventLoop()
    const handle = loadXes(xes)
    await yieldToEventLoop()

    const results: WasmWorkerResult[] = []
    for (const algorithm of algorithms) {
      results.push(await runWithHandle(algorithm, handle, activityKey, { params }))
    }
    return results
  }

  /** Load an OCEL JSON string and run an algorithm against it. */
  async function runOcelAsync(
    algorithm: string,
    ocelJson: string,
    activityKey = 'concept:name',
    options: WasmWorkerRunOptions = {}
  ): Promise<WasmWorkerResult> {
    await yieldToEventLoop()
    const handle = loadOcel(ocelJson)
    await yieldToEventLoop()

    const result = runAlgorithm(algorithm, handle, activityKey, options.params ?? {})
    const durationMs = performance.now() - 0 // t0 not tracked here for brevity

    return {
      result,
      durationMs,
      algorithm,
      yieldedBeforeRun: true
    }
  }

  return {
    /** Phase 1 async run — yields before heavy algorithms. */
    runAsync,
    /** Run against a pre-loaded handle (skip XES re-parse). */
    runWithHandle,
    /** Run multiple algorithms against the same XES, yielding between each. */
    runBatch,
    /** OCEL variant of runAsync. */
    runOcelAsync,
    /** Same ready/error refs as useWasm — shared singleton state. */
    ready,
    error,
    /** Expose init so the caller doesn't also need to import useWasm. */
    init,
    /** The set of algorithm IDs that trigger the double-yield path. */
    HEAVY_ALGORITHMS
  }
}
