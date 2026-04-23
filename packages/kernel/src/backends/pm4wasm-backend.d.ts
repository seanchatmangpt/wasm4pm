/**
 * pm4wasm-backend.ts
 *
 * Pm4wasmBackend implementation wrapping the wasm4pm/pm4wasm Rust/WASM core.
 * Implements 14 discovery algorithms with sub-ms to low-ms latency.
 *
 * Spec reference: Three-Layer Architecture Section 3.3 (Pm4wasmBackend declaration)
 *
 * ALGORITHM_MAP contains all 14 algorithms with their pm4wasm function names.
 * Budget compatibility ensures algorithm latency tier ≤ budget.latencyBudget.
 * Timeout wrapping enforces BUDGET_TIMEOUTS per tier.
 * Provenance chain captures full execution audit trail.
 */
import type { MiningBackend, BackendCapabilities, EventLogIR, ModelIR, ResultEnvelope, BudgetEnvelope, ConformanceResult, AnalysisTask } from '../mining-backend.js';
/**
 * Pm4wasmBackend: WASM-based process mining from pm4wasm Rust core.
 *
 * Capabilities:
 * - algorithmFamilies: ["discovery"]
 * - outputTypes: ["dfg", "petri_net", "declare"]
 * - latencyClass: "sub_ms" (most algorithms <1ms)
 * - deterministic: true (same input → same output)
 * - maxQualityTier: "balanced"
 * - supportedAlgorithmIds: 14 discovery algorithms
 * - maxConcurrentInvocations: 16 (WASM thread-safe)
 */
export declare class Pm4wasmBackend implements MiningBackend {
    readonly id = "pm4wasm";
    /**
     * Optional WASM module (passed at construction or lazy-loaded).
     * Type is any to avoid hard dependency on @wasm4pm/pm4wasm during testing.
     */
    private wasmModule;
    /**
     * Constructor: Accept optional pre-loaded WASM module.
     * If not provided, WASM is loaded lazily on first use.
     */
    constructor(wasmModule?: any);
    /**
     * Get declared capabilities (pure function).
     */
    capabilities(): BackendCapabilities;
    /**
     * Discover a process model from an event log.
     * Full implementation with WASM dispatch, budget enforcement, and provenance.
     */
    discover(log: EventLogIR, algorithmId: string, budget: BudgetEnvelope): Promise<ResultEnvelope<ModelIR>>;
    /**
     * Check conformance between event log and process model.
     * Dual-path implementation: DFG uses token replay, Petri nets use alignments.
     */
    conformance(log: EventLogIR, model: ModelIR, budget: BudgetEnvelope): Promise<ResultEnvelope<ConformanceResult>>;
    /**
     * Run a generic analysis task on the event log.
     * Currently not supported by Pm4wasmBackend (stub implementation).
     */
    analyze(log: EventLogIR, task: AnalysisTask, budget: BudgetEnvelope): Promise<ResultEnvelope<unknown>>;
    /**
     * Health check: verify WASM module is loaded and responsive.
     * Must complete in ≤500ms per spec.
     */
    healthCheck(): Promise<{
        healthy: boolean;
        latency_ms: number;
        detail?: string;
    }>;
    /**
     * Check if algorithm budget tier is compatible with budget latency budget.
     * Algorithm.budgetTier ≤ budget.latencyBudget (in tier ordering).
     */
    private isBudgetCompatible;
    /**
     * Wrap a promise with a timeout.
     * Uses Promise.race() to enforce budget timeout.
     * Returns the result if it completes within timeout, otherwise rejects.
     */
    private withTimeout;
    /**
     * Convert EventLogIR to WASM-compatible format.
     * Serializes to JSON and calls wasm::eventlog_from_json().
     * Placeholder: actual implementation fills in WASM call details in Phase 2.
     */
    private convertEventLogToWasm;
    /**
     * Convert ModelIR to WASM-compatible format.
     * Serializes to JSON and calls wasm::model_from_json().
     * Placeholder: actual implementation in Phase 2.
     */
    private convertModelToWasm;
    /**
     * Call a WASM algorithm function by name from ALGORITHM_MAP.
     * Dispatches to the appropriate pm4wasm function with log handle.
     * Placeholder: actual implementation in Phase 2.
     */
    private callWasmAlgorithm;
    /**
     * Parse WASM algorithm output to ModelIR.
     * Takes the WASM JSON result and converts to canonical ModelIR format.
     * Placeholder: actual implementation in Phase 2.
     */
    private parseModelOutput;
    /**
     * Token-based replay conformance checking.
     * Calls wasm::token_replay() and returns ConformanceResult.
     * Placeholder: actual pm4wasm function call in Phase 2.
     */
    private tokenReplayConformance;
    /**
     * Alignment-based conformance checking for Petri nets.
     * Calls wasm::compute_optimal_alignments() and returns ConformanceResult.
     * Placeholder: actual pm4wasm function call in Phase 2.
     */
    private alignmentConformance;
    /**
     * Create a ProvenanceChain for auditing.
     * Fills in all 10 required fields with deterministic hashes and metadata.
     */
    private createProvenance;
    /**
     * Generate a UUID v4.
     */
    private generateUuid;
    /**
     * Load WASM module dynamically.
     * Placeholder: actual implementation depends on WASM bundler configuration.
     * In Phase 2, this will import from @seanchatmangpt/pictl or equivalent.
     */
    private loadWasmModule;
}
//# sourceMappingURL=pm4wasm-backend.d.ts.map