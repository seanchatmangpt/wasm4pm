/**
 * pm4py-backend.ts
 *
 * PM4PY backend stub for Python-based process mining.
 * This is a placeholder. Agent 5 will implement the full backend.
 *
 * Spec reference: Section 3.3 (Pm4pyBackend declaration)
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
 * Pm4pyBackend: PM4PY Python process mining (placeholder).
 *
 * Capabilities:
 * - algorithmFamilies: ["discovery", "conformance"]
 * - latencyClass: "seconds" (Python overhead)
 * - deterministic: true
 * - maxQualityTier: "research"
 * - supportedAlgorithmIds: 4 algorithms (placeholder)
 * - maxConcurrentInvocations: 2
 *
 * STUB: Full implementation by Agent 5.
 */
export declare class Pm4pyBackend implements MiningBackend {
  readonly id = 'pm4py';
  /**
   * Get declared capabilities (pure function).
   */
  capabilities(): BackendCapabilities;
  /**
   * Discover a process model from an event log.
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
   * Health check: verify PM4PY is available (requires Python).
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
}
//# sourceMappingURL=pm4py-backend.d.ts.map
