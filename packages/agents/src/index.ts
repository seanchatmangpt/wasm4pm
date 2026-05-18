/**
 * @wasm4pm/agents — Van der Aalst Process Mining Agents
 *
 * 8 autonomous adversarial agents that validate manufacturing integrity
 * using process mining principles (soundness, conformance, multi-surface corroboration).
 *
 * Agents:
 *   1. MockInterceptor          — Detects mock/stub patterns
 *   2. ConfigDriftGuardian      — Detects weakened enforcement
 *   3. ReceiptChainAttacker     — Validates BLAKE3 receipt chains
 *   4. GateIndependenceVerifier — Prevents circular dependencies
 *   5. EvidenceFabricationDetector — Detects fabricated telemetry
 *   6. ProcessMiningSkeptic    — Validates process models with pm4py
 *   7. TheaterDetector         — Identifies testing theater
 *   8. AuthorityEscalationWatcher — Detects privilege escalation
 */

// Types
export type {
  AgentConfig,
  AgentMode,
  AgentResult,
  AgentRuntimeState,
  AgentStatus,
  AgentThresholds,
  AuditEntry,
  AutonomousAgentResult,
  CorroborationResult,
  CorrectiveAction,
  CorrectionType,
  ExecuteResult,
  LearnResult,
  MAPEKCycleResult,
  MonitorResult,
  PlanResult,
  ProcessMiningProof,
  Severity,
  SurfaceEvidence,
  VanDerAalstAgentName,
  Violation,
} from './types.js';

export { VAN_DERAALST_AGENTS } from './types.js';

// Core classes
export { AgentRegistry } from './registry.js';
export { AuditStore } from './audit.js';
export type { AuditQuery, AuditSummary } from './audit.js';
export { AuditQuery as AuditQueryFilter } from './audit.js';
export { AgentOrchestrator } from './orchestration.js';
export type { AgentExecutionContext } from './orchestration.js';

// Rule8 / Prolog8 bridge
export { auditEntriesToCatalog, AUDIT_PRED_ID, AUDIT_PRED_LABEL } from './rule8-bridge.js';
export type { AuditRule8Bundle } from './rule8-bridge.js';
