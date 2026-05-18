/**
 * Van der Aalst Process Mining Agents — Type Definitions
 *
 * 8 autonomous adversarial agents that validate manufacturing integrity
 * using process mining principles (soundness, conformance, multi-surface corroboration).
 */

/** Agent execution mode */
export type AgentMode = 'continuous' | 'on_demand';

/** Agent severity level */
export type Severity = 'critical' | 'warning';

/** Violation detected by an agent */
export interface Violation {
  /** Agent that detected the violation */
  agent_name: string;
  /** Type of violation */
  violation_type: string;
  /** Severity level */
  severity: Severity;
  /** Evidence supporting the violation */
  evidence: Record<string, unknown>;
  /** Process mining proof (fitness, precision, etc.) */
  process_mining_proof: ProcessMiningProof | null;
  /** Timestamp of detection */
  timestamp: string;
  /** Whether this violation blocks manufacturing */
  blocked_manufacturing: boolean;
  /** Target that needs correction */
  target: string;
}

/** Process mining quality metrics */
export interface ProcessMiningProof {
  /** Log-to-model fitness (0.0-1.0) */
  fitness: number;
  /** Model-to-log precision (0.0-1.0) */
  precision: number;
  /** Generalization score (0.0-1.0) */
  generalization: number;
  /** Simplicity score (0.0-1.0) */
  simplicity: number;
  /** Number of deviations found */
  deviations: number;
  /** Algorithm used for discovery */
  algorithm: string;
}

/** Correction type (autonomous self-healing) */
export type CorrectionType =
  | 'config_restoration'
  | 'evidence_repair'
  | 'code_refactoring'
  | 'process_correction'
  | 'authority_restoration'
  | 'stub_elimination'
  | 'receipt_chain_repair';

/** Audit log entry (immutable) */
export interface AuditEntry {
  /** Timestamp of the correction */
  timestamp: string;
  /** Agent that performed the correction */
  agent_name: string;
  /** Type of correction applied */
  correction_type: CorrectionType;
  /** Violation that triggered correction */
  violation: Violation;
  /** Human-readable description of the action */
  correction_action: string;
  /** Whether the correction succeeded */
  correction_success: boolean;
  /** Additional details */
  correction_details: Record<string, unknown>;
  /** Artifact ID (if applicable) */
  artifact_id: string | null;
  /** Snapshot of state before correction (for undo) */
  snapshot_data: Record<string, unknown> | null;
}

/** Agent validation result */
export interface AgentResult {
  /** Whether validation passed (no violations) */
  passed: boolean;
  /** Violations found */
  violations: Violation[];
  /** Process mining proof */
  process_mining_proof: ProcessMiningProof | null;
  /** Execution time in milliseconds */
  execution_time_ms: number;
  /** Agent name */
  agent_name: string;
  /** Raw output from agent */
  raw_output: string;
}

/** Autonomous agent result (with corrections) */
export interface AutonomousAgentResult extends AgentResult {
  /** Corrections applied */
  corrections: AuditEntry[];
  /** Whether re-validation passed after corrections */
  revalidated: boolean;
}

/** Agent configuration */
export interface AgentConfig {
  /** Unique agent identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** Execution mode */
  mode: AgentMode;
  /** Target proof gates (empty for non-gate agents) */
  target_gates: string[];
  /** Whether the agent is enabled */
  enabled: boolean;
  /** Correction type this agent can apply */
  correction_type: CorrectionType | null;
  /** Version string */
  version: string;
  /** Tags for categorization */
  tags: string[];
  /** Thresholds for violation detection */
  thresholds: AgentThresholds;
}

/** Agent detection thresholds */
export interface AgentThresholds {
  /** Minimum fitness for conformance (default: 0.95) */
  min_fitness: number;
  /** Minimum precision (default: 0.80) */
  min_precision: number;
  /** Maximum allowed deviations */
  max_deviations: number;
  /** Timeout in milliseconds for agent execution */
  timeout_ms: number;
}

/** MAPE-K cycle result */
export interface MAPEKCycleResult {
  /** Unique cycle identifier */
  cycle_id: string;
  /** Whether the cycle completed successfully */
  success: boolean;
  /** Monitor phase results */
  monitor: MonitorResult;
  /** Analyze phase results */
  analyze: AnalyzeResult;
  /** Plan phase results */
  plan: PlanResult;
  /** Execute phase results */
  execute: ExecuteResult;
  /** Learn phase results */
  learn: LearnResult;
  /** Total cycle duration in milliseconds */
  duration_ms: number;
}

/** Monitor phase: capture metrics from 4 surfaces */
export interface MonitorResult {
  /** Execution surface (receipt chains, artifact state) */
  execution: SurfaceEvidence;
  /** Telemetry surface (OTel traces) */
  telemetry: SurfaceEvidence;
  /** State surface (knowledge graph) */
  state: SurfaceEvidence;
  /** Process surface (OCEL events) */
  process: SurfaceEvidence;
}

/** Evidence from a single surface */
export interface SurfaceEvidence {
  /** Whether this surface has valid evidence */
  valid: boolean;
  /** Number of evidence items */
  count: number;
  /** Fitness score (if applicable) */
  fitness: number | null;
  /** Raw evidence data */
  data: Record<string, unknown>;
}

/** Analyze phase: detect violations using agents */
export interface AnalyzeResult {
  /** All violations detected */
  violations: Violation[];
  /** Number of violations by severity */
  critical_count: number;
  /** warning_count: number */
  warning_count: number;
  /** Agents that detected violations */
  agents_triggered: string[];
}

/** Plan phase: generate corrective actions */
export interface PlanResult {
  /** Ordered list of corrective actions */
  actions: CorrectiveAction[];
  /** Number of actions by priority */
  critical_actions: number;
  /** warning_actions: number */
  warning_actions: number;
}

/** A single corrective action */
export interface CorrectiveAction {
  /** Agent that will apply the correction */
  agent: string;
  /** Type of correction */
  type: CorrectionType;
  /** Target of the correction */
  target: string;
  /** Severity of the triggering violation */
  severity: Severity;
  /** Whether this action requires approval */
  requires_approval: boolean;
}

/** Execute phase: apply corrections */
export interface ExecuteResult {
  /** Corrections applied */
  corrections: AuditEntry[];
  /** Number of successful corrections */
  successful_count: number;
  /** Number of failed corrections */
  failed_count: number;
}

/** One entry in the threshold audit log produced by the Learn phase */
export interface ThresholdAuditEntry {
  /** Agent whose threshold changed */
  agentId: string;
  /** Violation type that drove the change */
  violationType: string;
  /** Drift score that triggered adaptation */
  driftScore: number;
  /** Threshold field that was mutated */
  field: keyof AgentThresholds;
  /** Value before adaptation */
  before: number;
  /** Value after adaptation */
  after: number;
  /** Human-readable explanation of the change */
  reason: string;
}

/** Learn phase: update knowledge */
export interface LearnResult {
  /** Whether knowledge was updated */
  knowledge_updated: boolean;
  /** Drift detection scores */
  drift_scores: Record<string, number> | null;
  /** Ontology patches applied */
  ontology_patches: number;
  /**
   * Audit trail of threshold changes applied during this Learn phase.
   * Each entry records which agent threshold changed, by how much, and why.
   * Empty when no thresholds changed (score at floor/ceiling or score == 0 and
   * agent has fewer than 5 runs).
   */
  thresholdAuditLog: ThresholdAuditEntry[];
}

/** Agent registry status */
export type AgentStatus = 'active' | 'disabled' | 'error' | 'degraded';

/** Runtime agent state in registry */
export interface AgentRuntimeState {
  /** Agent configuration */
  config: AgentConfig;
  /** Current status */
  status: AgentStatus;
  /** Total executions */
  total_runs: number;
  /** Total violations detected */
  total_violations: number;
  /** Total corrections applied */
  total_corrections: number;
  /** Last execution timestamp */
  last_run: string | null;
  /** Last error message */
  last_error: string | null;
}

/** Multi-surface corroboration result */
export interface CorroborationResult {
  /** Number of surfaces that passed */
  surfaces_passed: number;
  /** Details per surface */
  execution: { valid: boolean; evidence: string };
  telemetry: { valid: boolean; evidence: string };
  state: { valid: boolean; evidence: string };
  process: { valid: boolean; evidence: string };
  /** Whether at least 3 surfaces corroborate */
  corroborated: boolean;
}

/** The 8 Van der Aalst agent names */
export const VAN_DERAALST_AGENTS = [
  'mock-interceptor',
  'config-drift-guardian',
  'receipt-chain-attacker',
  'gate-independence-verifier',
  'evidence-fabrication-detector',
  'process-mining-skeptic',
  'theater-detector',
  'authority-escalation-watcher',
] as const;

export type VanDerAalstAgentName = (typeof VAN_DERAALST_AGENTS)[number];
