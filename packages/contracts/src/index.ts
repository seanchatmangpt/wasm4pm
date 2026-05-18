/**
 * @wasm4pm/contracts
 *
 * Shared type definitions and contracts for the wasm4pm ecosystem.
 * Provides interfaces for source connectors, sink adapters, compatibility matrices,
 * runtime receipts, execution plans, status lifecycle, and explain snapshots.
 *
 * All schemas are versioned and export both TypeScript types and JSON schemas.
 */

// Engine types (merged from @wasm4pm/types)
export * from './types.js';

// Template static data (merged from @wasm4pm/templates)
export * from './templates/index.js';

// Error system - PRD §14
export * from './errors.js';
export type { ErrorInfo as ErrorDetails, ErrorCode } from './errors.js';
export { createError, createTypedError, TYPED_ERROR_CODES } from './errors.js';
export type { TypedError } from './errors.js';

// Section 2.1: EventLogIR - Canonical event log representation
export type { EventLogIR, LogEvent, LogTrace, LogMetadata } from './eventlog.js';
export { isEventLogIR } from './eventlog.js';

// Section 2.2: ModelIR - Canonical process model representation
export type { ModelIR, ModelCapabilities, QualityMetrics, ModelNode, ModelEdge } from './model.js';
export { isModelIR } from './model.js';

// Section 2.3 & 2.4: Result envelope and provenance (Canonical IR)
export type { ResultEnvelope, ProvenanceChain, LatencyClass } from './result.js';
export { isResultEnvelope, isProvenanceChain, deriveLatencyClass } from './result.js';

// Result type and utilities (legacy Result<T> type for error handling)
export * from './result.js';

// Connector contracts
export * from './connectors.js';

// Sink contracts
export * from './sinks.js';

// Receipt types and cryptographic verification
export type {
  Receipt,
  ErrorInfo,
  ExecutionSummary,
  AlgorithmInfo,
  ModelInfo,
  ExecutionProfile,
} from './receipt.js';
export { isReceipt, RECEIPT_JSON_SCHEMA } from './receipt.js';

// Hash functions for deterministic content hashing
export { hashData, hashConfig, hashJsonString, normalizeForHashing, verifyHash } from './hash.js';

// Receipt builder
export { ReceiptBuilder } from './receipt-builder.js';

// Plan schema - DAG representation
export type { Plan, PlanNode, PlanEdge, PlanNodeKind } from './plan.js';
export {
  isPlan,
  validatePlanDAG,
  sortNodes,
  sortEdges,
  normalizePlan,
  PLAN_JSON_SCHEMA,
} from './plan.js';

// Status schema - lifecycle states
export type { Status, LifecycleState } from './status.js';
export {
  isStatus,
  isLifecycleState,
  isValidTransition,
  LIFECYCLE_STATES,
  STATE_TRANSITIONS,
  STATUS_JSON_SCHEMA,
} from './status.js';

// Explain snapshot
export type { ExplainSnapshot } from './explain.js';
export { isExplainSnapshot, EXPLAIN_JSON_SCHEMA } from './explain.js';

// Plan step type values — shared between @wasm4pm/planner and @wasm4pm/testing
export { PLAN_STEP_TYPE_VALUES } from './steps.js';
export type { PlanStepTypeValue } from './steps.js';

// Budget envelope (Section 4 of Three-Layer Architecture Specification)
// Defines execution constraints: latency, memory, quality floor, and execution mode
export type {
  BudgetEnvelope,
  LatencyClass as BudgetLatencyClass,
  QualityTier,
  ExecutionMode,
} from './budget.js';
export {
  latencyTierLte,
  qualityTierLte,
  latencyExceedsBudget,
  qualityDeficientForFloor,
  createDefaultBudgetEnvelope,
} from './budget.js';

// Quality thresholds — per-algorithm fitness/precision/generalization/simplicity floors
export { getQualityThreshold, ALGORITHM_QUALITY_THRESHOLDS, DEFAULT_QUALITY_THRESHOLD } from './quality-thresholds.js';
export type { QualityThresholdProfile } from './quality-thresholds.js';

// Algorithm registry utilities
export { levenshteinDistance, findClosestMatch } from './algorithm-registry.js';

// mcpp/wasm4pm interop bridges
export {
  andonToWasm4pmError,
  wasm4pmErrorToAndon,
  isMcppAndonCode,
  MCPP_ANDON_CODES,
  ANDON_TO_ERROR_CODE,
  type McppAndonReason,
  type McppAndonCode,
} from './andon-bridge.js';

export {
  evaluateConformance,
  isRefused,
  toSharedConformance,
  type ConformanceDimension,
  type ConformanceThresholds,
  type FitnessResult,
  type DimensionResult,
  type ConformanceEvaluation,
  type ConformanceExtras,
} from './conformance-bridge.js';

export {
  receiptToOcelEvents,
  toOcelJsonl,
  fromMcppJsonl,
  type OcelEvent,
} from './ocel-bridge.js';

export {
  emitReceiptEmit,
  type ReceiptEmitRecord,
} from './receipt-emit-bridge.js';

export {
  toSharedReceipt,
  fromMcppResponse,
  SHARED_RECEIPT_SCHEMA_V1,
  type SharedReceiptV1,
} from './shared-schema/adapter.js';
