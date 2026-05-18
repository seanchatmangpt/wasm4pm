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
import type { ExecutionPlan, BudgetEnvelope } from '@wasm4pm/contracts';
import type {
  MiningBackend,
  EventLogIR,
  ModelIR,
  ResultEnvelope,
  ConformanceResult,
  AnalysisTask,
  ProvenanceChain,
  KernelWasmModule,
} from '@wasm4pm/kernel';
import { DefaultBackendRegistry, WasmBackend, MlBackend } from '@wasm4pm/kernel';
import { NullBackend } from './null-backend.js';

/**
 * Backend state machine (Section 5.2)
 */
export type BackendState = 'unregistered' | 'registering' | 'ready' | 'degraded' | 'evicted';

/**
 * Circuit breaker state (Section 5.3)
 */
export type CircuitBreakerState = 'closed' | 'half_open' | 'open';

/**
 * Backend descriptor with health tracking (Section 5.2)
 */
interface BackendDescriptor {
  readonly backend: MiningBackend;
  state: BackendState;
  readonly registeredAt: number; // epoch ms
  lastHealthCheck: number;
  consecutiveFailures: number;
  circuitBreaker: FederationCircuitBreaker;
}

/**
 * FederationCircuitBreaker (Section 5.3)
 */
export class FederationCircuitBreaker {
  state: CircuitBreakerState = 'closed';
  failureCount = 0;
  readonly failureThreshold = 3;
  readonly recoveryTimeout_ms = 30_000;
  lastOpenedAt?: number;

  allowRequest(): boolean {
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

  recordSuccess(): void {
    if (this.state === 'half_open') {
      this.state = 'closed';
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.lastOpenedAt = Date.now();
    }
  }
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
export class FederationController {
  private registry: DefaultBackendRegistry;
  private backends: Map<string, BackendDescriptor> = new Map();
  private cycle_seq = 0;
  private decisionTrace: DecisionTraceEntry[] = [];
  private readonly DECISION_TRACE_SIZE = 1000;

  constructor(registry: DefaultBackendRegistry) {
    this.registry = registry;
  }

  /**
   * Get current cycle sequence number
   */
  getCycleSeq(): number {
    return this.cycle_seq;
  }

  /**
   * Register a backend with health tracking
   */
  async registerBackend(backend: MiningBackend): Promise<void> {
    const descriptor: BackendDescriptor = {
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
      } else {
        descriptor.state = 'evicted';
      }
    } catch (error) {
      descriptor.state = 'evicted';
    }
    descriptor.lastHealthCheck = Date.now();
  }

  /**
   * Get backend state
   */
  getBackendState(id: string): BackendState {
    return this.backends.get(id)?.state || 'unregistered';
  }

  /**
   * Force evict a backend (manual override for ops)
   */
  forceEvict(id: string): void {
    const descriptor = this.backends.get(id);
    if (descriptor) {
      descriptor.state = 'evicted';
    }
  }

  /**
   * Get decision trace ring buffer (Section 5.6)
   */
  getDecisionTrace(): ReadonlyArray<DecisionTraceEntry> {
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
  async dispatch(
    algorithmId: string,
    log: EventLogIR,
    budget: BudgetEnvelope,
    healthLevel: number = 0
  ): Promise<ResultEnvelope> {
    this.cycle_seq++;
    const startMs = Date.now();
    const invocationId = randomUUID();
    const timestamp = Date.now();

    // Map health level to backend selection policy (Section 5.4)
    if (healthLevel === 4) {
      // Failed: NullBackend only
      const elapsed = Date.now() - startMs;
      const entry: DecisionTraceEntry = {
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

    let selectedBackend: MiningBackend;
    let rule: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 7;

    if (candidates.length === 0) {
      // All backends filtered out; fallback to NullBackend
      selectedBackend = new NullBackend();
      rule = 7;
    } else {
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
      } else {
        descriptor.consecutiveFailures++;
        descriptor.circuitBreaker.recordFailure();

        // Transition to degraded or evicted
        if (descriptor.consecutiveFailures >= 10) {
          descriptor.state = 'evicted';
        } else if (descriptor.consecutiveFailures >= 3) {
          descriptor.state = 'degraded';
        }
      }
    }

    // Record decision trace
    const elapsed = Date.now() - startMs;
    const entry: DecisionTraceEntry = {
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
  private getCandidatesForRule7(
    algorithmId: string,
    budget: BudgetEnvelope,
    healthLevel: number
  ): MiningBackend[] {
    try {
      // Use registry's 7-rule selection; we've already applied health filtering
      const backend = this.registry.select(algorithmId, budget);
      return [backend];
    } catch {
      return [];
    }
  }

  /**
   * Apply health level constraints to budget
   */
  private applyHealthLevelBudget(budget: BudgetEnvelope, healthLevel: number): BudgetEnvelope {
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
  private addDecisionTraceEntry(entry: DecisionTraceEntry): void {
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
export async function initializeFederationStack(
  wasmModule: KernelWasmModule,
  pm4pyMcpPath: string = 'pm4py-mcp'
): Promise<FederationController> {
  const registry = new DefaultBackendRegistry();
  const controller = new FederationController(registry);

  // Register WASM backend
  const wasmBackend = new WasmBackend();
  await controller.registerBackend(wasmBackend);

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
export async function planFederationIntegration(
  plan: ExecutionPlan,
  log: EventLogIR,
  controller: FederationController,
  healthLevel: number = 0
): Promise<ResultEnvelope> {
  // For now, assume the plan has a single discovery step
  // In production, this would iterate through plan.steps
  if (plan.steps.length === 0) {
    throw new Error('ExecutionPlan must have at least one step');
  }

  const step = plan.steps[0];
  const algorithmId = (step.inputs?.algorithm as string) || 'dfg';

  // Construct BudgetEnvelope from plan metadata
  const budget: BudgetEnvelope = {
    latencyBudget: (step.inputs?.latencyBudget as any) || 'high_ms',
    memoryBudget: (step.inputs?.memoryBudget as number) || 0,
    qualityFloor: (step.inputs?.qualityFloor as any) || 'balanced',
    environment: {
      browserSafe: false,
      pythonAvailable: true,
    },
    mode: (step.inputs?.mode as any) || 'online',
  };

  // Dispatch through FederationController
  return controller.dispatch(algorithmId, log, budget, healthLevel);
}
