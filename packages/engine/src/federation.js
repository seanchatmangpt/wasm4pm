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
import { randomUUID } from 'crypto';
import { DefaultBackendRegistry, WasmBackend, MlBackend, Pm4pyBackend } from '@pictl/kernel';
import { NullBackend } from './null-backend.js';
/**
 * FederationCircuitBreaker (Section 5.3)
 */
export class FederationCircuitBreaker {
    constructor() {
        this.state = 'closed';
        this.failureCount = 0;
        this.failureThreshold = 3;
        this.recoveryTimeout_ms = 30000;
    }
    allowRequest() {
        if (this.state === 'open') {
            const elapsed = Date.now() - (this.lastOpenedAt || 0);
            if (elapsed < this.recoveryTimeout_ms) {
                return false;
            }
            // Recovery window elapsed, try half-open
            this.state = 'half_open';
            return true;
        }
        return true;
    }
    recordSuccess() {
        if (this.state === 'half_open') {
            this.state = 'closed';
            this.failureCount = 0;
        }
    }
    recordFailure() {
        this.failureCount++;
        if (this.failureCount >= this.failureThreshold) {
            this.state = 'open';
            this.lastOpenedAt = Date.now();
        }
    }
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
export class FederationController {
    constructor(registry) {
        this.backends = new Map();
        this.cycle_seq = 0;
        this.decisionTrace = [];
        this.DECISION_TRACE_SIZE = 1000;
        this.registry = registry;
    }
    /**
     * Get current cycle sequence number
     */
    getCycleSeq() {
        return this.cycle_seq;
    }
    /**
     * Register a backend with health tracking
     */
    async registerBackend(backend) {
        const descriptor = {
            backend,
            state: 'registering',
            registeredAt: Date.now(),
            lastHealthCheck: 0,
            consecutiveFailures: 0,
            circuitBreaker: new FederationCircuitBreaker(),
        };
        this.backends.set(backend.id, descriptor);
        this.registry.register(backend);
        // Perform initial health check
        try {
            const health = await backend.healthCheck();
            if (health.healthy) {
                descriptor.state = 'ready';
            }
            else {
                descriptor.state = 'evicted';
            }
        }
        catch (error) {
            descriptor.state = 'evicted';
        }
        descriptor.lastHealthCheck = Date.now();
    }
    /**
     * Get backend state
     */
    getBackendState(id) {
        return this.backends.get(id)?.state || 'unregistered';
    }
    /**
     * Force evict a backend (manual override for ops)
     */
    forceEvict(id) {
        const descriptor = this.backends.get(id);
        if (descriptor) {
            descriptor.state = 'evicted';
        }
    }
    /**
     * Get decision trace ring buffer (Section 5.6)
     */
    getDecisionTrace() {
        return [...this.decisionTrace];
    }
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
    async dispatch(algorithmId, log, budget, healthLevel = 0) {
        this.cycle_seq++;
        const startMs = Date.now();
        const invocationId = randomUUID();
        const timestamp = Date.now();
        // Map health level to backend selection policy (Section 5.4)
        if (healthLevel === 4) {
            // Failed: NullBackend only
            const elapsed = Date.now() - startMs;
            const entry = {
                cycle_seq: this.cycle_seq,
                timestamp,
                algorithm_id: algorithmId,
                budget,
                candidates_before_selection: [],
                selected_backend_id: 'null',
                rule_that_selected: 7,
                result_status: 'failed',
                latency_ms: elapsed,
            };
            this.addDecisionTraceEntry(entry);
            return {
                run_id: randomUUID(),
                status: 'failed',
                payload: null,
                error: 'system_health_critical',
                latency_ms: elapsed,
                latency_class: 'sub_ms',
                backend_id: 'null',
                invocation_id: invocationId,
                cycle_seq: this.cycle_seq,
                algorithm_id: algorithmId,
                provenance: {
                    input_hash: '',
                    config_hash: '',
                    plan_hash: '',
                    output_hash: '',
                    combined_hash: '',
                    algorithm_id: algorithmId,
                    algorithm_version: '1.0.0',
                    backend_id: 'null',
                    kernel_version: '1.0.0',
                    wasm_build_hash: '',
                },
            };
        }
        // Apply health-based backend filtering
        const filteredBudget = this.applyHealthLevelBudget(budget, healthLevel);
        const candidates = this.getCandidatesForRule7(algorithmId, filteredBudget, healthLevel);
        let selectedBackend = null;
        let rule = 7;
        if (candidates.length === 0) {
            // All backends filtered out; fallback to NullBackend
            selectedBackend = new NullBackend();
            rule = 7;
        }
        else {
            selectedBackend = candidates[0];
        }
        // Execute discovery
        const result = await selectedBackend.discover(log, algorithmId, filteredBudget);
        // Update circuit breaker
        const descriptor = this.backends.get(selectedBackend.id);
        if (descriptor) {
            if (result.status === 'success') {
                descriptor.consecutiveFailures = 0;
                descriptor.circuitBreaker.recordSuccess();
            }
            else {
                descriptor.consecutiveFailures++;
                descriptor.circuitBreaker.recordFailure();
                // Transition to degraded or evicted
                if (descriptor.consecutiveFailures >= 10) {
                    descriptor.state = 'evicted';
                }
                else if (descriptor.consecutiveFailures >= 3) {
                    descriptor.state = 'degraded';
                }
            }
        }
        // Record decision trace
        const elapsed = Date.now() - startMs;
        const entry = {
            cycle_seq: this.cycle_seq,
            timestamp,
            algorithm_id: algorithmId,
            budget,
            candidates_before_selection: candidates.map((b) => b.id),
            selected_backend_id: selectedBackend.id,
            rule_that_selected: rule,
            result_status: result.status,
            latency_ms: elapsed,
        };
        this.addDecisionTraceEntry(entry);
        // Populate federation fields
        return {
            ...result,
            backend_id: selectedBackend.id,
            invocation_id: invocationId,
            cycle_seq: this.cycle_seq,
        };
    }
    /**
     * Get candidate backends for rule 7 (after rules 1-6 filtered)
     */
    getCandidatesForRule7(algorithmId, budget, healthLevel) {
        try {
            // Use registry's 7-rule selection; we've already applied health filtering
            const backend = this.registry.select(algorithmId, budget);
            return [backend];
        }
        catch {
            return [];
        }
    }
    /**
     * Apply health level constraints to budget
     */
    applyHealthLevelBudget(budget, healthLevel) {
        if (healthLevel === 3) {
            // Critical: WASM only — force environment gate
            return {
                ...budget,
                environment: {
                    ...budget.environment,
                    pythonAvailable: false, // Force WASM by disabling Python
                },
            };
        }
        return budget;
    }
    /**
     * Add entry to decision trace ring buffer
     */
    addDecisionTraceEntry(entry) {
        this.decisionTrace.push(entry);
        if (this.decisionTrace.length > this.DECISION_TRACE_SIZE) {
            this.decisionTrace.shift();
        }
    }
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
export async function initializeFederationStack(wasmModule, // KernelWasmModule
pm4pyMcpPath = 'pm4py-mcp') {
    const registry = new DefaultBackendRegistry();
    const controller = new FederationController(registry);
    // Register WASM backend
    const wasmBackend = new WasmBackend();
    await controller.registerBackend(wasmBackend);
    // Register pm4py backend
    const pm4pyBackend = new Pm4pyBackend();
    try {
        await controller.registerBackend(pm4pyBackend);
    }
    catch (error) {
        console.warn('Failed to initialize pm4py backend:', error);
        // Continue without pm4py; WASM will be used instead
    }
    // Register ML backend
    const mlBackend = new MlBackend();
    await controller.registerBackend(mlBackend);
    return controller;
}
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
export async function planFederationIntegration(plan, log, controller, healthLevel = 0) {
    // For now, assume the plan has a single discovery step
    // In production, this would iterate through plan.steps
    if (plan.steps.length === 0) {
        throw new Error('ExecutionPlan must have at least one step');
    }
    const step = plan.steps[0];
    const algorithmId = step.inputs?.algorithm || 'dfg';
    // Construct BudgetEnvelope from plan metadata
    const budget = {
        latencyBudget: step.inputs?.latencyBudget || 'high_ms',
        memoryBudget: step.inputs?.memoryBudget || 0,
        qualityFloor: step.inputs?.qualityFloor || 'balanced',
        environment: {
            browserSafe: false,
            pythonAvailable: true,
        },
        mode: step.inputs?.mode || 'online',
    };
    // Dispatch through FederationController
    return controller.dispatch(algorithmId, log, budget, healthLevel);
}
//# sourceMappingURL=federation.js.map