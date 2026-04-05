/**
 * Error Model for wasm4pm Engine
 * Provides comprehensive error handling with classification, context, and recovery guidance
 */

/**
 * Error codes for wasm4pm operations
 * Used to classify and handle errors consistently across the engine
 */
export enum ErrorCode {
  // Configuration errors
  CONFIG_INVALID = "CONFIG_INVALID",
  CONFIG_INCOMPLETE = "CONFIG_INCOMPLETE",
  CONFIG_TYPE_MISMATCH = "CONFIG_TYPE_MISMATCH",

  // Source/input errors
  SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE",
  SOURCE_EMPTY = "SOURCE_EMPTY",
  SOURCE_TOO_LARGE = "SOURCE_TOO_LARGE",

  // Parsing errors
  PARSE_FAILED = "PARSE_FAILED",
  FORMAT_UNSUPPORTED = "FORMAT_UNSUPPORTED",
  SCHEMA_VIOLATION = "SCHEMA_VIOLATION",

  // Execution errors
  EXECUTION_FAILED = "EXECUTION_FAILED",
  HANDLE_NOT_FOUND = "HANDLE_NOT_FOUND",
  TYPE_MISMATCH = "TYPE_MISMATCH",
  RESOURCE_LIMIT_EXCEEDED = "RESOURCE_LIMIT_EXCEEDED",

  // State errors
  STATE_CORRUPTED = "STATE_CORRUPTED",
  OPERATION_NOT_ALLOWED = "OPERATION_NOT_ALLOWED",

  // Unknown errors
  UNKNOWN = "UNKNOWN",
}

/**
 * Describes the next action the caller should take to recover from an error
 */
export enum ErrorRecovery {
  RETRY = "RETRY",
  RECONFIGURE = "RECONFIGURE",
  REDUCE_SCOPE = "REDUCE_SCOPE",
  VALIDATE_INPUT = "VALIDATE_INPUT",
  FREE_RESOURCES = "FREE_RESOURCES",
  REINITIALIZE = "REINITIALIZE",
  CONTACT_SUPPORT = "CONTACT_SUPPORT",
}

/**
 * Enhanced error class with structured context for wasm4pm operations
 * Extends Error with error classification, root cause tracking, and recovery guidance
 */
export class Wasm4pmError extends Error {
  readonly code: ErrorCode;
  readonly cause: Error | null;
  readonly nextAction: ErrorRecovery;
  readonly step: string | null;
  readonly context: Record<string, unknown>;
  readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    options?: {
      cause?: Error | null;
      nextAction?: ErrorRecovery;
      step?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = "Wasm4pmError";
    this.code = code;
    this.cause = options?.cause || null;
    this.nextAction = options?.nextAction || ErrorRecovery.CONTACT_SUPPORT;
    this.step = options?.step || null;
    this.context = options?.context || {};
    this.timestamp = new Date();

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, Wasm4pmError.prototype);
  }

  /**
   * Returns a detailed error summary for logging and debugging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      step: this.step,
      nextAction: this.nextAction,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      cause: this.cause ? { message: this.cause.message, stack: this.cause.stack } : null,
      stack: this.stack,
    };
  }

  /**
   * Returns a user-friendly error message
   */
  toString(): string {
    const parts = [`[${this.code}]`, this.message];
    if (this.step) {
      parts.push(`(during: ${this.step})`);
    }
    return parts.join(" ");
  }
}

/**
 * Classifies raw WASM error strings to ErrorCode
 * Maps common error patterns to structured error codes for consistent handling
 *
 * @param raw - Raw error string from WASM module
 * @param context - Optional context including the execution step
 * @returns ErrorCode matching the error pattern
 */
export function classifyWasmError(raw: string, context?: { step?: string }): ErrorCode {
  if (!raw || typeof raw !== "string") {
    return ErrorCode.UNKNOWN;
  }

  const lowerRaw = raw.toLowerCase();

  // Handle not found
  if (lowerRaw.includes("not found")) {
    return ErrorCode.HANDLE_NOT_FOUND;
  }

  // Type mismatch
  if (lowerRaw.includes("is not a") || lowerRaw.includes("is not an") || lowerRaw.includes("object is not")) {
    return ErrorCode.TYPE_MISMATCH;
  }

  // Parsing failures
  if (lowerRaw.includes("invalid json") || lowerRaw.includes("failed to parse")) {
    return ErrorCode.PARSE_FAILED;
  }

  // Resource limits
  if (lowerRaw.includes("exceeds maximum") || lowerRaw.includes("exceeds limit")) {
    return ErrorCode.RESOURCE_LIMIT_EXCEEDED;
  }

  // Configuration issues
  if (
    lowerRaw.includes("missing") ||
    lowerRaw.includes("unknown operator") ||
    lowerRaw.includes("must have") ||
    lowerRaw.includes("field")
  ) {
    return ErrorCode.CONFIG_INVALID;
  }

  // Execution failures
  if (
    lowerRaw.includes("failed to lock") ||
    lowerRaw.includes("failed to store") ||
    lowerRaw.includes("failed to serialize")
  ) {
    return ErrorCode.EXECUTION_FAILED;
  }

  // Source/initialization issues
  if (lowerRaw.includes("failed to read") || lowerRaw.includes("not initialized")) {
    return ErrorCode.SOURCE_UNAVAILABLE;
  }

  return ErrorCode.UNKNOWN;
}

/**
 * Wraps a WASM function call with error handling and classification
 * Converts raw WASM errors to structured Wasm4pmError instances
 *
 * @template T - Return type of the wrapped function
 * @param fn - Function that calls WASM code
 * @param context - Optional context including the execution step
 * @returns Result of the function call
 * @throws Wasm4pmError - Classified and contextualized error
 */
export function wrapWasm<T>(fn: () => T, context?: { step?: string }): T {
  try {
    return fn();
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const code = classifyWasmError(raw, context);

    // Determine recovery action based on error code
    let nextAction = ErrorRecovery.CONTACT_SUPPORT;
    switch (code) {
      case ErrorCode.CONFIG_INVALID:
      case ErrorCode.CONFIG_INCOMPLETE:
      case ErrorCode.CONFIG_TYPE_MISMATCH:
        nextAction = ErrorRecovery.RECONFIGURE;
        break;
      case ErrorCode.SOURCE_UNAVAILABLE:
      case ErrorCode.SOURCE_EMPTY:
        nextAction = ErrorRecovery.VALIDATE_INPUT;
        break;
      case ErrorCode.RESOURCE_LIMIT_EXCEEDED:
        nextAction = ErrorRecovery.REDUCE_SCOPE;
        break;
      case ErrorCode.HANDLE_NOT_FOUND:
      case ErrorCode.STATE_CORRUPTED:
        nextAction = ErrorRecovery.REINITIALIZE;
        break;
      case ErrorCode.PARSE_FAILED:
        nextAction = ErrorRecovery.VALIDATE_INPUT;
        break;
      case ErrorCode.EXECUTION_FAILED:
        nextAction = ErrorRecovery.RETRY;
        break;
    }

    throw new Wasm4pmError(raw, code, {
      cause: err instanceof Error ? err : null,
      nextAction,
      step: context?.step || null,
    });
  }
}

/**
 * Type guard to check if an error is a Wasm4pmError
 * Optionally filters by specific error code
 *
 * @param err - Error to check
 * @param code - Optional specific ErrorCode to match
 * @returns true if err is a Wasm4pmError (and matches code if specified)
 */
export function isWasm4pmError(err: unknown, code?: ErrorCode): err is Wasm4pmError {
  if (!(err instanceof Wasm4pmError)) {
    return false;
  }
  if (code !== undefined) {
    return err.code === code;
  }
  return true;
}
