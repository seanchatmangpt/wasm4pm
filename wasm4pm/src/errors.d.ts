/**
 * Error Model for pictl Engine
 * Provides comprehensive error handling with classification, context, and recovery guidance
 */
/**
 * Error codes for pictl operations
 * Used to classify and handle errors consistently across the engine
 */
export declare enum ErrorCode {
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_INCOMPLETE = 'CONFIG_INCOMPLETE',
  CONFIG_TYPE_MISMATCH = 'CONFIG_TYPE_MISMATCH',
  SOURCE_UNAVAILABLE = 'SOURCE_UNAVAILABLE',
  SOURCE_EMPTY = 'SOURCE_EMPTY',
  SOURCE_TOO_LARGE = 'SOURCE_TOO_LARGE',
  PARSE_FAILED = 'PARSE_FAILED',
  FORMAT_UNSUPPORTED = 'FORMAT_UNSUPPORTED',
  SCHEMA_VIOLATION = 'SCHEMA_VIOLATION',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  HANDLE_NOT_FOUND = 'HANDLE_NOT_FOUND',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  RESOURCE_LIMIT_EXCEEDED = 'RESOURCE_LIMIT_EXCEEDED',
  STATE_CORRUPTED = 'STATE_CORRUPTED',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  UNKNOWN = 'UNKNOWN',
}
/**
 * Describes the next action the caller should take to recover from an error
 */
export declare enum ErrorRecovery {
  RETRY = 'RETRY',
  RECONFIGURE = 'RECONFIGURE',
  REDUCE_SCOPE = 'REDUCE_SCOPE',
  VALIDATE_INPUT = 'VALIDATE_INPUT',
  FREE_RESOURCES = 'FREE_RESOURCES',
  REINITIALIZE = 'REINITIALIZE',
  CONTACT_SUPPORT = 'CONTACT_SUPPORT',
}
/**
 * Enhanced error class with structured context for pictl operations
 * Extends Error with error classification, root cause tracking, and recovery guidance
 */
export declare class PictlError extends Error {
  readonly code: ErrorCode;
  readonly cause: Error | null;
  readonly nextAction: ErrorRecovery;
  readonly step: string | null;
  readonly context: Record<string, unknown>;
  readonly timestamp: Date;
  constructor(
    message: string,
    code?: ErrorCode,
    options?: {
      cause?: Error | null;
      nextAction?: ErrorRecovery;
      step?: string;
      context?: Record<string, unknown>;
    }
  );
  /**
   * Returns a detailed error summary for logging and debugging
   */
  toJSON(): {
    name: string;
    message: string;
    code: ErrorCode;
    step: string | null;
    nextAction: ErrorRecovery;
    context: Record<string, unknown>;
    timestamp: string;
    cause: {
      message: string;
      stack: string | undefined;
    } | null;
    stack: string | undefined;
  };
  /**
   * Returns a user-friendly error message
   */
  toString(): string;
}
/**
 * Classifies raw WASM error strings to ErrorCode
 * Maps common error patterns to structured error codes for consistent handling
 *
 * @param raw - Raw error string from WASM module
 * @param context - Optional context including the execution step
 * @returns ErrorCode matching the error pattern
 */
export declare function classifyPictlError(
  raw: string,
  context?: {
    step?: string;
  }
): ErrorCode;
/**
 * Wraps a WASM function call with error handling and classification
 * Converts raw WASM errors to structured PictlError instances
 *
 * @template T - Return type of the wrapped function
 * @param fn - Function that calls WASM code
 * @param context - Optional context including the execution step
 * @returns Result of the function call
 * @throws PictlError - Classified and contextualized error
 */
export declare function wrapPictlOperation<T>(
  fn: () => T,
  context?: {
    step?: string;
  }
): T;
/**
 * Type guard to check if an error is a PictlError
 * Optionally filters by specific error code
 *
 * @param err - Error to check
 * @param code - Optional specific ErrorCode to match
 * @returns true if err is a PictlError (and matches code if specified)
 */
export declare function isPictlError(err: unknown, code?: ErrorCode): err is PictlError;
//# sourceMappingURL=errors.d.ts.map
