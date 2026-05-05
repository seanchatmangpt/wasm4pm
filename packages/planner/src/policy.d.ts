/**
 * Planner Policy and Budget Enforcement
 *
 * Section 4 of the Three-Layer Architecture Specification.
 * Implements backend selection rules, algorithm decision tables, and job promotion/degradation.
 */
import type { BudgetEnvelope, QualityTier, LatencyClass } from '@wasm4pm/contracts';
/**
 * Backend IDs recognized by the federation system.
 */
export type BackendId = 'wasm' | 'pm4py' | 'ml' | 'null';
/**
 * Algorithm families for dispatch routing.
 */
export type AlgorithmFamily = 'discovery' | 'conformance' | 'analysis' | 'ml' | 'simulation';
/**
 * Algorithm ID type (subset of kernel algorithm IDs).
 */
export type AlgorithmId = string;
/**
 * Section 4.2: Seven-Priority Engine Selection Rule Table
 * Applied in priority order; first matching rule wins.
 *
 * Returns the backend ID that should handle the algorithm, or null if no rule matched.
 * At null, rule 7 (general selection algorithm) applies.
 *
 * Invariants:
 * - Rules 1–6 are deterministic decision paths.
 * - Rule 7 defers to the general 7-rule selection algorithm (Section 3.5).
 * - RL tiebreaker applies only at rule 7, never overriding rules 1–6.
 */
export declare function selectEngineByPriority(
  algorithmId: AlgorithmId,
  budget: BudgetEnvelope,
  pythonAvailable: boolean,
  algorithmFamily?: AlgorithmFamily
): BackendId | null;
/**
 * Section 4.3: Algorithm Selection Decision Table
 *
 * Maps (latencyBudget, qualityFloor) → list of candidate algorithm IDs.
 * This table governs which algorithms the planner considers for a given budget constraint.
 *
 * The decision table is the source of truth for algorithm selection based on budget.
 * Higher-tier algorithms (ilp, genetic) are only selected when quality and latency budgets permit.
 */
export declare function selectAlgorithmByBudget(
  latencyBudget: LatencyClass,
  qualityFloor: QualityTier
): AlgorithmId[];
/**
 * Section 4.5: Four Promotion Rules
 *
 * A pending or near-online job is promoted to a higher-priority queue when one of these conditions is met.
 * Returns true if the job should be promoted to a higher-priority tier.
 */
export declare function shouldPromoteJob(
  priorLatencyMs: number,
  priorLatencyBudget: LatencyClass,
  newBudget: BudgetEnvelope,
  conformanceScore: number,
  spcAlertLevel: number,
  priorSpcAlertLevel: number,
  healthLevel: number,
  priorHealthLevel: number
): boolean;
/**
 * Section 4.6: Five Degradation Rules
 *
 * The planner downgrades the selected algorithm when one of these conditions is met.
 * Returns true if the algorithm should be demoted to a faster/cheaper alternative.
 *
 * Degradation rules apply after a job has run once and we have execution history.
 */
export declare function shouldDegradeAlgorithm(
  priorLatencyMs: number,
  latencyBudgetMs: number,
  priorMemoryBytes: number,
  memoryBudgetBytes: number,
  circuitOpen: boolean,
  backendHealthy: boolean,
  spcViolation: boolean
): boolean;
/**
 * Helper to convert execution profile to BudgetEnvelope.mode.
 * Used by the planner to derive mode from profile.
 *
 * Mapping (Section 5.8):
 * - fast → online
 * - balanced → online or near-online (by log size: >50K events → near-online)
 * - quality → near-online or batch (by algorithm: ilp/genetic → batch)
 * - stream → online (always)
 */
export declare function profileToExecutionMode(
  profile: 'fast' | 'balanced' | 'quality' | 'stream',
  eventCount?: number,
  algorithmId?: string
): 'online' | 'near-online' | 'batch' | 'research';
/**
 * Helper to convert execution profile to latency budget.
 * Used by the planner to derive latencyBudget from profile.
 */
export declare function profileToLatencyBudget(
  profile: 'fast' | 'balanced' | 'quality' | 'stream'
): LatencyClass;
/**
 * Helper to convert execution profile to quality floor.
 * Used by the planner to derive qualityFloor from profile.
 */
export declare function profileToQualityFloor(
  profile: 'fast' | 'balanced' | 'quality' | 'stream'
): QualityTier;
//# sourceMappingURL=policy.d.ts.map
