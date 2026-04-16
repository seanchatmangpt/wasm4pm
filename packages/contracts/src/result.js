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
//# sourceMappingURL=result.js.map