/**
 * @pictl/contracts
 *
 * Shared type definitions and contracts for the wasm4pm ecosystem.
 * Provides interfaces for source connectors, sink adapters, compatibility matrices,
 * runtime receipts, execution plans, status lifecycle, and explain snapshots.
 *
 * All schemas are versioned and export both TypeScript types and JSON schemas.
 */
export * from './types.js';
export * from './templates/index.js';
export * from './errors.js';
export type { ErrorInfo as ErrorDetails, ErrorCode } from './errors.js';
export { createError, createTypedError, TYPED_ERROR_CODES } from './errors.js';
export type { TypedError } from './errors.js';
export * from './result.js';
export * from './connectors.js';
export * from './sinks.js';
export type { Receipt, ErrorInfo, ExecutionSummary, AlgorithmInfo, ModelInfo, ExecutionProfile, } from './receipt.js';
export { isReceipt } from './receipt.js';
export { hashData, verifyHash } from './hash.js';
export { ReceiptBuilder } from './receipt-builder.js';
export type { Plan, PlanNode, PlanEdge, PlanNodeKind } from './plan.js';
export type { Status, LifecycleState } from './status.js';
export type { ExplainSnapshot } from './explain.js';
export { PLAN_STEP_TYPE_VALUES } from './steps.js';
export type { PlanStepTypeValue } from './steps.js';
//# sourceMappingURL=index.d.ts.map