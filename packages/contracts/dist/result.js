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
 * @returns true if Ok, false if Err
 */
export function isOk(result) {
    return result.type === 'ok';
}
/**
 * Check if result is Err
 *
 * @param result Result to check
 * @returns true if Err, false if Ok
 */
export function isErr(result) {
    return result.type === 'err';
}
/**
 * Extract value from Ok or throw Error for Err
 *
 * @param result Result to unwrap
 * @returns The wrapped value if Ok
 * @throws Error if Err
 */
export function unwrap(result) {
    if (result.type === 'ok') {
        return result.value;
    }
    throw new Error(`Unwrap failed: ${result.error}`);
}
/**
 * Extract value from Ok, returning default for Err
 *
 * @param result Result to unwrap
 * @param defaultValue Default value if Err
 * @returns The wrapped value if Ok, or defaultValue if Err
 */
export function unwrapOr(result, defaultValue) {
    if (result.type === 'ok') {
        return result.value;
    }
    return defaultValue;
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
 * Type guard for structured ErrorResult
 *
 * @param result Result to check
 * @returns true if result is structured error, false otherwise
 */
export function isError(result) {
    return result.type === 'error';
}
/**
 * Type guard for string error (Err)
 *
 * @param result Result to check
 * @returns true if result is string error, false otherwise
 */
export function isStringError(result) {
    return result.type === 'err';
}
/**
 * Get error exit code if result is an error, undefined otherwise
 *
 * @param result Result to check
 * @returns Exit code from ErrorDetails, or undefined if Ok
 */
export function getExitCode(result) {
    if (isError(result)) {
        return result.error.exit_code;
    }
    return undefined;
}
//# sourceMappingURL=result.js.map