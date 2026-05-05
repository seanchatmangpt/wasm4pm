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
import { AgentRegistry } from './registry.js';
import { AuditStore } from './audit.js';
import type {
  AgentResult,
  AnalyzeResult,
  ExecuteResult,
  LearnResult,
  MAPEKCycleResult,
  MonitorResult,
  PlanResult,
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
export declare class AgentOrchestrator {
  private registry;
  private audit;
  constructor(options?: { registryPath?: string; auditPath?: string });
  /** Get the agent registry */
  getAgentRegistry(): AgentRegistry;
  /** Get the audit store */
  getAuditStore(): AuditStore;
  /**
   * Run a single MAPE-K cycle for an artifact
   */
  runMapekCycle(context: AgentExecutionContext): Promise<MAPEKCycleResult>;
  /**
   * Execute a specific agent (without full MAPE-K cycle)
   */
  executeAgent(agentName: string, context: AgentExecutionContext): Promise<AgentResult>;
  /**
   * MONITOR: Capture metrics from 4 surfaces
   */
  monitor(context: AgentExecutionContext): Promise<MonitorResult>;
  /**
   * ANALYZE: Run agents to detect violations
   */
  analyze(context: AgentExecutionContext, monitor: MonitorResult): Promise<AnalyzeResult>;
  /**
   * PLAN: Generate corrective actions from violations
   */
  plan(analyze: AnalyzeResult): Promise<PlanResult>;
  /**
   * EXECUTE: Apply corrective actions
   */
  execute(plan: PlanResult, context: AgentExecutionContext): Promise<ExecuteResult>;
  /**
   * LEARN: Update knowledge base
   */
  learn(analyze: AnalyzeResult, execute: ExecuteResult): LearnResult;
  /** Generate unique cycle ID */
  private _generateCycleId;
  /** Monitor execution surface (receipt chains, artifact state) */
  private _monitorExecution;
  /** Monitor telemetry surface (OTel traces) */
  private _monitorTelemetry;
  /** Monitor state surface (knowledge graph) */
  private _monitorState;
  /** Monitor process surface (OCEL events) */
  private _monitorProcess;
  /**
   * Run agent-specific validation logic
   * This is the bridge point where Python agents can be invoked
   */
  private _runAgentLogic;
  /** MockInterceptor: detect mock/stub patterns */
  private _validateMockInterceptor;
  /** ConfigDriftGuardian: detect configuration drift */
  private _validateConfigDrift;
  /** ReceiptChainAttacker: validate BLAKE3 receipt chains */
  private _validateReceiptChain;
  /** GateIndependenceVerifier: verify gates are independent */
  private _validateGateIndependence;
  /** EvidenceFabricationDetector: detect fabricated telemetry */
  private _validateEvidenceFabrication;
  /** ProcessMiningSkeptic: validate process models with pm4py */
  private _validateProcessMiningSkeptic;
  /** TheaterDetector: detect testing theater */
  private _validateTheaterDetector;
  /** AuthorityEscalationWatcher: detect privilege escalation */
  private _validateAuthorityEscalation;
  /** Create snapshot for undo support */
  private _createSnapshot;
  /** Apply a corrective action */
  private _applyCorrection;
}
//# sourceMappingURL=orchestration.d.ts.map
