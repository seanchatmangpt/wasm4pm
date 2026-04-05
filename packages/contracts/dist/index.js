/**
 * @wasm4pm/contracts
 *
 * Shared type definitions and contracts for the wasm4pm ecosystem.
 * Provides interfaces for source connectors, sink adapters, compatibility matrices,
 * runtime receipts, execution plans, status lifecycle, and explain snapshots.
 *
 * All schemas are versioned and export both TypeScript types and JSON schemas.
 */
// Import schemas for the ALL_JSON_SCHEMAS constant
import { TYPED_ERROR_JSON_SCHEMA } from './errors.js';
import { RECEIPT_JSON_SCHEMA } from './receipt.js';
import { PLAN_JSON_SCHEMA } from './plan.js';
import { STATUS_JSON_SCHEMA } from './status.js';
import { EXPLAIN_JSON_SCHEMA } from './explain.js';
// Error system - PRD §14
export * from './errors.js';
export { createError, formatError, formatErrorJSON, logError, validateErrorSystem, createTypedError, resolveErrorCode, isTypedError, TYPED_ERROR_CODES, TYPED_ERROR_NAMES, TYPED_ERROR_JSON_SCHEMA, } from './errors.js';
// Result type and utilities
export * from './result.js';
// Connector contracts
export * from './connectors.js';
// Sink contracts
export * from './sinks.js';
// Compatibility matrix
export * from './compatibility.js';
export { isReceipt, RECEIPT_JSON_SCHEMA } from './receipt.js';
// Hash functions for deterministic content hashing
export { hashConfig, hashData, hashJsonString, verifyHash, normalizeForHashing, } from './hash.js';
// Receipt builder
export { ReceiptBuilder } from './receipt-builder.js';
export { validateReceipt, verifyReceiptHashes, detectTampering, } from './validation.js';
export { isPlan, validatePlanDAG, normalizePlan, sortNodes, sortEdges, PLAN_JSON_SCHEMA, } from './plan.js';
export { isStatus, isLifecycleState, isValidTransition, LIFECYCLE_STATES, STATE_TRANSITIONS, STATUS_JSON_SCHEMA, } from './status.js';
export { isExplainSnapshot, EXPLAIN_JSON_SCHEMA } from './explain.js';
// All JSON schemas collected for convenience
export const ALL_JSON_SCHEMAS = {
    typedError: TYPED_ERROR_JSON_SCHEMA,
    receipt: RECEIPT_JSON_SCHEMA,
    plan: PLAN_JSON_SCHEMA,
    status: STATUS_JSON_SCHEMA,
    explain: EXPLAIN_JSON_SCHEMA,
};
//# sourceMappingURL=index.js.map