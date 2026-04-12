/**
 * @pictl/contracts
 *
 * Shared type definitions and contracts for the wasm4pm ecosystem.
 * Provides interfaces for source connectors, sink adapters, compatibility matrices,
 * runtime receipts, execution plans, status lifecycle, and explain snapshots.
 *
 * All schemas are versioned and export both TypeScript types and JSON schemas.
 */

// Engine types (merged from @pictl/types)
export * from './types.js';

// Template static data (merged from @pictl/templates)
export * from './templates/index.js';

// Error system - PRD §14
export * from './errors.js';
export type { ErrorInfo as ErrorDetails, ErrorCode } from './errors.js';
export { createError, createTypedError, TYPED_ERROR_CODES } from './errors.js';
export type { TypedError } from './errors.js';

// Result type and utilities
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
export { isReceipt } from './receipt.js';

// Hash functions for deterministic content hashing
export { hashData, verifyHash } from './hash.js';

// Receipt builder
export { ReceiptBuilder } from './receipt-builder.js';

// Plan schema - DAG representation
export type { Plan, PlanNode, PlanEdge, PlanNodeKind } from './plan.js';

// Status schema - lifecycle states
export type { Status, LifecycleState } from './status.js';

// Explain snapshot
export type { ExplainSnapshot } from './explain.js';

// Plan step type values — shared between @pictl/planner and @pictl/testing
export { PLAN_STEP_TYPE_VALUES } from './steps.js';
export type { PlanStepTypeValue } from './steps.js';
