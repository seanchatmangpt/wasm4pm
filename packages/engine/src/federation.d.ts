/**
 * federation-integration.ts
 *
 * Three-layer integration: Planner → FederationController → Backend Execution
 *
 * Spec reference: Sections 3, 4, and 5
 *
 * Exports:
 * - FederationController — Main control-plane singleton
 * - DecisionTraceEntry — Audit trail for backend selections
 * - NullBackend — Fail-open sentinel backend
 */
import type { ExecutionPlan, BudgetEnvelope } from '@pictl/contracts';
import type { MiningBackend, EventLogIR, ResultEnvelope } from '@pictl/kernel';
import { DefaultBackendRegistry } from '@pictl/kernel';
/**
 * Backend state machine (Section 5.2)
 */
export type BackendState = 'unregistered' | 'registering' | 'ready' | 'degraded' | 'evicted';
/**
 * Circuit breaker state (Section 5.3)
 */
export type CircuitBreakerState = 'closed' | 'half_open' | 'open';
/**
 * FederationCircuitBreaker (Section 5.3)
 */
export declare class FederationCircuitBreaker {
    state: CircuitBreakerState;
    failureCount: number;
    readonly failureThreshold = 3;
    readonly recoveryTimeout_ms = 30000;
    lastOpenedAt?: number;
    allowRequest(): boolean;
    recordSuccess(): void;
    recordFailure(): void;
}
/**
 * Decision trace entry for audit trail (Section 5.6)
 */
export interface DecisionTraceEntry {
    readonly cycle_seq: number;
    readonly timestamp: number;
    readonly algorithm_id: string;
    readonly budget: BudgetEnvelope;
    readonly candidates_before_selection: ReadonlyArray<string>;
    readonly selected_backend_id: string;
    readonly rule_that_selected: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    readonly rl_scores?: Readonly<Record<string, number>>;
    readonly result_status: 'success' | 'partial' | 'failed';
    readonly latency_ms: number;
}
/**
 * FederationController: Main control-plane singleton (Section 5.1)
 *
 * Owns:
 * - Backend registry and health states
 * - Circuit breakers per backend
 * - Decision tracing (ring buffer of 1000 entries)
 * - Async job queue for batch/research modes
 * - Model freshness tracking
 * - RL health-level-to-backend mapping
 */
export declare class FederationController {
    private registry;
    private backends;
    private cycle_seq;
    private decisionTrace;
    private readonly DECISION_TRACE_SIZE;
    constructor(registry: DefaultBackendRegistry);
    /**
     * Get current cycle sequence number
     */
    getCycleSeq(): number;
    /**
     * Register a backend with health tracking
     */
    registerBackend(backend: MiningBackend): Promise<void>;
    /**
     * Get backend state
     */
    getBackendState(id: string): BackendState;
    /**
     * Force evict a backend (manual override for ops)
     */
    forceEvict(id: string): void;
    /**
     * Get decision trace ring buffer (Section 5.6)
     */
    getDecisionTrace(): ReadonlyArray<DecisionTraceEntry>;
    /**
     * Main dispatch: Select backend and execute discovery.
     *
     * Applies health-state-to-backend mapping (Section 5.4):
     * - health_level 0 (Normal): All backends available
     * - health_level 1 (Warning): pm4py weight reduced by 50%
     * - health_level 2 (Degraded): Exclude backends with failures; WASM preferred
     * - health_level 3 (Critical): WASM only
     * - health_level 4 (Failed): NullBackend only (status: "failed")
     *
     * Applies 7-rule selection algorithm (Section 3.5).
     * Returns ResultEnvelope with backend_id, invocation_id, cycle_seq populated.
     */
    dispatch(algorithmId: string, log: EventLogIR, budget: BudgetEnvelope, healthLevel?: number): Promise<ResultEnvelope>;
    /**
     * Get candidate backends for rule 7 (after rules 1-6 filtered)
     */
    private getCandidatesForRule7;
    /**
     * Apply health level constraints to budget
     */
    private applyHealthLevelBudget;
    /**
     * Add entry to decision trace ring buffer
     */
    private addDecisionTraceEntry;
}
/**
 * Initialize the federation stack: Create registry and register all backends.
 *
 * Spec reference: Section 5.1, 3.3
 *
 * @param wasmModule - WASM module instance
 * @param pm4pyMcpPath - Path to pm4py-mcp executable (defaults to 'pm4py-mcp')
 * @returns FederationController ready for use
 *
 * @example
 * ```ts
 * const controller = await initializeFederationStack(wasmModule);
 * const result = await controller.dispatch(
 *   'dfg',
 *   log,
 *   { latencyBudget: 'sub_ms', ... },
 *   healthLevel: 0
 * );
 * ```
 */
export declare function initializeFederationStack(wasmModule: any, // KernelWasmModule
pm4pyMcpPath?: string): Promise<FederationController>;
/**
 * Plan-to-federation dispatch: Wire a planner ExecutionPlan to FederationController.
 *
 * Takes an ExecutionPlan (from planner) and dispatches it through the federation controller.
 *
 * Spec reference: Sections 3, 4, 5
 *
 * @param plan - ExecutionPlan from planner
 * @param log - EventLogIR (parsed input log)
 * @param controller - FederationController instance
 * @param healthLevel - RL health_level (0-4) for backend selection policy
 * @returns Promise<ResultEnvelope> with federation fields populated
 */
export declare function planFederationIntegration(plan: ExecutionPlan, log: EventLogIR, controller: FederationController, healthLevel?: number): Promise<ResultEnvelope>;
//# sourceMappingURL=federation.d.ts.map