/**
 * log-fingerprint.ts
 *
 * Layer 2 — Log Structure Fingerprint.
 *
 * Derives an 8-field structural fingerprint from a loaded event-log handle.
 * All three underlying queries run in parallel; rejected calls produce sentinel
 * values rather than throwing.
 *
 * WASM access strategy:
 *   - traceCount / activityCount / totalEvents / meanTraceLength:
 *       wasm.get_trace_count / get_activities / get_event_count /
 *       get_trace_length_statistics called directly on the WASM module.
 *   - variantCount / eventEntropy / variantTopCoverage:
 *       kernel.runRaw('analyze_variant_complexity', ...)
 *   - dfgDensity:
 *       kernel.runRaw('dfg', ...) — returns { nodes, edges, ... } directly.
 */

import type { Kernel, KernelWasmModule } from './api.js';

export interface LogFingerprint {
  /** Number of traces in the log. */
  traceCount: number;
  /** Number of distinct activities. */
  activityCount: number;
  /** Number of distinct trace variants. */
  variantCount: number;
  /** Total number of events across all traces. */
  totalEvents: number;
  /** Mean trace length (average events per trace). */
  meanTraceLength: number;
  /** DFG density: edges / (nodes * (nodes - 1)); 0 if nodes <= 1. */
  dfgDensity: number;
  /** Normalised variant entropy in [0, 1]. */
  eventEntropy: number;
  /** Fraction of traces covered by the top-10 variants. */
  variantTopCoverage: number;
}

/**
 * Compute a structural fingerprint for a loaded event-log handle.
 *
 * @param kernel      - Initialised Kernel instance.
 * @param wasm        - The underlying WASM module (same object passed to Kernel constructor).
 * @param handle      - Event-log handle returned by kernel.loadEventLog().
 * @param activityKey - XES attribute name for activity labels (default: 'concept:name').
 */
export async function computeFingerprint(
  kernel: Kernel,
  wasm: KernelWasmModule,
  handle: string,
  activityKey = 'concept:name',
): Promise<LogFingerprint> {
  // ── Run all three queries in parallel ──────────────────────────────────────
  const [logStatsResult, variantResult, dfgResult] = await Promise.allSettled([
    Promise.resolve().then(() => {
      const traceCount = (wasm as any).get_trace_count(handle) as number;
      const activities = (wasm as any).get_activities(handle, activityKey) as unknown[];
      const activityCount = Array.isArray(activities) ? activities.length : 0;
      const totalEvents = (wasm as any).get_event_count(handle) as number;
      const traceLenStats = (wasm as any).get_trace_length_statistics(handle);
      const avgLen =
        traceLenStats instanceof Map
          ? Number(traceLenStats.get('average') ?? 0)
          : Number(traceLenStats?.average ?? 0);
      return { traceCount, activityCount, totalEvents, meanTraceLength: avgLen };
    }),
    (kernel as any).runRaw('analyze_variant_complexity', handle, activityKey, {}),
    (kernel as any).runRaw('dfg', handle, activityKey, {}),
  ]);

  // ── Extract log stats ──────────────────────────────────────────────────────
  let traceCount = 0;
  let activityCount = 0;
  let totalEvents = 0;
  let meanTraceLength = 0;

  if (logStatsResult.status === 'fulfilled') {
    ({ traceCount, activityCount, totalEvents, meanTraceLength } = logStatsResult.value);
  }

  // ── Extract variant complexity ─────────────────────────────────────────────
  let variantCount = 0;
  let eventEntropy = 0.5;        // sentinel
  let variantTopCoverage = 0;    // sentinel

  if (variantResult.status === 'fulfilled') {
    const data = variantResult.value?.metadata?.result ?? variantResult.value;
    if (data) {
      const vc = data.total_variants ?? data.totalVariants;
      if (vc !== undefined) variantCount = Number(vc);

      const ent = data.normalized_entropy ?? data.normalizedEntropy;
      if (ent !== undefined && Number.isFinite(Number(ent))) eventEntropy = Number(ent);

      const cov = data.top_10_coverage ?? data.top10Coverage;
      if (cov !== undefined && Number.isFinite(Number(cov))) variantTopCoverage = Number(cov);
    }
  }

  // ── Extract DFG density ────────────────────────────────────────────────────
  let dfgDensity = 0; // sentinel

  if (dfgResult.status === 'fulfilled') {
    const data = dfgResult.value;
    const nodes: unknown[] = Array.isArray(data?.nodes) ? data.nodes : [];
    const edges: unknown[] = Array.isArray(data?.edges) ? data.edges : [];
    const n = nodes.length;
    dfgDensity = n <= 1 ? 0 : edges.length / (n * (n - 1));
  }

  return {
    traceCount,
    activityCount,
    variantCount,
    totalEvents,
    meanTraceLength,
    dfgDensity,
    eventEntropy,
    variantTopCoverage,
  };
}
