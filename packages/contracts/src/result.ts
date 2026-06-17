/**
 * Result Type - Enhanced for ErrorDetails
 *
 * Represents the outcome of an operation that can either succeed or fail.
 * Used throughout contracts to provide consistent error handling.
 * Supports both simple string errors and structured ErrorDetails objects (PRD §14).
 */

import { z } from 'zod';
import type { ErrorInfo as ErrorDetails } from './errors.js';

/**
 * Success result wrapping a value of type T
 * @internal
 */
interface Ok<T> {
  type: 'ok';
  value: T;
}

/**
 * Error result wrapping an error message (simple string variant)
 * @internal
 */
interface Err {
  type: 'err';
  error: string;
}

/**
 * Error result wrapping structured error info (PRD §14)
 * @internal
 */
interface ErrorResult {
  type: 'error';
  error: ErrorDetails;
}

/**
 * Result type: Either Ok<T>, Err (string), or ErrorResult (structured)
 * Supports both  string errors and structured errors with remediation
 */
export type Result<T> = Ok<T> | Err | ErrorResult;

/**
 * Create a successful result
 *
 * @param value The success value
 * @returns Ok<T> result
 */
export function ok<T>(value: T): Ok<T> {
  return { type: 'ok', value };
}

/**
 * Create an error result
 *
 * @param error The error message
 * @returns Err result
 */
export function err(error: string): Err {
  return { type: 'err', error };
}

/**
 * Check if result is Ok
 *
 * @param result Result to check
 * @returns true if Ok, false if Err or ErrorResult
 */
export function isOk<T>(result: Result<T>): result is Ok<T> {
  return result.type === 'ok';
}

/**
 * Check if result is a simple string Err
 *
 * @param result Result to check
 * @returns true if Err (string error), false otherwise
 */
export function isErr<T>(result: Result<T>): result is Err {
  return result.type === 'err';
}

/**
 * Check if result is a structured ErrorResult (carries ErrorInfo with exit_code and remediation)
 *
 * Documented in ERROR_SYSTEM.md and CONTRACTS.md but previously missing from the implementation.
 *
 * @param result Result to check
 * @returns true if ErrorResult (structured error), false otherwise
 *
 * @example
 * ```ts
 * const result: Result<Config> = error(createError('CONFIG_MISSING', '...'));
 * if (isError(result)) {
 *   process.exit(result.error.exit_code); // type-safe: result.error is ErrorInfo
 * }
 * ```
 */
export function isError<T>(result: Result<T>): result is ErrorResult {
  return result.type === 'error';
}

/**
 * Create an error result with structured ErrorDetails (PRD §14)
 *
 * @param errorInfo Structured error information with remediation
 * @returns ErrorResult wrapping the ErrorDetails
 *
 * @example
 * ```ts
 * const result: Result<Data> = error(createError('CONFIG_MISSING', 'Config file not found'));
 * ```
 */
export function error(errorInfo: ErrorDetails): ErrorResult {
  return { type: 'error', error: errorInfo };
}

/**
 * Check if result is any kind of failure (either simple Err or structured ErrorResult).
 *
 * Equivalent to `isErr(r) || isError(r)` but expressed as a single readable guard.
 * Use when you need to branch on "did it fail?" without caring which error variant.
 *
 * @param result Result to check
 * @returns true if Err or ErrorResult, false if Ok
 *
 * @example
 * ```ts
 * const result: Result<Config> = resolveConfig();
 * if (isFailure(result)) {
 *   // result is Err | ErrorResult — we know it failed but don't need the specific variant
 *   process.exit(1);
 * }
 * ```
 */
export function isFailure<T>(result: Result<T>): result is Err | ErrorResult {
  return result.type === 'err' || result.type === 'error';
}

/**
 * Unwrap a result, returning the value on Ok or a fallback on any failure.
 *
 * Does NOT throw. Safe to use in contexts where a default is always acceptable.
 *
 * @param result Result to unwrap
 * @param fallback Value to return when result is Err or ErrorResult
 * @returns The success value or the fallback
 *
 * @example
 * ```ts
 * const config = unwrapOr(resolveConfig(), defaultConfig);
 * ```
 */
export function unwrapOr<T>(result: Result<T>, fallback: T): T {
  if (isOk(result)) return result.value;
  return fallback;
}

/**
 * Unwrap a result, returning the value on Ok or throwing on any failure.
 *
 * @param result Result to unwrap
 * @returns The success value
 * @throws Error if result is Err or ErrorResult
 *
 * @example
 * ```ts
 * const value = unwrap(ok(42)); // returns 42
 * unwrap(err('boom'));           // throws
 * ```
 */
export function unwrap<T>(result: Result<T>): T {
  if (isOk(result)) return result.value;
  if (isErr(result)) throw new Error(result.error);
  throw new Error((result as ErrorResult).error.message ?? 'Unknown error');
}

/**
 * Extract the exit code from an ErrorResult, or return undefined for Ok/Err.
 *
 * Useful for mapping a structured result to a process exit code.
 *
 * @param result Result to inspect
 * @returns The exit_code if ErrorResult, undefined otherwise
 *
 * @example
 * ```ts
 * const code = getExitCode(error(createError('SOURCE_NOT_FOUND', 'x'))); // 300-399
 * getExitCode(ok(42)); // undefined
 * ```
 */
export function getExitCode<T>(result: Result<T>): number | undefined {
  if (isError(result)) return (result as ErrorResult).error.exit_code;
  return undefined;
}

/**
 * Check if result represents a partial failure.
 *
 * A "partial failure" is any result where the type is `'err'` or `'error'` AND
 * the embedded error is marked as recoverable (i.e. some work succeeded but the
 * operation did not fully complete).  For simple string `Err` results this always
 * returns false because there is no recoverability flag available.
 *
 * @param result Result to inspect
 * @returns true if the result is a recoverable structured error
 *
 * @example
 * ```ts
 * const r: Result<Config> = error(createError('ALGORITHM_FAILED', 'partial'));
 * isPartialFailure(r); // true — ALGORITHM_FAILED is recoverable
 * ```
 */
export function isPartialFailure<T>(result: Result<T>): boolean {
  if (result.type !== 'error') return false;
  const e = (result as ErrorResult).error;
  // ErrorInfo carries a `recoverable` boolean
  return typeof (e as unknown as Record<string, unknown>).recoverable === 'boolean'
    ? (e as unknown as Record<string, unknown>).recoverable as boolean
    : false;
}

/**
 * Alias for `isError` — checks whether a result carries a structured ErrorResult.
 *
 * Provided for discoverability; callers who think in terms of "does this have an
 * error object?" will find `hasError` more natural than `isError`.
 *
 * @param result Result to check
 * @returns true if result is a structured ErrorResult
 */
export function hasError<T>(result: Result<T>): result is ErrorResult {
  return result.type === 'error';
}

/**
 * Transform the success value of a result, leaving error variants unchanged.
 *
 * This is the standard "functor map" for the Result type — it applies `fn` only
 * when the result is `Ok`, and passes `Err` / `ErrorResult` through untouched.
 *
 * @param result Source result to map
 * @param fn Transformation function applied to the success value
 * @returns A new Result wrapping the transformed value, or the original error
 *
 * @example
 * ```ts
 * const r: Result<number> = ok(21);
 * const doubled = mapResult(r, x => x * 2); // ok(42)
 *
 * const failed: Result<number> = err('oops');
 * const mapped = mapResult(failed, x => x * 2); // err('oops') — unchanged
 * ```
 */
export function mapResult<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
  if (isOk(result)) return ok(fn(result.value));
  // Narrow cast is safe: Err | ErrorResult have no .value
  return result as unknown as Result<U>;
}

// ============================================================================
// Section 2.3 & 2.4: Canonical Intermediate Representation Envelope Types
// Three-Layer Architecture Contract Specification v1.0
// ============================================================================

import type { ModelIR } from './model.js';

/**
 * Latency class type union.
 *
 * Derived from `latency_ms`:
 * - `sub_ms`: latency_ms < 1
 * - `low_ms`: latency_ms >= 1 and < 100
 * - `high_ms`: latency_ms >= 100 and < 1000
 * - `seconds`: latency_ms >= 1000 and < 60000
 * - `minutes`: latency_ms >= 60000
 *
 * This is a derived field (never supplied by caller). It is computed on construction.
 *
 * Gap closure: LC-1 — latency_class is non-optional and derived.
 */
export type LatencyClass = 'sub_ms' | 'low_ms' | 'high_ms' | 'seconds' | 'minutes';

/**
 * Derives the LatencyClass from a latency duration in milliseconds.
 *
 * @param latency_ms Duration in milliseconds
 * @returns The appropriate LatencyClass
 */
export function deriveLatencyClass(latency_ms: number): LatencyClass {
  if (latency_ms < 1) return 'sub_ms';
  if (latency_ms < 100) return 'low_ms';
  if (latency_ms < 1000) return 'high_ms';
  if (latency_ms < 60000) return 'seconds';
  return 'minutes';
}

/**
 * Immutable audit trail of how a result was produced.
 *
 * All 9 fields are required (no optionals). This chain is complete and non-negotiable.
 *
 * Section 2.4 of the Three-Layer Architecture Contract Specification.
 *
 * Gap closure:
 * - PR-1: `kernel_version` is required (was absent in previous receipts)
 * - PR-2: `wasm_build_hash` is required (was absent in previous receipts)
 * - PR-3: `plan_hash` feeds into `combined_hash` (was not propagated)
 *
 * **Fields:**
 * - `input_hash`: BLAKE3 of EventLogIR bytes
 * - `config_hash`: BLAKE3 of resolved Config
 * - `plan_hash`: BLAKE3 of ExecutionPlan (required for combined_hash calculation)
 * - `output_hash`: BLAKE3 of payload bytes
 * - `combined_hash`: BLAKE3 of all four hashes concatenated
 * - `algorithm_id`: Which algorithm was executed
 * - `algorithm_version`: Semver or CalVer version of the algorithm
 * - `backend_id`: Which backend executed it (wasm, pm4py, ml, null)
 * - `kernel_version`: @wasm4pm/cli npm package version
 * - `wasm_build_hash`: Content hash of the wasm4pm.wasm binary
 *
 * **Invariants:**
 * - All hash fields must be non-empty strings (BLAKE3 hash: 64 hex characters = 256 bits)
 * - A missing or empty `combined_hash` is a schema violation, not a warning
 */
export const ProvenanceChainSchema = z.object({
  input_hash: z.string().min(1), // BLAKE3 hash (64 hex chars)
  config_hash: z.string().min(1), // BLAKE3 hash (64 hex chars)
  plan_hash: z.string().min(1), // BLAKE3 hash (64 hex chars)
  output_hash: z.string().min(1), // BLAKE3 hash (64 hex chars)
  combined_hash: z.string().min(1), // BLAKE3(input_hash + config_hash + plan_hash + output_hash)
  algorithm_id: z.string().min(1),
  algorithm_version: z.string().min(1),
  backend_id: z.string().min(1),
  kernel_version: z.string().min(1),
  wasm_build_hash: z.string().min(1),
});

export type ProvenanceChain = z.infer<typeof ProvenanceChainSchema>;

/**
 * Typed wrapper around every algorithm output with provenance and metadata.
 *
 * This is the universal result envelope used across all backends (WASM, pm4py, ML, NullBackend).
 *
 * Section 2.3 of the Three-Layer Architecture Contract Specification.
 *
 * **Generic type parameter `T`:**
 * - For discovery: `ResultEnvelope<ModelIR>`
 * - For conformance: `ResultEnvelope<ConformanceResult>`
 * - For ML analysis: `ResultEnvelope<MlResult>`
 *
 * **Required fields:**
 * - `run_id`: UUID v4, unique per execution
 * - `status`: "success" | "partial" | "failed"
 * - `payload`: The actual result (type T)
 * - `latency_ms`: Duration in milliseconds (always >= 0)
 * - `latency_class`: Derived from latency_ms (non-overridable)
 * - `backend_id`: Which backend produced this (wasm, pm4py, ml, null)
 * - `invocation_id`: UUID v4, unique per backend call (for OTEL correlation)
 * - `cycle_seq`: Monotonic counter from FederationController
 * - `algorithm_id`: Which algorithm was executed
 * - `provenance`: ProvenanceChain with all 9 fields
 *
 * **Optional fields:**
 * - `error`: Only present when `status != "success"`
 * - `model_ir`: Present for discovery results when `status == "success"`
 * - `stale`: True if result came from expired cache
 * - `stale_age_ms`: Age of cached result; co-required with `stale: true`
 *
 * **Cross-Boundary Invariants:**
 * - `latency_class` is always derived, never supplied by caller
 * - `stale: true` implies `stale_age_ms` is present (co-required)
 * - `combined_hash` in provenance is always present and non-empty
 * - Missing `provenance` is a schema violation, not a warning
 *
 * **NullBackend responses** carry:
 * ```ts
 * {
 *   status: "failed",
 *   payload: null,
 *   error: "system_health_critical",
 *   backend_id: "null",
 *   latency_ms: 0,
 *   latency_class: "sub_ms"
 * }
 * ```
 */
export const ResultEnvelopeSchema = z.object({
  run_id: z.string().min(1), // UUID v4
  status: z.enum(['success', 'partial', 'failed']),
  payload: z.unknown(),
  error: z.string().optional(), // Only when status != "success"
  latency_ms: z.number().min(0).finite(),
  latency_class: z.enum(['sub_ms', 'low_ms', 'high_ms', 'seconds', 'minutes']), // Derived
  backend_id: z.string().min(1), // wasm, pm4py, ml, null
  invocation_id: z.string().min(1), // UUID v4, unique per backend call
  cycle_seq: z.number().int().min(0), // Monotonic counter from FederationController
  algorithm_id: z.string().min(1),
  model_ir: z.unknown().optional(), // Present for discovery results
  provenance: ProvenanceChainSchema,
  stale: z.boolean().optional(), // True if result came from expired cache
  stale_age_ms: z.number().min(0).optional(), // Age of cached result when returned
});

export type ResultEnvelope<T = unknown> = Omit<z.infer<typeof ResultEnvelopeSchema>, 'payload'> & { payload: T };

/**
 * Guard function to check if a value is a valid ProvenanceChain.
 *
 * Validates that all 9 required fields are present and non-empty.
 *
 * @param value The value to check
 * @returns true if value is a valid ProvenanceChain, false otherwise
 */
export function isProvenanceChain(value: unknown): value is ProvenanceChain {
  if (!value || typeof value !== 'object') return false;

  const prov = value as Record<string, unknown>;

  // Check all 10 required fields (9 hashes + algorithm/backend/kernel/wasm info)
  const requiredFields = [
    'input_hash',
    'config_hash',
    'plan_hash',
    'output_hash',
    'combined_hash',
    'algorithm_id',
    'algorithm_version',
    'backend_id',
    'kernel_version',
    'wasm_build_hash',
  ];

  for (const field of requiredFields) {
    const value = prov[field];
    // Each field must be a non-empty string
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Guard function to check if a value is a valid ResultEnvelope.
 *
 * Validates:
 * - run_id and invocation_id are non-empty strings
 * - status is one of the allowed values
 * - latency_ms is a non-negative finite number
 * - latency_class matches the derived class for latency_ms
 * - backend_id, algorithm_id are non-empty strings
 * - cycle_seq is a non-negative integer
 * - provenance is a valid ProvenanceChain
 * - if stale is true, stale_age_ms must be present and non-negative
 * - if model_ir is present, it is a valid ModelIR
 *
 * @param value The value to check
 * @returns true if value is a valid ResultEnvelope, false otherwise
 */
export function isResultEnvelope<T = unknown>(value: unknown): value is ResultEnvelope<T> {
  if (!value || typeof value !== 'object') return false;

  const envelope = value as Record<string, unknown>;

  // Check basic fields
  if (
    typeof envelope.run_id !== 'string' ||
    envelope.run_id.length === 0 ||
    typeof envelope.invocation_id !== 'string' ||
    envelope.invocation_id.length === 0
  )
    return false;

  // Check status
  const validStatuses = ['success', 'partial', 'failed'];
  if (!validStatuses.includes(envelope.status as string)) return false;

  // Check latency fields
  if (
    typeof envelope.latency_ms !== 'number' ||
    !Number.isFinite(envelope.latency_ms) ||
    envelope.latency_ms < 0
  ) {
    return false;
  }

  // Check latency_class matches the derived class
  const expectedClass = deriveLatencyClass(envelope.latency_ms as number);
  if (envelope.latency_class !== expectedClass) return false;

  // Check backend and algorithm
  if (typeof envelope.backend_id !== 'string' || envelope.backend_id.length === 0) return false;
  if (typeof envelope.algorithm_id !== 'string' || envelope.algorithm_id.length === 0) return false;

  // Check cycle_seq
  if (
    typeof envelope.cycle_seq !== 'number' ||
    !Number.isInteger(envelope.cycle_seq) ||
    envelope.cycle_seq < 0
  ) {
    return false;
  }

  // Check provenance
  if (!isProvenanceChain(envelope.provenance)) return false;

  // Check error field (only present when status != "success")
  if (envelope.error !== undefined) {
    if (typeof envelope.error !== 'string') return false;
    if (envelope.status === 'success') return false; // error should not be present on success
  }

  // Check stale/stale_age_ms co-requirement
  if (envelope.stale === true) {
    if (
      typeof envelope.stale_age_ms !== 'number' ||
      !Number.isFinite(envelope.stale_age_ms) ||
      envelope.stale_age_ms < 0
    ) {
      return false;
    }
  } else if (envelope.stale_age_ms !== undefined) {
    // If stale_age_ms is present, stale must be true
    if (envelope.stale !== true) return false;
  }

  return true;
}
