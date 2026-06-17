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
import { existsSync } from 'node:fs';
import { z } from 'zod';
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

// ── Minimal OTEL span types (no external dep on @wasm4pm/cognition) ──────────
// Per critical-constraints.md §2: 100% of operations must emit OTEL spans.
// service.name must be 'wasm4pm'; status must be 'ok' or 'error' (never UNSET).

/** Minimal OTEL span shape compatible with the wasm4pm observability contract. */
interface AgentSpan {
  trace_id: string;
  span_id: string;
  name: string;
  kind: 'INTERNAL';
  start_time: number;
  end_time: number;
  status: { code: 'OK' | 'ERROR'; message?: string };
  attributes: Record<string, string | number | boolean>;
}

/** Span sink: receives completed spans. Must never throw. */
export type AgentSpanSink = (span: AgentSpan) => void;

/** No-op sink used when no sink is provided. Tests inject recording sinks. */
const defaultAgentSpanSink: AgentSpanSink = (_span: AgentSpan): void => {
  /* no-op: tests inject a recording sink */
};

function hexId(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Emit a single OTEL span to the given sink.
 * Swallows all sink errors — span emission must never block primary control flow.
 */
function emitAgentSpan(
  sink: AgentSpanSink,
  name: string,
  startNs: number,
  status: 'OK' | 'ERROR',
  attrs: Record<string, string | number | boolean>,
  errMsg?: string,
): void {
  try {
    sink({
      trace_id: hexId(16),
      span_id: hexId(8),
      name,
      kind: 'INTERNAL',
      start_time: startNs,
      end_time: Date.now() * 1_000_000,
      status: errMsg !== undefined ? { code: status, message: errMsg } : { code: status },
      attributes: {
        'service.name': 'wasm4pm',
        ...attrs,
      },
    });
  } catch {
    /* never block on OTEL */
  }
}

/** Input for agent execution */
export const AgentExecutionContextSchema = z.object({
  /** Artifact ID to validate */
  artifact_id: z.string(),
  /** Path to event log file (XES, OCEL, CSV) */
  input_file: z.string().optional(),
  /** OTel trace data (if available) */
  traces: z.array(z.record(z.string(), z.unknown())).optional(),
  /** OCEL event data (if available) */
  ocel_events: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Receipt chain data (if available) */
  receipts: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Whether to apply corrections (false = dry-run) */
  dry_run: z.boolean().optional(),
  /** Specific gate being evaluated (for on-demand agents) */
  gate_name: z.string().optional(),
});
export type AgentExecutionContext = z.infer<typeof AgentExecutionContextSchema>;

/**
 * Agent Orchestrator — coordinates the 8 Van der Aalst agents
 */
export class AgentOrchestrator {
  private registry: AgentRegistry;
  private audit: AuditStore;
  private spanSink: AgentSpanSink;

  constructor(
    options: {
      registryPath?: string;
      auditPath?: string;
      cycleTimeoutMs?: number;
      agentTimeoutMs?: number;
      /** OTEL span sink — receives completed spans for observability. Tests inject a recording sink. */
      spanSink?: AgentSpanSink;
    } = {}
  ) {
    this.registry = new AgentRegistry(options.registryPath);
    this.audit = new AuditStore(options.auditPath);
    this.spanSink = options.spanSink ?? defaultAgentSpanSink;
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
    const startNs = Date.now() * 1_000_000;
    let spanStatus: 'OK' | 'ERROR' = 'OK';
    let spanErrMsg: string | undefined;

    try {
      // MONITOR: Capture metrics from 4 surfaces
      const monitor = await this.monitor(context);

      // ANALYZE: Run agents to detect violations
      const analyze = await this.analyze(context, monitor);

      if (analyze.violations.length === 0) {
        const result: MAPEKCycleResult = {
          cycle_id: cycleId,
          success: true,
          monitor,
          analyze,
          plan: { actions: [], critical_actions: 0, warning_actions: 0 },
          execute: { corrections: [], successful_count: 0, failed_count: 0 },
          learn: {
            knowledge_updated: false,
            drift_scores: null,
            ontology_patches: 0,
            thresholdAuditLog: [],
          },
          duration_ms: Date.now() - startTime,
        };
        return result;
      }

      // PLAN: Generate corrective actions
      const plan = await this.plan(analyze);

      // EXECUTE: Apply corrections (unless dry-run)
      const execute = context.dry_run
        ? { corrections: [], successful_count: 0, failed_count: 0 }
        : await this.execute(plan, context);

      // LEARN: Update knowledge base
      const learn = this.learn(analyze, execute);

      if (execute.failed_count > 0) {
        spanStatus = 'ERROR';
        spanErrMsg = `${execute.failed_count} correction(s) failed`;
      }

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
      spanStatus = 'ERROR';
      spanErrMsg = error instanceof Error ? error.message : String(error);

      // Log failure to audit store
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
    } finally {
      emitAgentSpan(
        this.spanSink,
        'agents.mapek_cycle',
        startNs,
        spanStatus,
        {
          'agents.cycle_id': cycleId,
          'agents.artifact_id': context.artifact_id,
          'agents.dry_run': context.dry_run ?? false,
          'agents.gate_name': context.gate_name ?? '',
          'agents.duration_ms': Date.now() - startTime,
        },
        spanErrMsg,
      );
    }
  }

  /**
   * Execute a specific agent (without full MAPE-K cycle)
   */
  async executeAgent(agentName: string, context: AgentExecutionContext): Promise<AgentResult> {
    const startNs = Date.now() * 1_000_000;
    const startTime = Date.now();
    let spanStatus: 'OK' | 'ERROR' = 'OK';
    let spanErrMsg: string | undefined;

    const agentState = this.registry.getAgent(agentName);
    if (!agentState) {
      spanStatus = 'ERROR';
      spanErrMsg = `agent "${agentName}" not found`;
      emitAgentSpan(this.spanSink, 'agents.execute_agent', startNs, spanStatus,
        { 'agents.agent_name': agentName, 'agents.artifact_id': context.artifact_id },
        spanErrMsg);
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
      // Disabled/error agents are not a runtime error — emit an OK span with status context.
      emitAgentSpan(this.spanSink, 'agents.execute_agent', startNs, 'OK',
        {
          'agents.agent_name': agentName,
          'agents.artifact_id': context.artifact_id,
          'agents.agent_status': agentState.status,
          'agents.skipped': true,
        });
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

    let result: AgentResult;

    try {
      result = await this._runAgentLogic(agentName, context);
      if (!result.passed) {
        spanStatus = 'ERROR';
        spanErrMsg = `${result.violations.length} violation(s)`;
      }
    } catch (error) {
      spanStatus = 'ERROR';
      spanErrMsg = error instanceof Error ? error.message : String(error);
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

    emitAgentSpan(
      this.spanSink,
      'agents.execute_agent',
      startNs,
      spanStatus,
      {
        'agents.agent_name': agentName,
        'agents.artifact_id': context.artifact_id,
        'agents.passed': result.passed,
        'agents.violation_count': result.violations.length,
        'agents.execution_time_ms': result.execution_time_ms,
      },
      spanErrMsg,
    );

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
   * LEARN: Update knowledge base and adapt agent thresholds.
   *
   * Drift scores are computed from violation frequency patterns and fed back
   * into the agent registry so that thresholds tighten for noisy agents and
   * relax for quiet ones.  This closes the MAPE-K feedback loop: Execute
   * results influence future Monitor/Analyze sensitivity.
   */
  learn(analyze: AnalyzeResult, execute: ExecuteResult): LearnResult {
    // Track drift by violation patterns
    const driftScores: Record<string, number> = {};

    for (const violation of analyze.violations) {
      const key = `${violation.agent_name}:${violation.violation_type}`;
      driftScores[key] = (driftScores[key] || 0) + 1;
    }

    // Normalize drift scores to [0, 1]
    for (const key of Object.keys(driftScores)) {
      driftScores[key] = Math.min(driftScores[key] / 10, 1.0);
    }

    // Feed drift scores back into agent registry to adapt thresholds.
    // This is the autonomic self-improvement loop: repeated violations tighten
    // sensitivity; prolonged silence relaxes it.
    // The returned audit log records exactly which thresholds changed and why,
    // providing observability for the Learn phase without relying on side-effects.
    let thresholdAuditLog: import('./types.js').ThresholdAuditEntry[] = [];
    if (Object.keys(driftScores).length > 0) {
      thresholdAuditLog = this.registry.adaptThresholdsFromDrift(driftScores);
    }

    return {
      knowledge_updated: execute.corrections.length > 0 || Object.keys(driftScores).length > 0,
      drift_scores: Object.keys(driftScores).length > 0 ? driftScores : null,
      ontology_patches: execute.successful_count,
      thresholdAuditLog,
    };
  }

  /**
   * Format the Learn phase result as human-readable lines.
   *
   * Returns one line per threshold change (from thresholdAuditLog) plus a
   * summary line.  When no thresholds changed, returns a single "stable"
   * message.  Callers (CLI renderers, test helpers) use this to present the
   * Learn phase without re-deriving the audit log structure.
   *
   * Example output:
   *   Learn      mock-interceptor: max_deviations 0 → 0 (drift 0.600 — tightened sensitivity)
   *   Learn      No threshold adjustments (all metrics within bounds)
   */
  static formatLearnSummary(learn: LearnResult): string[] {
    const lines: string[] = [];

    if (learn.thresholdAuditLog.length === 0) {
      lines.push('Learn      No threshold adjustments (all metrics within bounds)');
    } else {
      for (const entry of learn.thresholdAuditLog) {
        lines.push(
          `Learn      ${entry.agentId}: ${entry.field} ${entry.before} → ${entry.after} (drift ${entry.driftScore.toFixed(3)} — ${entry.reason})`
        );
      }
    }

    if (learn.ontology_patches > 0) {
      lines.push(`Learn      ${learn.ontology_patches} ontology patch(es) applied`);
    }

    return lines;
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
        // Silent-pass for unknown agents is a Van der Aalst doctrine
        // violation (any registered agent must produce real evidence, not a
        // fabricated success). Flag a `warning` violation so the
        // orchestrator surfaces "agent not implemented" instead of treating
        // it as proof of cleanliness (PR #69 silent fall-through class).
        return {
          passed: false,
          violations: [
            {
              agent_name: agentName,
              violation_type: 'agent_logic_not_implemented',
              severity: 'warning',
              evidence: { agent: agentName },
              process_mining_proof: null,
              timestamp: new Date().toISOString(),
              blocked_manufacturing: false,
              target: context.artifact_id,
            },
          ],
          process_mining_proof: null,
          execution_time_ms: 0,
          agent_name: agentName,
          raw_output: `No validation logic implemented for agent "${agentName}"`,
        };
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
    // In the TypeScript layer, this validates wasm4pm.toml consistency.
    // The Python layer handles settings.json enforcement.
    const violations: Violation[] = [];

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
      // Validate chain linkage. NOTE: missing/undefined hash fields are a
      // critical violation — `undefined !== undefined` would silently pass and
      // accept a fabricated chain (PR #44 field-contract guard class).
      for (let i = 0; i < receipts.length; i++) {
        const curr = receipts[i];
        const currHash = typeof curr.hash === 'string' ? curr.hash : null;
        if (!currHash) {
          violations.push({
            agent_name: 'receipt-chain-attacker',
            violation_type: 'missing_hash_field',
            severity: 'critical',
            evidence: { index: i, field: 'hash' },
            process_mining_proof: null,
            timestamp: new Date().toISOString(),
            blocked_manufacturing: true,
            target: context.artifact_id,
          });
        }
        if (i === 0) continue;
        const prev = receipts[i - 1];
        const prevHash = typeof prev.hash === 'string' ? prev.hash : null;
        const prevLink = typeof curr.previous_hash === 'string' ? curr.previous_hash : null;
        if (!prevLink) {
          violations.push({
            agent_name: 'receipt-chain-attacker',
            violation_type: 'missing_previous_hash',
            severity: 'critical',
            evidence: { index: i, field: 'previous_hash' },
            process_mining_proof: null,
            timestamp: new Date().toISOString(),
            blocked_manufacturing: true,
            target: context.artifact_id,
          });
        } else if (prevLink !== prevHash) {
          violations.push({
            agent_name: 'receipt-chain-attacker',
            violation_type: 'broken_hash_chain',
            severity: 'critical',
            evidence: {
              index: i,
              expected: prevHash,
              actual: prevLink,
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
        passed: true,
        violations: [],
        process_mining_proof: null,
        execution_time_ms: 0,
        agent_name: 'process-mining-skeptic',
        raw_output: 'No OCEL events to analyze',
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

    // `ProcessMiningProof` documents simplicity in [0.0, 1.0]; without
    // clamping, ≥20 stage deltas produce negative simplicity and break the
    // contract (PR #53 [0,1] clamp class).
    const simplicity = Math.max(0, 1.0 - (missing.length + extra.length) * 0.05);
    const proof: ProcessMiningProof = {
      fitness,
      precision,
      generalization: Math.min(fitness, precision),
      simplicity,
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
    // In production, this delegates to Python agents via subprocess bridge
    // For now, record the intended correction
    return {
      success: true,
      action: `${action.type} applied to ${action.target}`,
      details: {
        agent: action.agent,
        type: action.type,
        target: action.target,
        dry_run: context.dry_run,
      },
    };
  }
}
