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

import { type ErrorCode, type TypedError, TYPED_ERROR_CODES } from './errors.js';

// ---------------------------------------------------------------------------
// McppAndonReason type
// ---------------------------------------------------------------------------

/**
 * Refusal record emitted by mcpp on every Refused verdict.
 *
 * `namespace` is one of:
 *   - `"mcpp"` — closed namespace, 19 V1 codes
 *   - `"onto"` — opt-in server namespace, opaque codes
 *   - `"extension/<vendor>"` — open vendor-defined codes
 */
export type McppAndonReason = {
  namespace: string;
  code: string;
  detail?: string;
  evidence_ref?: string;
};

// ---------------------------------------------------------------------------
// All 19 closed mcpp: codes (from AndonReasonCode::ALL in andon.rs)
// ---------------------------------------------------------------------------

/**
 * The 19 V1 codes in the closed `mcpp:` namespace, in priority order
 * (most-specific first, matching the verdict engine chain).
 */
export const MCPP_ANDON_CODES = [
  // Conformance (11)
  'ActivityOnlyFakeRoute',
  'RouteConformanceGap',
  'MissingRequiredStages',
  'RouteSequenceMismatch',
  'PartialOrderViolation',
  'LifecycleNotTerminated',
  'CardinalityViolation',
  'ObjectLifecycleViolation',
  'ReceiptSchemaViolation',
  'InsufficientReceiptCoverage',
  'TestRouteIncomplete',
  // Envelope (5)
  'VersionMismatch',
  'PartNotFound',
  'PolicyDowngradeRejected',
  'InputHashMismatch',
  'ManifestUnsigned',
  // Gap-closure refusals (3) — v26.5.16 Slice B
  'EvidenceContinuityGap',
  'GapClosureUnauthorized',
  'GapClosureExhausted',
] as const;

export type McppAndonCode = (typeof MCPP_ANDON_CODES)[number];

// ---------------------------------------------------------------------------
// ANDON_TO_ERROR_CODE — mapping table (all 19 mcpp: codes)
// ---------------------------------------------------------------------------

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
export const ANDON_TO_ERROR_CODE: Record<McppAndonCode, ErrorCode> = {
  // ── Conformance (11) → CONFORMANCE_FAILED ──────────────────────────────
  ActivityOnlyFakeRoute:       'CONFORMANCE_FAILED',
  RouteConformanceGap:         'CONFORMANCE_FAILED',
  MissingRequiredStages:       'CONFORMANCE_FAILED',
  RouteSequenceMismatch:       'CONFORMANCE_FAILED',
  PartialOrderViolation:       'CONFORMANCE_FAILED',
  LifecycleNotTerminated:      'CONFORMANCE_FAILED',
  CardinalityViolation:        'CONFORMANCE_FAILED',
  ObjectLifecycleViolation:    'CONFORMANCE_FAILED',
  ReceiptSchemaViolation:      'CONFORMANCE_FAILED',
  InsufficientReceiptCoverage: 'CONFORMANCE_FAILED',
  TestRouteIncomplete:         'CONFORMANCE_FAILED',

  // ── Envelope (5) — mixed targets ───────────────────────────────────────
  VersionMismatch:          'SOURCE_INVALID',       // incompatible schema version
  PartNotFound:             'SOURCE_NOT_FOUND',     // required artifact absent
  PolicyDowngradeRejected:  'VALIDATION_FAILED',    // policy envelope rejected
  InputHashMismatch:        'VALIDATION_FAILED',    // tampered/corrupt input
  ManifestUnsigned:         'VALIDATION_FAILED',    // missing signature

  // ── Gap-closure (3) — v26.5.16 Slice B ─────────────────────────────────
  EvidenceContinuityGap:   'ALGORITHM_FAILED',      // no alternate evidence resolved
  GapClosureUnauthorized:  'VALIDATION_FAILED',     // authority constraint violated
  GapClosureExhausted:     'ALGORITHM_FAILED',      // max retries reached
};

// ---------------------------------------------------------------------------
// Remediation messages per Andon code
// ---------------------------------------------------------------------------

const ANDON_REMEDIATIONS: Record<McppAndonCode, string> = {
  ActivityOnlyFakeRoute:
    'The route contains only synthetic/fake activities with no real work evidence. ' +
    'Provide a route with at least one activity backed by a verifiable OCEL event.',
  RouteConformanceGap:
    'The observed event log does not conform to the declared process model. ' +
    'Check fitness/precision scores and align the model with the actual execution.',
  MissingRequiredStages:
    'One or more mandatory stages are absent from the route. ' +
    'Ensure all required stages are present and evidenced in the event log.',
  RouteSequenceMismatch:
    'Activities are executed out of the declared order. ' +
    'Correct the execution order to match the process model.',
  PartialOrderViolation:
    'The partial order constraints between activities are violated. ' +
    'Verify that concurrent activities respect declared happens-before relationships.',
  LifecycleNotTerminated:
    'An object lifecycle is open (started but never reached a terminal state). ' +
    'Ensure all objects reach a terminal lifecycle state before route completion.',
  CardinalityViolation:
    'An activity or object occurs more or fewer times than declared. ' +
    'Fix the cardinality bounds in the model or correct the execution evidence.',
  ObjectLifecycleViolation:
    'An object transitioned through an illegal lifecycle state sequence. ' +
    'Review the object lifecycle model and correct the state transition.',
  ReceiptSchemaViolation:
    'The receipt does not conform to the required schema. ' +
    'Regenerate the receipt using the current schema version.',
  InsufficientReceiptCoverage:
    'The receipt does not cover all required activities or objects. ' +
    'Ensure receipt coverage spans the full route scope.',
  TestRouteIncomplete:
    'The test/validation route is incomplete. ' +
    'Complete all required test stages before submitting for admission.',

  VersionMismatch:
    'The manifest or receipt schema version is incompatible with this mcpp release. ' +
    'Upgrade the source to the required schema version.',
  PartNotFound:
    'A part referenced in the manifest could not be found. ' +
    'Verify that all referenced parts are present in the input set.',
  PolicyDowngradeRejected:
    'A policy downgrade was attempted but is not permitted. ' +
    'Use a policy version at or above the currently enforced minimum.',
  InputHashMismatch:
    'The input hash does not match the declared value — the input may be corrupt or tampered. ' +
    'Verify input integrity and resubmit with a correct hash.',
  ManifestUnsigned:
    'The manifest lacks a required Ed25519 signature. ' +
    'Sign the manifest with the authorized signing key before submission.',

  EvidenceContinuityGap:
    'An evidence continuity gap was detected and all alternate-evidence attempts were exhausted. ' +
    'Provide continuous evidence across the gap or add an approved alternate evidence source.',
  GapClosureUnauthorized:
    'Gap closure was attempted by a source not on the route permit-list. ' +
    'Use an authorized gap-closure source listed in the route gap_closure_authority.',
  GapClosureExhausted:
    'Maximum retry count for alternate-evidence gap closure was reached with no resolution. ' +
    'Investigate the evidence gap and provide direct evidence rather than relying on gap closure.',
};

// ---------------------------------------------------------------------------
// andonToWasm4pmError — forward mapping
// ---------------------------------------------------------------------------

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
export function andonToWasm4pmError(andon: McppAndonReason): TypedError {
  // Resolve ErrorCode for known mcpp: codes
  let errorCode: ErrorCode;
  let remediation: string;

  if (andon.namespace === 'mcpp' && isMcppAndonCode(andon.code)) {
    const code = andon.code as McppAndonCode;
    errorCode = ANDON_TO_ERROR_CODE[code];
    remediation = ANDON_REMEDIATIONS[code];
  } else {
    // Extension, onto, or unknown namespace — best-effort fallback
    errorCode = 'CONFORMANCE_FAILED';
    remediation =
      `mcpp refusal from namespace "${andon.namespace}" code "${andon.code}". ` +
      'Consult the mcpp documentation for this namespace and code.';
  }

  const context: Record<string, unknown> = {
    andon_namespace: andon.namespace,
    andon_code: andon.code,
  };
  if (andon.detail !== undefined) {
    context['andon_detail'] = andon.detail;
  }
  if (andon.evidence_ref !== undefined) {
    context['andon_evidence_ref'] = andon.evidence_ref;
  }

  return {
    schema_version: '1.0',
    code: TYPED_ERROR_CODES[errorCode],
    message: buildMessage(andon),
    remediation,
    context,
  };
}

// ---------------------------------------------------------------------------
// wasm4pmErrorToAndon — reverse mapping (best-effort)
// ---------------------------------------------------------------------------

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
export function wasm4pmErrorToAndon(err: TypedError): McppAndonReason {
  // If the error was created by andonToWasm4pmError, the original Andon fields
  // are preserved in context — use them for a lossless round-trip.
  if (
    typeof err.context['andon_namespace'] === 'string' &&
    typeof err.context['andon_code'] === 'string'
  ) {
    return {
      namespace: err.context['andon_namespace'],
      code: err.context['andon_code'],
      detail: typeof err.context['andon_detail'] === 'string'
        ? err.context['andon_detail']
        : undefined,
      evidence_ref: typeof err.context['andon_evidence_ref'] === 'string'
        ? err.context['andon_evidence_ref']
        : undefined,
    };
  }

  // Otherwise, fall back to the most representative mcpp: code for each
  // wasm4pm ErrorCode category.
  const fallback = NUMERIC_TO_ANDON_FALLBACK[err.code];
  if (fallback !== undefined) {
    return {
      namespace: 'mcpp',
      code: fallback,
      detail: err.message,
    };
  }

  // Unknown numeric code — emit a generic extension reason
  return {
    namespace: 'extension/wasm4pm',
    code: `numeric_${err.code}`,
    detail: err.message,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Type guard: returns true iff `code` is one of the 19 closed mcpp: codes.
 */
export function isMcppAndonCode(code: string): code is McppAndonCode {
  return (MCPP_ANDON_CODES as readonly string[]).includes(code);
}

/**
 * Build a human-readable message from an AndonReason.
 */
function buildMessage(andon: McppAndonReason): string {
  const base = `mcpp refusal [${andon.namespace}:${andon.code}]`;
  return andon.detail ? `${base}: ${andon.detail}` : base;
}

/**
 * Best-effort fallback: wasm4pm numeric error code → representative mcpp: Andon code.
 * Used by `wasm4pmErrorToAndon` when context does not carry original Andon fields.
 */
const NUMERIC_TO_ANDON_FALLBACK: Record<number, McppAndonCode> = {
  [TYPED_ERROR_CODES.CONFORMANCE_FAILED]: 'RouteConformanceGap',
  [TYPED_ERROR_CODES.VALIDATION_FAILED]:  'ManifestUnsigned',
  [TYPED_ERROR_CODES.ALGORITHM_FAILED]:   'EvidenceContinuityGap',
  [TYPED_ERROR_CODES.SOURCE_NOT_FOUND]:   'PartNotFound',
  [TYPED_ERROR_CODES.SOURCE_INVALID]:     'VersionMismatch',
};
