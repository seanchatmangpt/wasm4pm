/**
 * Result Type - Enhanced for ErrorDetails
 *
 * Represents the outcome of an operation that can either succeed or fail.
 * Used throughout contracts to provide consistent error handling.
 * Supports both simple string errors and structured ErrorDetails objects (PRD §14).
 */

import type { ErrorInfo as ErrorDetails } from './errors.js';

/**
 * Success result wrapping a value of type T
 */
export interface Ok<T> {
  type: 'ok';
  value: T;
}

/**
 * Error result wrapping an error message (simple string variant)
 */
export interface Err {
  type: 'err';
  error: string;
}

/**
 * Error result wrapping structured error info (PRD §14)
 */
export interface ErrorResult {
  type: 'error';
  error: ErrorDetails;
}

/**
 * Result type: Either Ok<T>, Err (string), or ErrorResult (structured)
 * Supports both legacy string errors and structured errors with remediation
 */
export type Result<T> = Ok<T> | Err | ErrorResult;

// Re-export ErrorDetails as ErrorInfo for compatibility
export type { ErrorDetails as ErrorInfo };

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
 * @returns true if Ok, false if Err
 */
export function isOk<T>(result: Result<T>): result is Ok<T> {
  return result.type === 'ok';
}

/**
 * Check if result is Err
 *
 * @param result Result to check
 * @returns true if Err, false if Ok
 */
export function isErr<T>(result: Result<T>): result is Err {
  return result.type === 'err';
}

/**
 * Extract value from Ok or throw Error for Err
 *
 * @param result Result to unwrap
 * @returns The wrapped value if Ok
 * @throws Error if Err
 */
export function unwrap<T>(result: Result<T>): T {
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
export function unwrapOr<T>(result: Result<T>, defaultValue: T): T {
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
export function error(errorInfo: ErrorDetails): ErrorResult {
  return { type: 'error', error: errorInfo };
}

/**
 * Type guard for structured ErrorResult
 *
 * @param result Result to check
 * @returns true if result is structured error, false otherwise
 */
export function isError<T>(result: Result<T>): result is ErrorResult {
  return result.type === 'error';
}

/**
 * Type guard for string error (Err)
 *
 * @param result Result to check
 * @returns true if result is string error, false otherwise
 */
export function isStringError<T>(result: Result<T>): result is Err {
  return result.type === 'err';
}

/**
 * Get error exit code if result is an error, undefined otherwise
 *
 * @param result Result to check
 * @returns Exit code from ErrorDetails, or undefined if Ok
 */
export function getExitCode<T>(result: Result<T>): number | undefined {
  if (isError(result)) {
    return result.error.exit_code;
  }
  return undefined;
}
