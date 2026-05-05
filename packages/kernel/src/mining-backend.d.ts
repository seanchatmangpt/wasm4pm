/**
 * mining-backend.ts
 *
 * Core backend abstraction for the three-layer architecture.
 * Defines the contract that all mining backends must implement:
 * - WASM backend (35 algorithms, sub-ms latency)
 * - ML backend (6 algorithms, low-ms latency)
 * - pm4py backend (4 algorithms, seconds latency)
 *
 * Spec reference: Section 3.1 and 3.2
 */
export type LatencyClass = 'sub_ms' | 'low_ms' | 'high_ms' | 'seconds' | 'minutes';
export type AlgorithmFamily = 'discovery' | 'conformance' | 'analysis' | 'ml' | 'simulation';
export type ModelType = 'dfg' | 'petri_net' | 'process_tree' | 'declare' | 'powl' | 'ml_result';
export type QualityTier = 'fast' | 'balanced' | 'quality' | 'research';
/**
 * Canonical event log intermediate representation (Section 2.1)
 */
export interface EventLogIR {
  readonly format_version: '1.0';
  readonly source_format: 'xes' | 'ocel' | 'json' | 'csv';
  readonly traces: ReadonlyArray<{
    case_id: string;
    events: ReadonlyArray<{
      activity: string;
      timestamp: string;
      resource?: string;
      attributes: Readonly<Record<string, unknown>>;
    }>;
  }>;
  readonly metadata: {
    trace_count: number;
    event_count: number;
    activity_count: number;
    start_time: string;
    end_time: string;
    source_hash: string;
  };
}
/**
 * Model capabilities (Section 2.2)
 */
export interface ModelCapabilities {
  readonly online_safe: boolean;
  readonly offline_only: boolean;
  readonly replay_ready: boolean;
  readonly alignment_ready: boolean;
  readonly streaming_compatible: boolean;
  readonly exportable_to_pnml: boolean;
  readonly exportable_to_bpmn: boolean;
}
/**
 * Canonical model intermediate representation (Section 2.2)
 */
export interface ModelIR {
  readonly format_version: '1.0';
  readonly model_type: ModelType;
  readonly algorithm_id: string;
  readonly capabilities: ModelCapabilities;
  readonly nodes: ReadonlyArray<{
    id: string;
    label: string;
    type: string;
  }>;
  readonly edges: ReadonlyArray<{
    from: string;
    to: string;
    weight?: number;
  }>;
  readonly quality?: {
    fitness?: number;
    precision?: number;
    generalization?: number;
    simplicity?: number;
  };
}
/**
 * Conformance result from conformance() method
 */
export interface ConformanceResult {
  readonly fitness: number;
  readonly precision: number;
  readonly generalization: number;
  readonly simplicity: number;
}
/**
 * Analysis task specification
 */
export interface AnalysisTask {
  readonly task_type: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
}
/**
 * Budget envelope for execution constraints (Section 4.1)
 */
export interface BudgetEnvelope {
  readonly latencyBudget: LatencyClass;
  readonly memoryBudget: number;
  readonly qualityFloor: QualityTier;
  readonly environment: {
    readonly browserSafe: boolean;
    readonly pythonAvailable: boolean;
  };
  readonly mode: 'online' | 'near-online' | 'batch' | 'research';
}
/**
 * Provenance chain for result audit trail (Section 2.4)
 */
export interface ProvenanceChain {
  readonly input_hash: string;
  readonly config_hash: string;
  readonly plan_hash: string;
  readonly output_hash: string;
  readonly combined_hash: string;
  readonly algorithm_id: string;
  readonly algorithm_version: string;
  readonly backend_id: string;
  readonly kernel_version: string;
  readonly wasm_build_hash: string;
}
/**
 * Result envelope wrapper for all algorithm outputs (Section 2.3)
 */
export interface ResultEnvelope<T = unknown> {
  readonly run_id: string;
  readonly status: 'success' | 'partial' | 'failed';
  readonly payload: T;
  readonly error?: string;
  readonly latency_ms: number;
  readonly latency_class: LatencyClass;
  readonly backend_id: string;
  readonly invocation_id: string;
  readonly cycle_seq: number;
  readonly algorithm_id: string;
  readonly model_ir?: ModelIR;
  readonly provenance: ProvenanceChain;
  readonly stale?: boolean;
  readonly stale_age_ms?: number;
}
/**
 * BackendCapabilities: Declared properties of a backend (Section 3.2)
 *
 * All fields are readonly to enforce immutability.
 * capabilities() is pure — same return value on every call.
 */
export interface BackendCapabilities {
  readonly algorithmFamilies: ReadonlyArray<AlgorithmFamily>;
  readonly outputTypes: ReadonlyArray<ModelType>;
  readonly environment: {
    readonly browserSafe: boolean;
    readonly edgeSafe: boolean;
    readonly requiresPython: boolean;
    readonly requiresNetwork: boolean;
  };
  readonly latencyClass: LatencyClass;
  readonly deterministic: boolean;
  readonly maxQualityTier: QualityTier;
  readonly supportedAlgorithmIds: ReadonlyArray<string>;
  readonly maxConcurrentInvocations: number;
}
/**
 * MiningBackend interface: Implemented by WASM, ML, and pm4py backends (Section 3.1)
 *
 * Structural invariants:
 * 1. All five interface methods must be present
 * 2. capabilities() is pure (same return every call)
 * 3. healthCheck() completes in ≤500ms
 * 4. discover() returns ResultEnvelope with model_ir when status == "success"
 * 5. All backends respect budget.latencyBudget — exceed it → status: "partial" + error: "budget_exceeded"
 */
export interface MiningBackend {
  readonly id: string;
  /**
   * Get declared capabilities of this backend.
   * Pure function — same return value on every invocation.
   */
  capabilities(): BackendCapabilities;
  /**
   * Discover a process model from an event log.
   * Returns ResultEnvelope with model_ir when status == "success".
   * Must respect budget.latencyBudget.
   */
  discover(
    log: EventLogIR,
    algorithmId: string,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<ModelIR>>;
  /**
   * Check conformance between event log and process model.
   * Returns conformance metrics (fitness, precision, generalization, simplicity).
   */
  conformance(
    log: EventLogIR,
    model: ModelIR,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<ConformanceResult>>;
  /**
   * Run a generic analysis task on the event log.
   * Task type and parameters are specified in AnalysisTask.
   */
  analyze(
    log: EventLogIR,
    task: AnalysisTask,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<unknown>>;
  /**
   * Health check to verify backend is available and responsive.
   * Must complete in ≤500ms. Used by FederationController for state transitions.
   */
  healthCheck(): Promise<{
    healthy: boolean;
    latency_ms: number;
    detail?: string;
  }>;
}
//# sourceMappingURL=mining-backend.d.ts.map
