/**
 * wasm-backend.ts
 *
 * WASM backend implementation wrapping wasm4pm algorithms.
 * 35 algorithms with sub-ms latency and quality support up to "quality" tier.
 *
 * Spec reference: Section 3.3 (WasmBackend declaration)
 */
import type {
  MiningBackend,
  BackendCapabilities,
  EventLogIR,
  ModelIR,
  ResultEnvelope,
  BudgetEnvelope,
  ConformanceResult,
  AnalysisTask,
} from '../mining-backend.js';
/**
 * WasmBackend: WASM process mining algorithms.
 *
 * Capabilities:
 * - algorithmFamilies: ["discovery", "conformance", "analysis", "ml", "simulation"]
 * - latencyClass: "sub_ms" (most algorithms <1ms)
 * - deterministic: true (same input → same output)
 * - maxQualityTier: "quality"
 * - supportedAlgorithmIds: 35 algorithms
 * - maxConcurrentInvocations: 8
 */
export declare class WasmBackend implements MiningBackend {
  readonly id = 'wasm';
  /**
   * Get declared capabilities (pure function).
   */
  capabilities(): BackendCapabilities;
  /**
   * Discover a process model from an event log.
   * Routes to wasm4pm kernel with algorithm selection.
   */
  discover(
    log: EventLogIR,
    algorithmId: string,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<ModelIR>>;
  /**
   * Check conformance between event log and process model.
   */
  conformance(
    log: EventLogIR,
    model: ModelIR,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<ConformanceResult>>;
  /**
   * Run a generic analysis task on the event log.
   */
  analyze(
    log: EventLogIR,
    task: AnalysisTask,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<unknown>>;
  /**
   * Health check: verify WASM module is loaded and responsive.
   * Must complete in ≤500ms per spec (Section 3.6, invariant 3).
   */
  healthCheck(): Promise<{
    healthy: boolean;
    latency_ms: number;
    detail?: string;
  }>;
  /**
   * Generate a UUID v4.
   * INTERNAL helper.
   */
  private generateUuid;
  /**
   * Create a ProvenanceChain for auditing.
   * INTERNAL helper.
   */
  private createProvenance;
  /**
   * Create a failed ResultEnvelope.
   * INTERNAL helper.
   */
  private createFailedResult;
}
//# sourceMappingURL=wasm-backend.d.ts.map
