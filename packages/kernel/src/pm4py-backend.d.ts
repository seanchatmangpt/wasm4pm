/**
 * pm4py-backend.ts
 *
 * Pm4pyBackend implementation for the three-layer architecture.
 *
 * Spec reference: Section 3.3
 *
 * - 4 algorithms: alpha_miner, heuristics_miner_pm4py, inductive_miner_pm4py, alignments_pm4py
 * - latencyClass: "seconds"
 * - deterministic: true
 * - maxQualityTier: "research"
 * - requiresPython: true
 * - maxConcurrentInvocations: 2
 * - Invokes pm4py-mcp process via child_process
 * - Converts EventLogIR → pm4py format, pm4py result → ModelIR
 * - Implements healthCheck() via process health endpoint
 */
import type { MiningBackend, BackendCapabilities, EventLogIR, ModelIR, ConformanceResult, BudgetEnvelope, AnalysisTask, ResultEnvelope } from './mining-backend.js';
/**
 * Pm4pyBackend: Wraps pm4py-mcp server process.
 *
 * Manages lifecycle:
 * - Spawns pm4py-mcp process on initialization
 * - Communicates via JSON-RPC over stdio
 * - Monitors health periodically
 * - Gracefully terminates on shutdown
 */
export declare class Pm4pyBackend implements MiningBackend {
    private pm4pyMcpPath;
    readonly id = "pm4py";
    private process?;
    private initialized;
    private lastHealthCheckMs;
    private messageId;
    private pendingRequests;
    private currentConcurrency;
    private maxConcurrency;
    constructor(pm4pyMcpPath?: string);
    /**
     * Initialize pm4py-mcp process
     */
    init(): Promise<void>;
    /**
     * Shutdown pm4py-mcp process
     */
    shutdown(): Promise<void>;
    /**
     * Get backend capabilities (Section 3.2)
     * Pure function — same return value every invocation.
     */
    capabilities(): BackendCapabilities;
    /**
     * Discover a process model using pm4py.
     * Converts EventLogIR → pm4py format, executes, converts result → ModelIR.
     *
     * Implements budget enforcement:
     * - Timeout after budget.latencyBudget equivalent
     * - Return status: "partial" + error: "budget_exceeded" if timeout
     */
    discover(log: EventLogIR, algorithmId: string, budget: BudgetEnvelope): Promise<ResultEnvelope<ModelIR>>;
    /**
     * Check conformance using pm4py alignments.
     */
    conformance(log: EventLogIR, model: ModelIR, budget: BudgetEnvelope): Promise<ResultEnvelope<ConformanceResult>>;
    /**
     * Generic analysis task (placeholder)
     */
    analyze(log: EventLogIR, task: AnalysisTask, budget: BudgetEnvelope): Promise<ResultEnvelope<unknown>>;
    /**
     * Health check: verify pm4py-mcp process is responsive.
     * Must complete in ≤500ms per spec (Section 3.6, invariant 3).
     */
    healthCheck(): Promise<{
        healthy: boolean;
        latency_ms: number;
        detail?: string;
    }>;
    /**
     * Call pm4py-mcp via JSON-RPC
     */
    private callMcp;
    /**
     * Convert EventLogIR to pm4py event log format
     */
    private logIrToPm4pyFormat;
    /**
     * Convert pm4py result to ModelIR
     */
    private pm4pyToModelIr;
    /**
     * Helper: Derive latency class from milliseconds (Section 2.3)
     */
    private latencyClassForMs;
    /**
     * Helper: Convert latency budget tier to milliseconds
     */
    private budgetToMs;
    /**
     * Helper: Hash event log for provenance
     */
    private hashLog;
    /**
     * Helper: Hash model for provenance
     */
    private hashModel;
    /**
     * Helper: Hash conformance result for provenance
     */
    private hashConformance;
}
//# sourceMappingURL=pm4py-backend.d.ts.map