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
 * Supports both legacy string errors and structured errors with remediation
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
 * @returns true if Ok, false if Err
 */
export function isOk<T>(result: Result<T>): result is Ok<T> {
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
export function error(errorInfo: ErrorDetails): ErrorResult {
  return { type: 'error', error: errorInfo };
}

