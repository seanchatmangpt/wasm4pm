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
export declare function ok<T>(value: T): Ok<T>;
/**
 * Create an error result
 *
 * @param error The error message
 * @returns Err result
 */
export declare function err(error: string): Err;
/**
 * Check if result is Ok
 *
 * @param result Result to check
 * @returns true if Ok, false if Err or ErrorResult
 */
export declare function isOk<T>(result: Result<T>): result is Ok<T>;
/**
 * Check if result is a simple string Err
 *
 * @param result Result to check
 * @returns true if Err (string error), false otherwise
 */
export declare function isErr<T>(result: Result<T>): result is Err;
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
export declare function isError<T>(result: Result<T>): result is ErrorResult;
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
export declare function error(errorInfo: ErrorDetails): ErrorResult;
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
export declare function isFailure<T>(result: Result<T>): result is Err | ErrorResult;
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
export declare function unwrapOr<T>(result: Result<T>, fallback: T): T;
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
export declare function unwrap<T>(result: Result<T>): T;
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
export declare function getExitCode<T>(result: Result<T>): number | undefined;
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
export declare function isPartialFailure<T>(result: Result<T>): boolean;
/**
 * Alias for `isError` — checks whether a result carries a structured ErrorResult.
 *
 * Provided for discoverability; callers who think in terms of "does this have an
 * error object?" will find `hasError` more natural than `isError`.
 *
 * @param result Result to check
 * @returns true if result is a structured ErrorResult
 */
export declare function hasError<T>(result: Result<T>): result is ErrorResult;
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
export declare function mapResult<T, U>(result: Result<T>, fn: (value: T) => U): Result<U>;
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
export declare function deriveLatencyClass(latency_ms: number): LatencyClass;
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
export declare const ProvenanceChainSchema: z.ZodObject<{
    input_hash: z.ZodString;
    config_hash: z.ZodString;
    plan_hash: z.ZodString;
    output_hash: z.ZodString;
    combined_hash: z.ZodString;
    algorithm_id: z.ZodString;
    algorithm_version: z.ZodString;
    backend_id: z.ZodString;
    kernel_version: z.ZodString;
    wasm_build_hash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    config_hash: string;
    input_hash: string;
    plan_hash: string;
    output_hash: string;
    algorithm_id: string;
    combined_hash: string;
    algorithm_version: string;
    backend_id: string;
    kernel_version: string;
    wasm_build_hash: string;
}, {
    config_hash: string;
    input_hash: string;
    plan_hash: string;
    output_hash: string;
    algorithm_id: string;
    combined_hash: string;
    algorithm_version: string;
    backend_id: string;
    kernel_version: string;
    wasm_build_hash: string;
}>;
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
export declare const ResultEnvelopeSchema: z.ZodObject<{
    run_id: z.ZodString;
    status: z.ZodEnum<["success", "partial", "failed"]>;
    payload: z.ZodUnknown;
    error: z.ZodOptional<z.ZodString>;
    latency_ms: z.ZodNumber;
    latency_class: z.ZodEnum<["sub_ms", "low_ms", "high_ms", "seconds", "minutes"]>;
    backend_id: z.ZodString;
    invocation_id: z.ZodString;
    cycle_seq: z.ZodNumber;
    algorithm_id: z.ZodString;
    model_ir: z.ZodOptional<z.ZodUnknown>;
    provenance: z.ZodObject<{
        input_hash: z.ZodString;
        config_hash: z.ZodString;
        plan_hash: z.ZodString;
        output_hash: z.ZodString;
        combined_hash: z.ZodString;
        algorithm_id: z.ZodString;
        algorithm_version: z.ZodString;
        backend_id: z.ZodString;
        kernel_version: z.ZodString;
        wasm_build_hash: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        config_hash: string;
        input_hash: string;
        plan_hash: string;
        output_hash: string;
        algorithm_id: string;
        combined_hash: string;
        algorithm_version: string;
        backend_id: string;
        kernel_version: string;
        wasm_build_hash: string;
    }, {
        config_hash: string;
        input_hash: string;
        plan_hash: string;
        output_hash: string;
        algorithm_id: string;
        combined_hash: string;
        algorithm_version: string;
        backend_id: string;
        kernel_version: string;
        wasm_build_hash: string;
    }>;
    stale: z.ZodOptional<z.ZodBoolean>;
    stale_age_ms: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status: "success" | "partial" | "failed";
    run_id: string;
    algorithm_id: string;
    backend_id: string;
    latency_ms: number;
    latency_class: "sub_ms" | "low_ms" | "high_ms" | "seconds" | "minutes";
    invocation_id: string;
    cycle_seq: number;
    provenance: {
        config_hash: string;
        input_hash: string;
        plan_hash: string;
        output_hash: string;
        algorithm_id: string;
        combined_hash: string;
        algorithm_version: string;
        backend_id: string;
        kernel_version: string;
        wasm_build_hash: string;
    };
    error?: string | undefined;
    payload?: unknown;
    model_ir?: unknown;
    stale?: boolean | undefined;
    stale_age_ms?: number | undefined;
}, {
    status: "success" | "partial" | "failed";
    run_id: string;
    algorithm_id: string;
    backend_id: string;
    latency_ms: number;
    latency_class: "sub_ms" | "low_ms" | "high_ms" | "seconds" | "minutes";
    invocation_id: string;
    cycle_seq: number;
    provenance: {
        config_hash: string;
        input_hash: string;
        plan_hash: string;
        output_hash: string;
        algorithm_id: string;
        combined_hash: string;
        algorithm_version: string;
        backend_id: string;
        kernel_version: string;
        wasm_build_hash: string;
    };
    error?: string | undefined;
    payload?: unknown;
    model_ir?: unknown;
    stale?: boolean | undefined;
    stale_age_ms?: number | undefined;
}>;
export type ResultEnvelope<T = unknown> = Omit<z.infer<typeof ResultEnvelopeSchema>, 'payload'> & {
    payload: T;
};
/**
 * Guard function to check if a value is a valid ProvenanceChain.
 *
 * Validates that all 9 required fields are present and non-empty.
 *
 * @param value The value to check
 * @returns true if value is a valid ProvenanceChain, false otherwise
 */
export declare function isProvenanceChain(value: unknown): value is ProvenanceChain;
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
export declare function isResultEnvelope<T = unknown>(value: unknown): value is ResultEnvelope<T>;
export {};
//# sourceMappingURL=result.d.ts.map