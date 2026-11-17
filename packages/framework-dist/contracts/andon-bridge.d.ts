/**
 * Andon Bridge — bidirectional mapping between mcpp AndonReason refusals
 * and wasm4pm TypedError/ErrorCode.
 *
 * mcpp emits `AndonReason` on every Refused verdict. This module converts
 * those structured refusals into wasm4pm's typed error system so callers
 * can surface mcpp refusals as first-class wasm4pm errors with remediation.
 *
 * Covers all 19 closed `mcpp:` codes (v26.5.16 Slice B), and provides a
 * best-effort reverse mapping from TypedError back to AndonReason.
 *
 * Wire shape of AndonReason (from mcpp-core/src/protocol/andon.rs):
 * ```json
 * {
 *   "namespace":    "mcpp",
 *   "code":         "RouteConformanceGap",
 *   "detail":       "fitness=0.83 < required=1.0",
 *   "evidence_ref": "proof-pack:ocel/observed.jsonl#trace=3"
 * }
 * ```
 */
import { z } from 'zod';
import { type ErrorCode, type TypedError } from './errors.js';
/**
 * Refusal record emitted by mcpp on every Refused verdict.
 *
 * `namespace` is one of:
 *   - `"mcpp"` — closed namespace, 19 V1 codes
 *   - `"onto"` — opt-in server namespace, opaque codes
 *   - `"extension/<vendor>"` — open vendor-defined codes
 */
export declare const McppAndonReasonSchema: z.ZodObject<{
    namespace: z.ZodString;
    code: z.ZodString;
    detail: z.ZodOptional<z.ZodString>;
    evidence_ref: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    namespace: string;
    detail?: string | undefined;
    evidence_ref?: string | undefined;
}, {
    code: string;
    namespace: string;
    detail?: string | undefined;
    evidence_ref?: string | undefined;
}>;
export type McppAndonReason = z.infer<typeof McppAndonReasonSchema>;
/**
 * The 19 V1 codes in the closed `mcpp:` namespace, in priority order
 * (most-specific first, matching the verdict engine chain).
 */
export declare const MCPP_ANDON_CODES: readonly ["ActivityOnlyFakeRoute", "RouteConformanceGap", "MissingRequiredStages", "RouteSequenceMismatch", "PartialOrderViolation", "LifecycleNotTerminated", "CardinalityViolation", "ObjectLifecycleViolation", "ReceiptSchemaViolation", "InsufficientReceiptCoverage", "TestRouteIncomplete", "VersionMismatch", "PartNotFound", "PolicyDowngradeRejected", "InputHashMismatch", "ManifestUnsigned", "EvidenceContinuityGap", "GapClosureUnauthorized", "GapClosureExhausted"];
export type McppAndonCode = (typeof MCPP_ANDON_CODES)[number];
/**
 * Maps every closed `mcpp:` Andon code to the most semantically appropriate
 * wasm4pm ErrorCode.
 *
 * Mapping rationale:
 *
 * Conformance codes → CONFORMANCE_FAILED (code 32)
 *   The process model and event log do not agree; conformance checking failed.
 *
 * Envelope integrity codes → VALIDATION_FAILED (code 35)
 *   Structural invariants of the manifest/receipt/policy envelope were violated;
 *   no algorithm can run on a malformed envelope.
 *
 * Gap-closure codes → ALGORITHM_FAILED (code 30)
 *   Evidence gathering and gap-closure are algorithm-level operations; exhaustion
 *   or auth failure during those loops is an algorithm execution failure.
 *
 * Exceptions:
 *   - VersionMismatch      → SOURCE_INVALID (21): incompatible schema version
 *     is an input-format problem, not a conformance or algorithm issue.
 *   - PartNotFound         → SOURCE_NOT_FOUND (20): a required part/artifact
 *     referenced in the manifest is missing from the source set.
 *   - ManifestUnsigned     → VALIDATION_FAILED (35): unsigned manifests are a
 *     structural validation failure (not a conformance gap).
 *   - GapClosureUnauthorized → VALIDATION_FAILED (35): authorization failure is
 *     a policy-validation problem, not an algorithm iteration failure.
 */
export declare const ANDON_TO_ERROR_CODE: Record<McppAndonCode, ErrorCode>;
/**
 * Convert an mcpp refusal (`AndonReason`) into a wasm4pm `TypedError`.
 *
 * For closed `mcpp:` namespace codes: uses the exhaustive `ANDON_TO_ERROR_CODE`
 * table with a tailored remediation message per Andon code.
 *
 * For unknown/extension namespace codes: falls back to `CONFORMANCE_FAILED`
 * with the raw detail and evidence_ref surfaced in the context.
 *
 * @param andon - The AndonReason emitted by mcpp on a Refused verdict
 * @returns A wasm4pm TypedError suitable for cross-language error handling
 */
export declare function andonToWasm4pmError(andon: McppAndonReason): TypedError;
/**
 * Reverse mapping: TypedError numeric code → best-fit mcpp AndonReason.
 *
 * This is a best-effort, lossy reverse: one ErrorCode can correspond to many
 * Andon codes. When `context.andon_code` is present (set by `andonToWasm4pmError`),
 * it is used directly to reconstruct the original AndonReason. Otherwise the
 * most general `mcpp:` code for the error category is returned.
 *
 * @param err - A wasm4pm TypedError (possibly originally from an Andon refusal)
 * @returns An McppAndonReason approximating the original refusal
 */
export declare function wasm4pmErrorToAndon(err: TypedError): McppAndonReason;
/**
 * Type guard: returns true iff `code` is one of the 19 closed mcpp: codes.
 */
export declare function isMcppAndonCode(code: string): code is McppAndonCode;
//# sourceMappingURL=andon-bridge.d.ts.map