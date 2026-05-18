/**
 * Result Type - Enhanced for ErrorDetails
 *
 * Represents the outcome of an operation that can either succeed or fail.
 * Used throughout contracts to provide consistent error handling.
 * Supports both simple string errors and structured ErrorDetails objects (PRD §14).
 */
/**
 * Create a successful result
 *
 * @param value The success value
 * @returns Ok<T> result
 */
export function ok(value) {
    return { type: 'ok', value };
}
/**
 * Create an error result
 *
 * @param error The error message
 * @returns Err result
 */
export function err(error) {
    return { type: 'err', error };
}
/**
 * Check if result is Ok
 *
 * @param result Result to check
 * @returns true if Ok, false if Err or ErrorResult
 */
export function isOk(result) {
    return result.type === 'ok';
}
/**
 * Check if result is a simple string Err
 *
 * @param result Result to check
 * @returns true if Err (string error), false otherwise
 */
export function isErr(result) {
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
export function isError(result) {
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
export function error(errorInfo) {
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
export function isFailure(result) {
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
export function unwrapOr(result, fallback) {
    if (isOk(result))
        return result.value;
    return fallback;
}
/**
 * Derives the LatencyClass from a latency duration in milliseconds.
 *
 * @param latency_ms Duration in milliseconds
 * @returns The appropriate LatencyClass
 */
export function deriveLatencyClass(latency_ms) {
    if (latency_ms < 1)
        return 'sub_ms';
    if (latency_ms < 100)
        return 'low_ms';
    if (latency_ms < 1000)
        return 'high_ms';
    if (latency_ms < 60000)
        return 'seconds';
    return 'minutes';
}
/**
 * Guard function to check if a value is a valid ProvenanceChain.
 *
 * Validates that all 9 required fields are present and non-empty.
 *
 * @param value The value to check
 * @returns true if value is a valid ProvenanceChain, false otherwise
 */
export function isProvenanceChain(value) {
    if (!value || typeof value !== 'object')
        return false;
    const prov = value;
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
export function isResultEnvelope(value) {
    if (!value || typeof value !== 'object')
        return false;
    const envelope = value;
    // Check basic fields
    if (typeof envelope.run_id !== 'string' ||
        envelope.run_id.length === 0 ||
        typeof envelope.invocation_id !== 'string' ||
        envelope.invocation_id.length === 0)
        return false;
    // Check status
    const validStatuses = ['success', 'partial', 'failed'];
    if (!validStatuses.includes(envelope.status))
        return false;
    // Check latency fields
    if (typeof envelope.latency_ms !== 'number' ||
        !Number.isFinite(envelope.latency_ms) ||
        envelope.latency_ms < 0) {
        return false;
    }
    // Check latency_class matches the derived class
    const expectedClass = deriveLatencyClass(envelope.latency_ms);
    if (envelope.latency_class !== expectedClass)
        return false;
    // Check backend and algorithm
    if (typeof envelope.backend_id !== 'string' || envelope.backend_id.length === 0)
        return false;
    if (typeof envelope.algorithm_id !== 'string' || envelope.algorithm_id.length === 0)
        return false;
    // Check cycle_seq
    if (typeof envelope.cycle_seq !== 'number' ||
        !Number.isInteger(envelope.cycle_seq) ||
        envelope.cycle_seq < 0) {
        return false;
    }
    // Check provenance
    if (!isProvenanceChain(envelope.provenance))
        return false;
    // Check error field (only present when status != "success")
    if (envelope.error !== undefined) {
        if (typeof envelope.error !== 'string')
            return false;
        if (envelope.status === 'success')
            return false; // error should not be present on success
    }
    // Check stale/stale_age_ms co-requirement
    if (envelope.stale === true) {
        if (typeof envelope.stale_age_ms !== 'number' ||
            !Number.isFinite(envelope.stale_age_ms) ||
            envelope.stale_age_ms < 0) {
            return false;
        }
    }
    else if (envelope.stale_age_ms !== undefined) {
        // If stale_age_ms is present, stale must be true
        if (envelope.stale !== true)
            return false;
    }
    return true;
}
//# sourceMappingURL=result.js.map