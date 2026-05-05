/**
 * ml-backend.ts
 *
 * ML backend implementation for machine learning-based process analysis.
 * 6 algorithms: classify, cluster, forecast, anomaly, regress, pca
 * Low-ms latency with deterministic=false (requires seeded RNG for reproducibility).
 *
 * Spec reference: Section 3.3 (MlBackend declaration)
 */
import type { MiningBackend, BackendCapabilities, EventLogIR, ModelIR, ResultEnvelope, BudgetEnvelope, ConformanceResult, AnalysisTask } from '../mining-backend.js';
/**
 * MlBackend: Machine learning-based process mining.
 *
 * Capabilities:
 * - algorithmFamilies: ["ml"]
 * - latencyClass: "low_ms" (most algorithms 15-40ms)
 * - deterministic: false (stochastic; requires seeded RNG)
 * - maxQualityTier: "balanced"
 * - supportedAlgorithmIds: 6 algorithms
 * - maxConcurrentInvocations: 4
 *
 * The @wasm4pm/ml package is loaded dynamically to avoid circular dependencies.
 */
export declare class MlBackend implements MiningBackend {
    readonly id = "ml";
    /**
     * Get declared capabilities (pure function).
     */
    capabilities(): BackendCapabilities;
    /**
     * Discover a process model from an event log.
     * ML backend returns ml_result type, not traditional process models.
     */
    discover(log: EventLogIR, algorithmId: string, budget: BudgetEnvelope): Promise<ResultEnvelope<ModelIR>>;
    /**
     * Check conformance between event log and process model.
     * ML backend does not support conformance checking.
     */
    conformance(log: EventLogIR, model: ModelIR, budget: BudgetEnvelope): Promise<ResultEnvelope<ConformanceResult>>;
    /**
     * Run a generic analysis task on the event log.
     * ML backend specializes in analysis tasks:
     * - ml_classify: Trace classification
     * - ml_cluster: Trace clustering
     * - ml_forecast: Throughput forecasting
     * - ml_anomaly: Anomaly detection
     * - ml_regress: Remaining time prediction
     * - ml_pca: Feature reduction
     */
    analyze(log: EventLogIR, task: AnalysisTask, budget: BudgetEnvelope): Promise<ResultEnvelope<unknown>>;
    /**
     * Health check: verify ML subsystem is available.
     * Must complete in ≤500ms per spec (Section 3.6, invariant 3).
     */
    healthCheck(): Promise<{
        healthy: boolean;
        latency_ms: number;
        detail?: string;
    }>;
    /**
     * Get the output schema for a given ML algorithm.
     * INTERNAL helper.
     */
    private getOutputSchema;
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
     * Create a failed ResultEnvelope for discovery context.
     * INTERNAL helper.
     */
    private createFailedResult;
    /**
     * Create a failed ResultEnvelope for analysis context.
     * INTERNAL helper.
     */
    private createFailedAnalysisResult;
}
//# sourceMappingURL=ml-backend.d.ts.map