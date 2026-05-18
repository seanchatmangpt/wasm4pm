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
// Quality thresholds — per-algorithm fitness/precision/generalization/simplicity floors
export { getQualityThreshold, ALGORITHM_QUALITY_THRESHOLDS, DEFAULT_QUALITY_THRESHOLD } from './quality-thresholds.js';
// Algorithm registry utilities
export { levenshteinDistance, findClosestMatch } from './algorithm-registry.js';
// mcpp/wasm4pm interop bridges
export { andonToWasm4pmError, wasm4pmErrorToAndon, isMcppAndonCode, MCPP_ANDON_CODES, ANDON_TO_ERROR_CODE, } from './andon-bridge.js';
export { evaluateConformance, isRefused, toSharedConformance, } from './conformance-bridge.js';
export { receiptToOcelEvents, toOcelJsonl, fromMcppJsonl, fromMcppJsonlStrict, fromMcppNativeJsonl, fromMcppNativeJsonlStrict, isValidOcelEvent, } from './ocel-bridge.js';
export { emitReceiptEmit, } from './receipt-emit-bridge.js';
export { toSharedReceipt, fromMcppResponse, SHARED_RECEIPT_SCHEMA_V1, } from './shared-schema/adapter.js';
// Prolog8 Rule8/Fact8 compiler helpers — pre-compile Horn clauses for the WASM kernel
export { internTerms, buildFact8, buildRule8, buildFactBlock, buildCatalog, buildQueryAtom, ARITY_CAP as PROLOG8_ARITY_CAP, BODY_CAP as PROLOG8_BODY_CAP, TERM_SENTINEL as PROLOG8_TERM_SENTINEL, FeatureBit as Prolog8FeatureBit, } from './prolog8-compiler.js';
//# sourceMappingURL=index.js.map