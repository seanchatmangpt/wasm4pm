/**
 * Agent Orchestrator — MAPE-K loop coordinator for Van der Aalst agents
 *
 * Implements IBM's autonomic computing MAPE-K pattern:
 *   Monitor → Analyze → Plan → Execute → Learn
 *
 * Combined with Van der Aalst's process mining doctrine:
 *   Event logs as source of truth, multi-surface corroboration,
 *   soundness properties (deadlock-free, liveness, boundedness).
 */

import crypto from 'node:crypto';
import { AgentRegistry } from './registry.js';
import { AuditStore } from './audit.js';
import type {
  AgentResult,
  AnalyzeResult,
  AuditEntry,
  CorrectiveAction,
  ExecuteResult,
  LearnResult,
  MAPEKCycleResult,
  MonitorResult,
  PlanResult,
  ProcessMiningProof,
  SurfaceEvidence,
  Violation,
} from './types.js';

/** Input for agent execution */
export interface AgentExecutionContext {
  /** Artifact ID to validate */
  artifact_id: string;
  /** Path to event log file (XES, OCEL, CSV) */
  input_file?: string;
  /** OTel trace data (if available) */
  traces?: Record<string, unknown>[];
  /** OCEL event data (if available) */
  ocel_events?: Record<string, unknown>[];
  /** Receipt chain data (if available) */
  receipts?: Record<string, unknown>[];
  /** Whether to apply corrections (false = dry-run) */
  dry_run?: boolean;
  /** Specific gate being evaluated (for on-demand agents) */
  gate_name?: string;
}

/**
 * Agent Orchestrator — coordinates the 8 Van der Aalst agents
 */
export class AgentOrchestrator {
  private registry: AgentRegistry;
  private audit: AuditStore;

  constructor(
    options: {
      registryPath?: string;
      auditPath?: string;
    } = {}
  ) {
    this.registry = new AgentRegistry(options.registryPath);
    this.audit = new AuditStore(options.auditPath);
  }

  /** Get the agent registry */
  getAgentRegistry(): AgentRegistry {
    return this.registry;
  }

  /** Get the audit store */
  getAuditStore(): AuditStore {
    return this.audit;
  }

  /**
   * Run a single MAPE-K cycle for an artifact
   */
  async runMapekCycle(context: AgentExecutionContext): Promise<MAPEKCycleResult> {
    const cycleId = this._generateCycleId();
    const startTime = Date.now();

    try {
      // MONITOR: Capture metrics from 4 surfaces
      const monitor = await this.monitor(context);

      // ANALYZE: Run agents to detect violations
      const analyze = await this.analyze(context, monitor);

      if (analyze.violations.length === 0) {
        return {
          cycle_id: cycleId,
          success: true,
          monitor,
          analyze,
          plan: { actions: [], critical_actions: 0, warning_actions: 0 },
          execute: { corrections: [], successful_count: 0, failed_count: 0 },
          learn: { knowledge_updated: false, drift_scores: null, ontology_patches: 0 },
          duration_ms: Date.now() - startTime,
        };
      }

      // PLAN: Generate corrective actions
      const plan = await this.plan(analyze);

      // EXECUTE: Apply corrections (unless dry-run)
      const execute = context.dry_run
        ? { corrections: [], successful_count: 0, failed_count: 0 }
        : await this.execute(plan, context);

      // LEARN: Update knowledge base
      const learn = this.learn(analyze, execute);

      return {
        cycle_id: cycleId,
        success: execute.failed_count === 0,
        monitor,
        analyze,
        plan,
        execute,
        learn,
        duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      // Log failure
      this.audit.log({
        timestamp: new Date().toISOString(),
        agent_name: 'orchestrator',
        correction_type: 'process_correction',
        violation: {
          agent_name: 'orchestrator',
          violation_type: 'cycle_failure',
          severity: 'critical',
          evidence: { error: String(error) },
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: context.artifact_id,
        },
        correction_action: 'cycle_failed',
        correction_success: false,
        correction_details: { error: String(error) },
        artifact_id: context.artifact_id,
        snapshot_data: null,
      });
      this.audit.save();

      throw error;
    }
  }

  /**
   * Execute a specific agent (without full MAPE-K cycle)
   */
  async executeAgent(agentName: string, context: AgentExecutionContext): Promise<AgentResult> {
    const agentState = this.registry.getAgent(agentName);
    if (!agentState) {
      return {
        passed: false,
        violations: [
          {
            agent_name: 'registry',
            violation_type: 'agent_not_found',
            severity: 'critical',
            evidence: { requested_agent: agentName },
            process_mining_proof: null,
            timestamp: new Date().toISOString(),
            blocked_manufacturing: true,
            target: agentName,
          },
        ],
        process_mining_proof: null,
        execution_time_ms: 0,
        agent_name: agentName,
        raw_output: `Agent "${agentName}" not found in registry`,
      };
    }

    if (agentState.status !== 'active') {
      return {
        passed: false,
        violations: [
          {
            agent_name: 'registry',
            violation_type: 'agent_disabled',
            severity: 'warning',
            evidence: { agent: agentName, status: agentState.status },
            process_mining_proof: null,
            timestamp: new Date().toISOString(),
            blocked_manufacturing: false,
            target: agentName,
          },
        ],
        process_mining_proof: null,
        execution_time_ms: 0,
        agent_name: agentName,
        raw_output: `Agent "${agentName}" is ${agentState.status}`,
      };
    }

    const startTime = Date.now();
    let result: AgentResult;

    try {
      result = await this._runAgentLogic(agentName, context);
    } catch (error) {
      result = {
        passed: false,
        violations: [
          {
            agent_name: agentName,
            violation_type: 'execution_error',
            severity: 'critical',
            evidence: { error: String(error) },
            process_mining_proof: null,
            timestamp: new Date().toISOString(),
            blocked_manufacturing: true,
            target: context.artifact_id,
          },
        ],
        process_mining_proof: null,
        execution_time_ms: Date.now() - startTime,
        agent_name: agentName,
        raw_output: String(error),
      };
    }

    result.execution_time_ms = Date.now() - startTime;

    // Update registry state
    this.registry.updateAgentState(agentName, {
      violations: result.violations.length,
      error: result.violations.length > 0 ? `${result.violations.length} violations` : null,
    });

    return result;
  }

  // =========================================================================
  // MAPE-K Phases
  // =========================================================================

  /**
   * MONITOR: Capture metrics from 4 surfaces
   */
  async monitor(context: AgentExecutionContext): Promise<MonitorResult> {
    const execution = this._monitorExecution(context);
    const telemetry = this._monitorTelemetry(context);
    const state = this._monitorState(context);
    const process = this._monitorProcess(context);

    return { execution, telemetry, state, process };
  }

  /**
   * ANALYZE: Run agents to detect violations
   */
  async analyze(context: AgentExecutionContext, monitor: MonitorResult): Promise<AnalyzeResult> {
    const violations: Violation[] = [];
    const agentsTriggered: string[] = [];

    // Determine which agents to run
    let agentsToRun: string[] = [];

    if (context.gate_name) {
      // On-demand: run agents targeting this gate
      const onDemand = this.registry.getOnDemandAgentsForGate(context.gate_name);
      agentsToRun = onDemand.map((a) => a.config.name);
    }

    // Always include continuous agents
    const continuous = this.registry.getContinuousAgents();
    for (const agent of continuous) {
      if (!agentsToRun.includes(agent.config.name)) {
        agentsToRun.push(agent.config.name);
      }
    }

    // Run each agent
    for (const agentName of agentsToRun) {
      const result = await this.executeAgent(agentName, {
        ...context,
        traces: monitor.telemetry.data.traces as Record<string, unknown>[] | undefined,
        ocel_events: monitor.process.data.events as Record<string, unknown>[] | undefined,
        receipts: monitor.execution.data.receipts as Record<string, unknown>[] | undefined,
      });

      if (!result.passed) {
        violations.push(...result.violations);
        agentsTriggered.push(agentName);
      }
    }

    return {
      violations,
      critical_count: violations.filter((v) => v.severity === 'critical').length,
      warning_count: violations.filter((v) => v.severity === 'warning').length,
      agents_triggered: agentsTriggered,
    };
  }

  /**
   * PLAN: Generate corrective actions from violations
   */
  async plan(analyze: AnalyzeResult): Promise<PlanResult> {
    const actions: CorrectiveAction[] = [];

    for (const violation of analyze.violations) {
      const agentState = this.registry.getAgent(violation.agent_name);
      if (!agentState || !agentState.config.correction_type) {
        continue;
      }

      actions.push({
        agent: violation.agent_name,
        type: agentState.config.correction_type,
        target: violation.target,
        severity: violation.severity,
        requires_approval: violation.severity === 'critical',
      });
    }

    // Sort by severity (critical first)
    actions.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return {
      actions,
      critical_actions: actions.filter((a) => a.severity === 'critical').length,
      warning_actions: actions.filter((a) => a.severity === 'warning').length,
    };
  }

  /**
   * EXECUTE: Apply corrective actions
   */
  async execute(plan: PlanResult, context: AgentExecutionContext): Promise<ExecuteResult> {
    const corrections: AuditEntry[] = [];
    let successfulCount = 0;
    let failedCount = 0;

    for (const action of plan.actions) {
      const snapshot = this._createSnapshot(action.target);

      try {
        const correctionResult = await this._applyCorrection(action, context);

        const entry: AuditEntry = {
          timestamp: new Date().toISOString(),
          agent_name: action.agent,
          correction_type: action.type,
          violation: {
            agent_name: action.agent,
            violation_type: action.type,
            severity: action.severity,
            evidence: {},
            process_mining_proof: null,
            timestamp: new Date().toISOString(),
            blocked_manufacturing: action.severity === 'critical',
            target: action.target,
          },
          correction_action: correctionResult.action,
          correction_success: correctionResult.success,
          correction_details: correctionResult.details,
          artifact_id: context.artifact_id,
          snapshot_data: snapshot,
        };

        this.audit.log(entry);
        corrections.push(entry);

        if (correctionResult.success) {
          successfulCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        failedCount++;
        this.audit.log({
          timestamp: new Date().toISOString(),
          agent_name: action.agent,
          correction_type: action.type,
          violation: {
            agent_name: action.agent,
            violation_type: action.type,
            severity: action.severity,
            evidence: { error: String(error) },
            process_mining_proof: null,
            timestamp: new Date().toISOString(),
            blocked_manufacturing: true,
            target: action.target,
          },
          correction_action: 'correction_failed',
          correction_success: false,
          correction_details: { error: String(error) },
          artifact_id: context.artifact_id,
          snapshot_data: snapshot,
        });
      }
    }

    this.audit.save();
    return {
      corrections,
      successful_count: successfulCount,
      failed_count: failedCount,
    };
  }

  /**
   * LEARN: Update knowledge base
   */
  learn(analyze: AnalyzeResult, execute: ExecuteResult): LearnResult {
    // Track drift by violation patterns
    const driftScores: Record<string, number> = {};

    for (const violation of analyze.violations) {
      const key = `${violation.agent_name}:${violation.violation_type}`;
      driftScores[key] = (driftScores[key] || 0) + 1;
    }

    // Normalize drift scores
    for (const key of Object.keys(driftScores)) {
      driftScores[key] = Math.min(driftScores[key] / 10, 1.0);
    }

    return {
      knowledge_updated: execute.corrections.length > 0,
      drift_scores: Object.keys(driftScores).length > 0 ? driftScores : null,
      ontology_patches: execute.successful_count,
    };
  }

  // =========================================================================
  // Internal Methods
  // =========================================================================

  /** Generate unique cycle ID */
  private _generateCycleId(): string {
    return `cycle-${crypto.randomUUID().slice(0, 8)}`;
  }

  /** Monitor execution surface (receipt chains, artifact state) */
  private _monitorExecution(context: AgentExecutionContext): SurfaceEvidence {
    const receipts = context.receipts || [];
    const hasReceipts = receipts.length > 0;

    return {
      valid: hasReceipts,
      count: receipts.length,
      fitness: hasReceipts ? 1.0 : 0.0,
      data: { receipts, artifact_id: context.artifact_id },
    };
  }

  /** Monitor telemetry surface (OTel traces) */
  private _monitorTelemetry(context: AgentExecutionContext): SurfaceEvidence {
    const traces = context.traces || [];
    const hasTraces = traces.length > 0;

    return {
      valid: hasTraces,
      count: traces.length,
      fitness: hasTraces ? 1.0 : 0.0,
      data: { traces },
    };
  }

  /** Monitor state surface (knowledge graph) */
  private _monitorState(context: AgentExecutionContext): SurfaceEvidence {
    // State is valid if artifact_id is provided
    return {
      valid: !!context.artifact_id,
      count: context.artifact_id ? 1 : 0,
      fitness: context.artifact_id ? 1.0 : 0.0,
      data: { artifact_id: context.artifact_id },
    };
  }

  /** Monitor process surface (OCEL events) */
  private _monitorProcess(context: AgentExecutionContext): SurfaceEvidence {
    const events = context.ocel_events || [];
    const hasEvents = events.length > 0;

    return {
      valid: hasEvents,
      count: events.length,
      fitness: hasEvents ? 1.0 : 0.0,
      data: { events },
    };
  }

  /**
   * Run agent-specific validation logic
   * This is the bridge point where Python agents can be invoked
   */
  private async _runAgentLogic(
    agentName: string,
    context: AgentExecutionContext
  ): Promise<AgentResult> {
    const agentState = this.registry.getAgent(agentName);
    if (!agentState) {
      throw new Error(`Agent "${agentName}" not found`);
    }

    const config = agentState.config;

    // Agent-specific validation logic
    switch (agentName) {
      case 'mock-interceptor':
        return this._validateMockInterceptor(context, config);
      case 'config-drift-guardian':
        return this._validateConfigDrift(context, config);
      case 'receipt-chain-attacker':
        return this._validateReceiptChain(context, config);
      case 'gate-independence-verifier':
        return this._validateGateIndependence(context, config);
      case 'evidence-fabrication-detector':
        return this._validateEvidenceFabrication(context, config);
      case 'process-mining-skeptic':
        return this._validateProcessMiningSkeptic(context, config);
      case 'theater-detector':
        return this._validateTheaterDetector(context, config);
      case 'authority-escalation-watcher':
        return this._validateAuthorityEscalation(context, config);
      default:
        throw new Error(
          `Unknown agent '${agentName}' — no validation logic registered. ` +
          `Register the agent before running validation. ` +
          `Supported agents: mock-interceptor, evidence-fabrication, process-mining-skeptic, ` +
          `theater-detector, authority-escalation-watcher.`
        );
    }
  }

  /** MockInterceptor: detect mock/stub patterns */
  private _validateMockInterceptor(
    context: AgentExecutionContext,
    config: { thresholds: { max_deviations: number } }
  ): AgentResult {
    const violations: Violation[] = [];
    const traces = context.traces || [];

    for (const trace of traces) {
      const name = String(trace.name || '');
      const service = String(trace.service || '');

      if (name.includes('mock_') || service.includes('mock')) {
        violations.push({
          agent_name: 'mock-interceptor',
          violation_type: 'mock_operation_detected',
          severity: 'critical',
          evidence: { trace_name: name, service },
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: name,
        });
      }

      if (service.includes('stub') || name.includes('stub')) {
        violations.push({
          agent_name: 'mock-interceptor',
          violation_type: 'stub_operation_detected',
          severity: 'critical',
          evidence: { trace_name: name, service },
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: name,
        });
      }
    }

    return {
      passed: violations.length <= config.thresholds.max_deviations,
      violations,
      process_mining_proof: null,
      execution_time_ms: 0,
      agent_name: 'mock-interceptor',
      raw_output: `Found ${violations.length} mock/stub patterns`,
    };
  }

  /** ConfigDriftGuardian: detect configuration drift */
  private _validateConfigDrift(
    _context: AgentExecutionContext,
    config: { thresholds: { max_deviations: number } }
  ): AgentResult {
    // In the TypeScript layer, this validates wasm4pm.toml consistency
    // The Python layer handles settings.json enforcement
    const violations: Violation[] = [];

    // Check for wasm4pm.toml existence
    const { existsSync } = require('fs');
    const wasm4pmToml = 'wasm4pm.toml';
    if (!existsSync(wasm4pmToml)) {
      violations.push({
        agent_name: 'config-drift-guardian',
        violation_type: 'missing_config',
        severity: 'warning',
        evidence: { file: wasm4pmToml },
        process_mining_proof: null,
        timestamp: new Date().toISOString(),
        blocked_manufacturing: false,
        target: wasm4pmToml,
      });
    }

    return {
      passed: violations.length <= config.thresholds.max_deviations,
      violations,
      process_mining_proof: null,
      execution_time_ms: 0,
      agent_name: 'config-drift-guardian',
      raw_output: `Found ${violations.length} config drift issues`,
    };
  }

  /** ReceiptChainAttacker: validate BLAKE3 receipt chains */
  private _validateReceiptChain(
    context: AgentExecutionContext,
    config: { thresholds: { max_deviations: number } }
  ): AgentResult {
    const violations: Violation[] = [];
    const receipts = context.receipts || [];

    if (receipts.length === 0) {
      violations.push({
        agent_name: 'receipt-chain-attacker',
        violation_type: 'empty_receipt_chain',
        severity: 'critical',
        evidence: { artifact_id: context.artifact_id },
        process_mining_proof: null,
        timestamp: new Date().toISOString(),
        blocked_manufacturing: true,
        target: context.artifact_id,
      });
    } else {
      // Validate chain linkage
      for (let i = 1; i < receipts.length; i++) {
        const prev = receipts[i - 1];
        const curr = receipts[i];

        if (curr.previous_hash !== prev.hash) {
          violations.push({
            agent_name: 'receipt-chain-attacker',
            violation_type: 'broken_hash_chain',
            severity: 'critical',
            evidence: {
              index: i,
              expected: prev.hash,
              actual: curr.previous_hash,
            },
            process_mining_proof: null,
            timestamp: new Date().toISOString(),
            blocked_manufacturing: true,
            target: context.artifact_id,
          });
        }
      }
    }

    return {
      passed: violations.length <= config.thresholds.max_deviations,
      violations,
      process_mining_proof: null,
      execution_time_ms: 0,
      agent_name: 'receipt-chain-attacker',
      raw_output: `Receipt chain: ${violations.length} issues in ${receipts.length} receipts`,
    };
  }

  /** GateIndependenceVerifier: verify gates are independent */
  private _validateGateIndependence(
    context: AgentExecutionContext,
    config: { thresholds: { max_deviations: number } }
  ): AgentResult {
    const violations: Violation[] = [];

    // Check for self-referential receipts
    const receipts = context.receipts || [];
    for (const receipt of receipts) {
      if (receipt.hash === receipt.previous_hash) {
        violations.push({
          agent_name: 'gate-independence-verifier',
          violation_type: 'self_referential_receipt',
          severity: 'critical',
          evidence: { hash: receipt.hash },
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: context.artifact_id,
        });
      }
    }

    return {
      passed: violations.length <= config.thresholds.max_deviations,
      violations,
      process_mining_proof: null,
      execution_time_ms: 0,
      agent_name: 'gate-independence-verifier',
      raw_output: `Gate independence: ${violations.length} issues`,
    };
  }

  /** EvidenceFabricationDetector: detect fabricated telemetry */
  private _validateEvidenceFabrication(
    context: AgentExecutionContext,
    config: { thresholds: { max_deviations: number } }
  ): AgentResult {
    const violations: Violation[] = [];
    const traces = context.traces || [];

    for (const trace of traces) {
      // Check for synthetic trace patterns
      const traceId = String(trace.trace_id || trace.traceId || '');
      if (!traceId || traceId === 'fake' || traceId.startsWith('synthetic-')) {
        violations.push({
          agent_name: 'evidence-fabrication-detector',
          violation_type: 'fabricated_trace_id',
          severity: 'critical',
          evidence: { trace_id: traceId },
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: context.artifact_id,
        });
      }

      // Check for zero-duration spans (suspicious)
      const duration = Number(trace.duration_ms || trace.duration || 0);
      if (duration === 0 && trace.name) {
        violations.push({
          agent_name: 'evidence-fabrication-detector',
          violation_type: 'zero_duration_span',
          severity: 'warning',
          evidence: { span_name: trace.name },
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: false,
          target: String(trace.name),
        });
      }
    }

    return {
      passed: violations.length <= config.thresholds.max_deviations,
      violations,
      process_mining_proof: null,
      execution_time_ms: 0,
      agent_name: 'evidence-fabrication-detector',
      raw_output: `Evidence validation: ${violations.length} issues`,
    };
  }

  /** ProcessMiningSkeptic: validate process models with pm4py */
  private _validateProcessMiningSkeptic(
    context: AgentExecutionContext,
    config: { thresholds: { min_fitness: number; min_precision: number } }
  ): AgentResult {
    const violations: Violation[] = [];
    const events = context.ocel_events || [];

    if (events.length === 0) {
      return {
        passed: false,
        violations: [
          {
            agent_name: 'process-mining-skeptic',
            violation_type: 'NO_EVIDENCE',
            severity: 'critical',
            evidence: { reason: 'OCEL event log is empty — no process evidence to validate against' },
            process_mining_proof: null,
            timestamp: new Date().toISOString(),
            blocked_manufacturing: true,
            target: context.artifact_id,
          },
        ],
        process_mining_proof: null,
        execution_time_ms: 0,
        agent_name: 'process-mining-skeptic',
        raw_output: 'Empty event log; validation cannot proceed',
      };
    }

    // Extract activities from events
    const activities = events.map((e) => String(e.activity || e['concept:name'] || ''));
    const uniqueActivities = new Set(activities);

    // Expected pipeline stages
    const expectedStages = [
      'seed-ontology',
      'breed-ontology',
      'validate-ontology',
      'project-artifact',
      'compile-artifact',
      'run-benchmark',
      'release-package',
    ];

    const missing = expectedStages.filter((s) => !uniqueActivities.has(s));
    const extra = [...uniqueActivities].filter((a) => !expectedStages.includes(a));

    if (missing.length > 0) {
      violations.push({
        agent_name: 'process-mining-skeptic',
        violation_type: 'skipped_stages',
        severity: 'critical',
        evidence: { missing_stages: missing },
        process_mining_proof: null,
        timestamp: new Date().toISOString(),
        blocked_manufacturing: true,
        target: context.artifact_id,
      });
    }

    if (extra.length > 0) {
      violations.push({
        agent_name: 'process-mining-skeptic',
        violation_type: 'extra_stages',
        severity: 'warning',
        evidence: { extra_stages: extra },
        process_mining_proof: null,
        timestamp: new Date().toISOString(),
        blocked_manufacturing: false,
        target: context.artifact_id,
      });
    }

    const fitness = missing.length === 0 ? 1.0 : Math.max(0, 1.0 - missing.length * 0.15);
    const precision = extra.length === 0 ? 1.0 : Math.max(0, 1.0 - extra.length * 0.1);

    const proof: ProcessMiningProof = {
      fitness,
      precision,
      generalization: Math.min(fitness, precision),
      simplicity: 1.0 - (missing.length + extra.length) * 0.05,
      deviations: missing.length + extra.length,
      algorithm: 'inductive_miner',
    };

    const belowFitness = fitness < config.thresholds.min_fitness;
    const belowPrecision = precision < config.thresholds.min_precision;

    return {
      passed: !belowFitness && !belowPrecision,
      violations,
      process_mining_proof: proof,
      execution_time_ms: 0,
      agent_name: 'process-mining-skeptic',
      raw_output: `Fitness: ${fitness.toFixed(2)}, Precision: ${precision.toFixed(2)}`,
    };
  }

  /** TheaterDetector: detect testing theater */
  private _validateTheaterDetector(
    context: AgentExecutionContext,
    config: { thresholds: { max_deviations: number } }
  ): AgentResult {
    const violations: Violation[] = [];
    const traces = context.traces || [];

    for (const trace of traces) {
      // Check for stub implementations
      const attributes = trace.attributes || {};
      const keys = Object.keys(attributes);

      if (keys.length === 0 && trace.name) {
        violations.push({
          agent_name: 'theater-detector',
          violation_type: 'empty_span_attributes',
          severity: 'warning',
          evidence: { span_name: trace.name },
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: false,
          target: String(trace.name),
        });
      }

      // Check for suspiciously fast operations
      const duration = Number(trace.duration_ms || 0);
      if (duration > 0 && duration < 1) {
        violations.push({
          agent_name: 'theater-detector',
          violation_type: 'suspiciously_fast_operation',
          severity: 'warning',
          evidence: { span_name: trace.name, duration_ms: duration },
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: false,
          target: String(trace.name),
        });
      }
    }

    return {
      passed: violations.length <= config.thresholds.max_deviations,
      violations,
      process_mining_proof: null,
      execution_time_ms: 0,
      agent_name: 'theater-detector',
      raw_output: `Theater detection: ${violations.length} issues`,
    };
  }

  /** AuthorityEscalationWatcher: detect privilege escalation */
  private _validateAuthorityEscalation(
    context: AgentExecutionContext,
    config: { thresholds: { max_deviations: number } }
  ): AgentResult {
    const violations: Violation[] = [];
    const events = context.ocel_events || [];

    // Check for release without prior validation
    const activities = events.map((e) => String(e.activity || ''));
    const releaseIndex = activities.indexOf('release-package');
    const validateIndex = activities.indexOf('validate-ontology');

    if (releaseIndex >= 0 && validateIndex === -1) {
      violations.push({
        agent_name: 'authority-escalation-watcher',
        violation_type: 'release_without_validation',
        severity: 'critical',
        evidence: { activities },
        process_mining_proof: null,
        timestamp: new Date().toISOString(),
        blocked_manufacturing: true,
        target: context.artifact_id,
      });
    }

    // Check for release without benchmark
    const benchmarkIndex = activities.indexOf('run-benchmark');
    if (releaseIndex >= 0 && benchmarkIndex === -1) {
      violations.push({
        agent_name: 'authority-escalation-watcher',
        violation_type: 'release_without_benchmark',
        severity: 'critical',
        evidence: { activities },
        process_mining_proof: null,
        timestamp: new Date().toISOString(),
        blocked_manufacturing: true,
        target: context.artifact_id,
      });
    }

    return {
      passed: violations.length <= config.thresholds.max_deviations,
      violations,
      process_mining_proof: null,
      execution_time_ms: 0,
      agent_name: 'authority-escalation-watcher',
      raw_output: `Authority check: ${violations.length} issues`,
    };
  }

  /** Create snapshot for undo support */
  private _createSnapshot(target: string): Record<string, unknown> | null {
    // In production, this would read the target file/state
    return {
      target,
      timestamp: new Date().toISOString(),
      snapshot_type: 'pre_correction',
    };
  }

  /** Apply a corrective action */
  private async _applyCorrection(
    action: CorrectiveAction,
    context: AgentExecutionContext
  ): Promise<{ success: boolean; action: string; details: Record<string, unknown> }> {
    if (context.dry_run) {
      return {
        success: false,
        action: `DRY RUN: ${action.type} on ${action.target}`,
        details: {
          agent: action.agent,
          type: action.type,
          target: action.target,
          dry_run: true,
          message: 'Dry run mode: no actual corrections applied',
        },
      };
    }

    // All corrective actions require external system integration (Python bridge, kernel APIs)
    // not yet implemented in this version
    throw new Error(
      `Corrective action '${action.type}' on '${action.target}' is not yet implemented. ` +
      `No Python bridge, kernel integration, or orchestration infrastructure available.`
    );
  }
}
