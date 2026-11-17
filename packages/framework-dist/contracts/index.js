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
export { createError, createTypedError, TYPED_ERROR_CODES, ProcessMiningErrors } from './errors.js';
export { EventLogIRSchema, LogEventSchema, LogTraceSchema, LogMetadataSchema, isEventLogIR } from './eventlog.js';
export { ModelIRSchema, ModelCapabilitiesSchema, QualityMetricsSchema, ModelNodeSchema, ModelEdgeSchema, isModelIR } from './model.js';
export { isResultEnvelope, isProvenanceChain, deriveLatencyClass } from './result.js';
// Result type and utilities ( Result<T> type for error handling)
export * from './result.js';
// Connector contracts
export * from './connectors.js';
// Sink contracts
export * from './sinks.js';
export { ReceiptSchema, ErrorInfoSchema, ExecutionSummarySchema, AlgorithmInfoSchema, ModelInfoSchema, ExecutionProfileSchema, isReceipt, RECEIPT_JSON_SCHEMA, validateReceiptSchema, isReceiptExpired, receiptSummary, compareReceipts, formatReceipt, } from './receipt.js';
// Receipt validation
export { validateReceipt, verifyReceiptHashes, verifyReceipt, detectTampering } from './validation.js';
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
export { WASM_FUNCTION_NAMES, ALGORITHM_DEFAULT_PARAMS, levenshteinDistance, findClosestMatch } from './algorithm-registry.js';
export { resolveAlgorithmId, ALGORITHM_IDS } from './templates/algorithm-registry.js';
// Truex OCEL 2.0 canonical serialization (JCS-OCEL)
export { canonicalStringify } from './truex/canonical.js';
// mcpp/wasm4pm interop bridges
export { andonToWasm4pmError, wasm4pmErrorToAndon, isMcppAndonCode, MCPP_ANDON_CODES, ANDON_TO_ERROR_CODE, } from './andon-bridge.js';
export { evaluateConformance, isRefused, toSharedConformance, ConformanceDimensionSchema, ConformanceThresholdsSchema, FitnessResultSchema, DimensionResultSchema, ConformanceEvaluationSchema, ConformanceExtrasSchema, } from './conformance-bridge.js';
export { OcelEventSchema, receiptToOcelEvents, toOcelJsonl, fromMcppJsonl, fromMcppJsonlStrict, fromMcppNativeJsonl, fromMcppNativeJsonlStrict, isValidOcelEvent, } from './ocel-bridge.js';
export { emitReceiptEmit, } from './receipt-emit-bridge.js';
export { toSharedReceipt, fromMcppResponse, SHARED_RECEIPT_SCHEMA_V1, } from './shared-schema/adapter.js';
// Marketplace domain OCEL bridge — adapts commerce events to OCEL 2.0 format
export { adaptMarketplaceEvent, fromMarketplaceJsonl, isMarketplaceEvent, extractObjectTypes, countUniqueIds, } from './marketplace-bridge.js';
export { buildMarketplaceReceipt, isMarketplaceReceipt, } from './marketplace-receipt.js';
// AtomVM process lifecycle OCEL bridge — adapts Erlang/Elixir VM process events to OCEL 2.0
export { isAtomVmProcEvent, adaptAtomVmProcEvent, fromAtomVmJsonl, fromAtomVmJsonlStrict, detectCrashes, detectCrashDetails, toOcel2Json, toOcel2JsonStandard, toOcelLog, } from './atomvm-bridge.js';
// Erlang/OTP crash dump and SASL supervisor report OCEL bridge
export { parseCrashDump, parseSaslSupervisorReports, crashEventsToOcel, supervisorReportsToOcel, detectAbnormalExits, traceGraphToOcelLog, } from './erlang-bridge.js';
// Prolog8 Rule8/Fact8 compiler helpers — pre-compile Horn clauses for the WASM kernel
export { internTerms, buildFact8, buildRule8, buildFactBlock, buildCatalog, buildQueryAtom, ARITY_CAP as PROLOG8_ARITY_CAP, BODY_CAP as PROLOG8_BODY_CAP, TERM_SENTINEL as PROLOG8_TERM_SENTINEL, FeatureBit as Prolog8FeatureBit, } from './prolog8-compiler.js';
// Process-Model Registry - M1
export * from './model-registry.js';
// Admission framework — Accept(x) = C1..C7
export * from './admission.js';
// Runtime Zod-compatible validators (no external dep) — Receipt, FitnessResult, EventLogIR
export { parseReceipt, assertReceipt, parseFitnessResult, assertFitnessResult, parseEventLogIR, assertEventLogIR, } from './zod-validators.js';
export * from './compat-schemas.js';
//# sourceMappingURL=index.js.map