/**
 * @wasm4pm/contracts
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
export type { EventLogIR, LogEvent, LogTrace, LogMetadata } from './eventlog.js';
export { isEventLogIR } from './eventlog.js';
export type { ModelIR, ModelCapabilities, QualityMetrics, ModelNode, ModelEdge } from './model.js';
export { isModelIR } from './model.js';
export type { ResultEnvelope, ProvenanceChain, LatencyClass } from './result.js';
export { isResultEnvelope, isProvenanceChain, deriveLatencyClass } from './result.js';
export * from './result.js';
export * from './connectors.js';
export * from './sinks.js';
export type { Receipt, ErrorInfo, ExecutionSummary, AlgorithmInfo, ModelInfo, ExecutionProfile, } from './receipt.js';
export { isReceipt, RECEIPT_JSON_SCHEMA } from './receipt.js';
export { hashData, hashConfig, hashJsonString, normalizeForHashing, verifyHash } from './hash.js';
export { ReceiptBuilder } from './receipt-builder.js';
export type { Plan, PlanNode, PlanEdge, PlanNodeKind } from './plan.js';
export { isPlan, validatePlanDAG, sortNodes, sortEdges, normalizePlan, PLAN_JSON_SCHEMA, } from './plan.js';
export type { Status, LifecycleState } from './status.js';
export { isStatus, isLifecycleState, isValidTransition, LIFECYCLE_STATES, STATE_TRANSITIONS, STATUS_JSON_SCHEMA, } from './status.js';
export type { ExplainSnapshot } from './explain.js';
export { isExplainSnapshot, EXPLAIN_JSON_SCHEMA } from './explain.js';
export { PLAN_STEP_TYPE_VALUES } from './steps.js';
export type { PlanStepTypeValue } from './steps.js';
export type { BudgetEnvelope, LatencyClass as BudgetLatencyClass, QualityTier, ExecutionMode, } from './budget.js';
export { latencyTierLte, qualityTierLte, latencyExceedsBudget, qualityDeficientForFloor, createDefaultBudgetEnvelope, } from './budget.js';
export { getQualityThreshold, ALGORITHM_QUALITY_THRESHOLDS, DEFAULT_QUALITY_THRESHOLD } from './quality-thresholds.js';
export type { QualityThresholdProfile } from './quality-thresholds.js';
export { levenshteinDistance, findClosestMatch } from './algorithm-registry.js';
export { andonToWasm4pmError, wasm4pmErrorToAndon, isMcppAndonCode, MCPP_ANDON_CODES, ANDON_TO_ERROR_CODE, type McppAndonReason, type McppAndonCode, } from './andon-bridge.js';
export { evaluateConformance, isRefused, toSharedConformance, type ConformanceDimension, type ConformanceThresholds, type FitnessResult, type DimensionResult, type ConformanceEvaluation, type ConformanceExtras, } from './conformance-bridge.js';
export { receiptToOcelEvents, toOcelJsonl, fromMcppJsonl, fromMcppJsonlStrict, fromMcppNativeJsonl, fromMcppNativeJsonlStrict, isValidOcelEvent, type OcelEvent, } from './ocel-bridge.js';
export { emitReceiptEmit, type ReceiptEmitRecord, } from './receipt-emit-bridge.js';
export { toSharedReceipt, fromMcppResponse, SHARED_RECEIPT_SCHEMA_V1, type SharedReceiptV1, } from './shared-schema/adapter.js';
export { internTerms, buildFact8, buildRule8, buildFactBlock, buildCatalog, buildQueryAtom, ARITY_CAP as PROLOG8_ARITY_CAP, BODY_CAP as PROLOG8_BODY_CAP, TERM_SENTINEL as PROLOG8_TERM_SENTINEL, FeatureBit as Prolog8FeatureBit, type TermInternTable, type Rule8Json, type Atom8Json, type FactBlockJson, type FactRowJson, type BodyAtomSpec, type PredicateDescriptor, type Prolog8Catalog, } from './prolog8-compiler.js';
//# sourceMappingURL=index.d.ts.map