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

// Import schemas for the ALL_JSON_SCHEMAS constant
import { TYPED_ERROR_JSON_SCHEMA } from './errors.js';
import { RECEIPT_JSON_SCHEMA } from './receipt.js';
import { PLAN_JSON_SCHEMA } from './plan.js';
import { STATUS_JSON_SCHEMA } from './status.js';
import { EXPLAIN_JSON_SCHEMA } from './explain.js';

// Error system - PRD §14
export * from './errors.js';
export type { ErrorInfo as ErrorDetails, ErrorCode } from './errors.js';
export {
  createError,
  formatError,
  formatErrorJSON,
  logError,
  validateErrorSystem,
  createTypedError,
  resolveErrorCode,
  isTypedError,
  TYPED_ERROR_CODES,
  TYPED_ERROR_NAMES,
  TYPED_ERROR_JSON_SCHEMA,
} from './errors.js';
export type { TypedError } from './errors.js';

// Result type and utilities
export * from './result.js';

// Connector contracts
export * from './connectors.js';

// Sink contracts
export * from './sinks.js';

// Compatibility matrix
export * from './compatibility.js';

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
export {
  hashConfig,
  hashData,
  hashJsonString,
  verifyHash,
  normalizeForHashing,
} from './hash.js';

// Receipt builder
export { ReceiptBuilder } from './receipt-builder.js';

// Validation and tampering detection
export type { ValidationResult } from './validation.js';
export {
  validateReceipt,
  verifyReceiptHashes,
  detectTampering,
} from './validation.js';

// Plan schema - DAG representation
export type { Plan, PlanNode, PlanEdge, PlanNodeKind } from './plan.js';
export {
  isPlan,
  validatePlanDAG,
  normalizePlan,
  sortNodes,
  sortEdges,
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
export type {
  ExplainSnapshot,
  PhaseTiming,
  ResourceUsage,
  ExecutionProfile as ExplainExecutionProfile,
} from './explain.js';
export { isExplainSnapshot, EXPLAIN_JSON_SCHEMA } from './explain.js';

// Plan step type values — shared between @wasm4pm/planner and @wasm4pm/testing
export { PLAN_STEP_TYPE_VALUES } from './steps.js';
export type { PlanStepTypeValue } from './steps.js';

// All JSON schemas collected for convenience
export const ALL_JSON_SCHEMAS = {
  typedError: TYPED_ERROR_JSON_SCHEMA,
  receipt: RECEIPT_JSON_SCHEMA,
  plan: PLAN_JSON_SCHEMA,
  status: STATUS_JSON_SCHEMA,
  explain: EXPLAIN_JSON_SCHEMA,
} as const;
