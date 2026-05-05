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
export { createError, createTypedError, TYPED_ERROR_CODES } from './errors.js';
export { isEventLogIR } from './eventlog.js';
export { isModelIR } from './model.js';
export { isResultEnvelope, isProvenanceChain, deriveLatencyClass } from './result.js';
// Result type and utilities (legacy Result<T> type for error handling)
export * from './result.js';
// Connector contracts
export * from './connectors.js';
// Sink contracts
export * from './sinks.js';
export { isReceipt, RECEIPT_JSON_SCHEMA } from './receipt.js';
// Hash functions for deterministic content hashing
export { hashData, hashConfig, hashJsonString, normalizeForHashing, verifyHash } from './hash.js';
// Receipt builder
export { ReceiptBuilder } from './receipt-builder.js';
export { isPlan, validatePlanDAG, sortNodes, sortEdges, normalizePlan, PLAN_JSON_SCHEMA, } from './plan.js';
export { isStatus, isLifecycleState, isValidTransition, LIFECYCLE_STATES, STATE_TRANSITIONS, STATUS_JSON_SCHEMA, } from './status.js';
export { isExplainSnapshot, EXPLAIN_JSON_SCHEMA } from './explain.js';
// Plan step type values — shared between @wasm4pm/planner and @wasm4pm/testing
export { PLAN_STEP_TYPE_VALUES } from './steps.js';
export { latencyTierLte, qualityTierLte, latencyExceedsBudget, qualityDeficientForFloor, createDefaultBudgetEnvelope, } from './budget.js';
//# sourceMappingURL=index.js.map