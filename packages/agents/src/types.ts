/**
 * Van der Aalst Process Mining Agents — Type Definitions
 *
 * 8 autonomous adversarial agents that validate manufacturing integrity
 * using process mining principles (soundness, conformance, multi-surface corroboration).
 */

import { z } from 'zod';

// ── Enum-like literal unions ─────────────────────────────────────────────────

/** Agent execution mode */
export const AgentModeSchema = z.enum(['continuous', 'on_demand']);
export type AgentMode = z.infer<typeof AgentModeSchema>;

/** Agent severity level */
export const SeveritySchema = z.enum(['critical', 'warning']);
export type Severity = z.infer<typeof SeveritySchema>;

/** Correction type (autonomous self-healing) */
export const CorrectionTypeSchema = z.enum([
  'config_restoration',
  'evidence_repair',
  'code_refactoring',
  'process_correction',
  'authority_restoration',
  'stub_elimination',
  'receipt_chain_repair',
]);
export type CorrectionType = z.infer<typeof CorrectionTypeSchema>;

/** Agent registry status */
export const AgentStatusSchema = z.enum(['active', 'disabled', 'error', 'degraded']);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

// ── Data schemas ─────────────────────────────────────────────────────────────

/** Process mining quality metrics */
export const ProcessMiningProofSchema = z.object({
  /** Log-to-model fitness (0.0-1.0) */
  fitness: z.number(),
  /** Model-to-log precision (0.0-1.0) */
  precision: z.number(),
  /** Generalization score (0.0-1.0) */
  generalization: z.number(),
  /** Simplicity score (0.0-1.0) */
  simplicity: z.number(),
  /** Number of deviations found */
  deviations: z.number(),
  /** Algorithm used for discovery */
  algorithm: z.string(),
});
export type ProcessMiningProof = z.infer<typeof ProcessMiningProofSchema>;

/** Violation detected by an agent */
export const ViolationSchema = z.object({
  /** Agent that detected the violation */
  agent_name: z.string(),
  /** Type of violation */
  violation_type: z.string(),
  /** Severity level */
  severity: SeveritySchema,
  /** Evidence supporting the violation */
  evidence: z.record(z.string(), z.unknown()),
  /** Process mining proof (fitness, precision, etc.) */
  process_mining_proof: ProcessMiningProofSchema.nullable(),
  /** Timestamp of detection */
  timestamp: z.string(),
  /** Whether this violation blocks manufacturing */
  blocked_manufacturing: z.boolean(),
  /** Target that needs correction */
  target: z.string(),
});
export type Violation = z.infer<typeof ViolationSchema>;

/** Audit log entry (immutable) */
export const AuditEntrySchema = z.object({
  /** Timestamp of the correction */
  timestamp: z.string(),
  /** Agent that performed the correction */
  agent_name: z.string(),
  /** Type of correction applied */
  correction_type: CorrectionTypeSchema,
  /** Violation that triggered correction */
  violation: ViolationSchema,
  /** Human-readable description of the action */
  correction_action: z.string(),
  /** Whether the correction succeeded */
  correction_success: z.boolean(),
  /** Additional details */
  correction_details: z.record(z.string(), z.unknown()),
  /** Artifact ID (if applicable) */
  artifact_id: z.string().nullable(),
  /** Snapshot of state before correction (for undo) */
  snapshot_data: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

/** Agent validation result */
export const AgentResultSchema = z.object({
  /** Whether validation passed (no violations) */
  passed: z.boolean(),
  /** Violations found */
  violations: z.array(ViolationSchema),
  /** Process mining proof */
  process_mining_proof: ProcessMiningProofSchema.nullable(),
  /** Execution time in milliseconds */
  execution_time_ms: z.number(),
  /** Agent name */
  agent_name: z.string(),
  /** Raw output from agent */
  raw_output: z.string(),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

/** Autonomous agent result (with corrections) */
export const AutonomousAgentResultSchema = AgentResultSchema.extend({
  /** Corrections applied */
  corrections: z.array(AuditEntrySchema),
  /** Whether re-validation passed after corrections */
  revalidated: z.boolean(),
});
export type AutonomousAgentResult = z.infer<typeof AutonomousAgentResultSchema>;

/** Agent detection thresholds */
export const AgentThresholdsSchema = z.object({
  /** Minimum fitness for conformance (default: 0.95) */
  min_fitness: z.number(),
  /** Minimum precision (default: 0.80) */
  min_precision: z.number(),
  /** Maximum allowed deviations */
  max_deviations: z.number(),
  /** Timeout in milliseconds for agent execution */
  timeout_ms: z.number(),
});
export type AgentThresholds = z.infer<typeof AgentThresholdsSchema>;

/** Agent configuration */
export const AgentConfigSchema = z.object({
  /** Unique agent identifier */
  name: z.string(),
  /** Human-readable description */
  description: z.string(),
  /** Execution mode */
  mode: AgentModeSchema,
  /** Target proof gates (empty for non-gate agents) */
  target_gates: z.array(z.string()),
  /** Whether the agent is enabled */
  enabled: z.boolean(),
  /** Correction type this agent can apply */
  correction_type: CorrectionTypeSchema.nullable(),
  /** Version string */
  version: z.string(),
  /** Tags for categorization */
  tags: z.array(z.string()),
  /** Thresholds for violation detection */
  thresholds: AgentThresholdsSchema,
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** Evidence from a single surface */
export const SurfaceEvidenceSchema = z.object({
  /** Whether this surface has valid evidence */
  valid: z.boolean(),
  /** Number of evidence items */
  count: z.number(),
  /** Fitness score (if applicable) */
  fitness: z.number().nullable(),
  /** Raw evidence data */
  data: z.record(z.string(), z.unknown()),
});
export type SurfaceEvidence = z.infer<typeof SurfaceEvidenceSchema>;

/** Monitor phase: capture metrics from 4 surfaces */
export const MonitorResultSchema = z.object({
  /** Execution surface (receipt chains, artifact state) */
  execution: SurfaceEvidenceSchema,
  /** Telemetry surface (OTel traces) */
  telemetry: SurfaceEvidenceSchema,
  /** State surface (knowledge graph) */
  state: SurfaceEvidenceSchema,
  /** Process surface (OCEL events) */
  process: SurfaceEvidenceSchema,
});
export type MonitorResult = z.infer<typeof MonitorResultSchema>;

/** Analyze phase: detect violations using agents */
export const AnalyzeResultSchema = z.object({
  /** All violations detected */
  violations: z.array(ViolationSchema),
  /** Number of critical-severity violations */
  critical_count: z.number(),
  /** Number of warning-severity violations */
  warning_count: z.number(),
  /** Agents that detected violations */
  agents_triggered: z.array(z.string()),
});
export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;

/** A single corrective action */
export const CorrectiveActionSchema = z.object({
  /** Agent that will apply the correction */
  agent: z.string(),
  /** Type of correction */
  type: CorrectionTypeSchema,
  /** Target of the correction */
  target: z.string(),
  /** Severity of the triggering violation */
  severity: SeveritySchema,
  /** Whether this action requires approval */
  requires_approval: z.boolean(),
});
export type CorrectiveAction = z.infer<typeof CorrectiveActionSchema>;

/** Plan phase: generate corrective actions */
export const PlanResultSchema = z.object({
  /** Ordered list of corrective actions */
  actions: z.array(CorrectiveActionSchema),
  /** Number of critical-severity corrective actions */
  critical_actions: z.number(),
  /** Number of warning-severity corrective actions */
  warning_actions: z.number(),
});
export type PlanResult = z.infer<typeof PlanResultSchema>;

/** Execute phase: apply corrections */
export const ExecuteResultSchema = z.object({
  /** Corrections applied */
  corrections: z.array(AuditEntrySchema),
  /** Number of successful corrections */
  successful_count: z.number(),
  /** Number of failed corrections */
  failed_count: z.number(),
});
export type ExecuteResult = z.infer<typeof ExecuteResultSchema>;

/** One entry in the threshold audit log produced by the Learn phase */
export const ThresholdAuditEntrySchema = z.object({
  /** Agent whose threshold changed */
  agentId: z.string(),
  /** Violation type that drove the change */
  violationType: z.string(),
  /** Drift score that triggered adaptation */
  driftScore: z.number(),
  /** Threshold field that was mutated */
  field: z.enum(['min_fitness', 'min_precision', 'max_deviations', 'timeout_ms']),
  /** Value before adaptation */
  before: z.number(),
  /** Value after adaptation */
  after: z.number(),
  /** Human-readable explanation of the change */
  reason: z.string(),
});
export type ThresholdAuditEntry = z.infer<typeof ThresholdAuditEntrySchema>;

/** Learn phase: update knowledge */
export const LearnResultSchema = z.object({
  /** Whether knowledge was updated */
  knowledge_updated: z.boolean(),
  /** Drift detection scores */
  drift_scores: z.record(z.string(), z.number()).nullable(),
  /** Ontology patches applied */
  ontology_patches: z.number(),
  /**
   * Audit trail of threshold changes applied during this Learn phase.
   * Each entry records which agent threshold changed, by how much, and why.
   * Empty when no thresholds changed (score at floor/ceiling or score == 0 and
   * agent has fewer than 5 runs).
   */
  thresholdAuditLog: z.array(ThresholdAuditEntrySchema),
});
export type LearnResult = z.infer<typeof LearnResultSchema>;

/** Runtime agent state in registry */
export const AgentRuntimeStateSchema = z.object({
  /** Agent configuration */
  config: AgentConfigSchema,
  /** Current status */
  status: AgentStatusSchema,
  /** Total executions */
  total_runs: z.number(),
  /** Total violations detected */
  total_violations: z.number(),
  /** Total corrections applied */
  total_corrections: z.number(),
  /** Last execution timestamp */
  last_run: z.string().nullable(),
  /** Last error message */
  last_error: z.string().nullable(),
});
export type AgentRuntimeState = z.infer<typeof AgentRuntimeStateSchema>;

/** Multi-surface corroboration result */
export const CorroborationResultSchema = z.object({
  /** Number of surfaces that passed */
  surfaces_passed: z.number(),
  /** Details per surface */
  execution: z.object({ valid: z.boolean(), evidence: z.string() }),
  telemetry: z.object({ valid: z.boolean(), evidence: z.string() }),
  state: z.object({ valid: z.boolean(), evidence: z.string() }),
  process: z.object({ valid: z.boolean(), evidence: z.string() }),
  /** Whether at least 3 surfaces corroborate */
  corroborated: z.boolean(),
});
export type CorroborationResult = z.infer<typeof CorroborationResultSchema>;

/** MAPE-K cycle result */
export const MAPEKCycleResultSchema = z.object({
  /** Unique cycle identifier */
  cycle_id: z.string(),
  /** Whether the cycle completed successfully */
  success: z.boolean(),
  /** Monitor phase results */
  monitor: MonitorResultSchema,
  /** Analyze phase results */
  analyze: AnalyzeResultSchema,
  /** Plan phase results */
  plan: PlanResultSchema,
  /** Execute phase results */
  execute: ExecuteResultSchema,
  /** Learn phase results */
  learn: LearnResultSchema,
  /** Total cycle duration in milliseconds */
  duration_ms: z.number(),
});
export type MAPEKCycleResult = z.infer<typeof MAPEKCycleResultSchema>;

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
